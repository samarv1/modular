"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  EntryEditor,
  HeaderFieldsEditor,
} from "@/components/bank/entry-editor";
import {
  bankEntryToExtractedEntry,
  bankEntryToHeaderData,
} from "@/lib/bank-entry-fields";
import { sectionGroupLabel } from "@/lib/section-label";
import { groupEntriesBySection } from "@/lib/group-by-section";
import type { ExtractedEntry } from "@/lib/resume-extraction-schema";
import type { BankEntryRow } from "@/lib/rows";

type Phase = "loading" | "ready" | "saving";
type HeaderDraft = { name: string; contactLine: string };

export function EditSourceResumeBody({
  sourceResumeId,
  onSaved,
  onCancel,
}: {
  sourceResumeId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<BankEntryRow[]>([]);
  const [headerEntryId, setHeaderEntryId] = useState<string | null>(null);
  const [headerDraft, setHeaderDraft] = useState<HeaderDraft | null>(null);
  const [entryDrafts, setEntryDrafts] = useState<
    Record<string, ExtractedEntry>
  >({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [dirtyEntryIds, setDirtyEntryIds] = useState<Set<string>>(new Set());
  const [headerDirty, setHeaderDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/entries?sourceResumeId=${sourceResumeId}`,
        );
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !Array.isArray(body?.entries)) {
          setErrorMessage("This resume's entries could not be loaded.");
          setPhase("ready");
          return;
        }
        const all = body.entries as BankEntryRow[];
        const header = all.find((e) => e.kind === "header_chunk") ?? null;
        const rest = all.filter((e) => e.kind !== "header_chunk");
        setHeaderEntryId(header?.id ?? null);
        setHeaderDraft(header ? bankEntryToHeaderData(header) : null);
        setEntries(rest);
        setEntryDrafts(
          Object.fromEntries(
            rest.map((e) => [e.id, bankEntryToExtractedEntry(e)]),
          ),
        );
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setErrorMessage("This resume's entries could not be loaded.");
          setPhase("ready");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceResumeId]);

  const groups = useMemo(() => {
    return groupEntriesBySection(
      entries.filter((entry) => !removedIds.has(entry.id)),
      (entry) => entry.source_section,
    ).map(({ key, entries: groupEntries }): [string, BankEntryRow[]] => [
      key,
      groupEntries,
    ]);
  }, [entries, removedIds]);

  function updateEntry(id: string, patch: Partial<ExtractedEntry>) {
    setDirtyEntryIds((current) => new Set(current).add(id));
    setEntryDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch } as ExtractedEntry,
    }));
  }

  function removeEntry(id: string) {
    setRemovedIds((prev) => new Set(prev).add(id));
    setDirtyEntryIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function save() {
    setPhase("saving");
    setErrorMessage(null);
    try {
      const updates: Array<{
        id: string;
        entry?: ExtractedEntry;
        header?: HeaderDraft;
      }> = entries
        .filter(
          (entry) => dirtyEntryIds.has(entry.id) && !removedIds.has(entry.id),
        )
        .map((entry) => ({ id: entry.id, entry: entryDrafts[entry.id] }));
      if (headerDirty && headerEntryId && headerDraft) {
        updates.push({ id: headerEntryId, header: headerDraft });
      }
      const response = await fetch(`/api/source-resumes/${sourceResumeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates,
          deleteIds: Array.from(removedIds),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "some changes could not be saved",
        );
      }
      onSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "some changes could not be saved",
      );
      setPhase("ready");
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-4 animate-spin text-faint" />
      </div>
    );
  }

  if (!headerDraft && entries.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {errorMessage && (
          <span className="text-[11.5px] text-danger">{errorMessage}</span>
        )}
        <Button variant="outline" onClick={onCancel} className="self-start">
          Close
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        {headerDraft && (
          <HeaderFieldsEditor
            header={headerDraft}
            onChange={(patch) => {
              setHeaderDirty(true);
              setHeaderDraft({ ...headerDraft, ...patch });
            }}
          />
        )}

        {groups.map(([sourceSection, groupEntries]) => (
          <div key={sourceSection} className="flex flex-col gap-2">
            <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
              {sectionGroupLabel(sourceSection)}
            </div>
            {groupEntries.map((entry) => (
              <EntryEditor
                key={entry.id}
                entry={entryDrafts[entry.id]}
                onChange={(patch) => updateEntry(entry.id, patch)}
                onRemove={() => removeEntry(entry.id)}
              />
            ))}
          </div>
        ))}
      </div>

      {errorMessage && (
        <span className="text-[11.5px] text-danger">{errorMessage}</span>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={phase === "saving"}
        >
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={
            phase === "saving" ||
            (dirtyEntryIds.size === 0 && !headerDirty && removedIds.size === 0)
          }
        >
          {phase === "saving" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            "Save changes"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
