"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EntryEditor, HeaderFieldsEditor } from "@/components/bank/entry-editor";
import { bankEntryToExtractedEntry, bankEntryToHeaderData } from "@/lib/bank-entry-fields";
import { sectionGroupLabel } from "@/lib/section-label";
import type { ExtractedEntry } from "@/lib/resume-extraction-schema";
import type { BankEntryRow } from "@/lib/rows";

type Phase = "loading" | "ready" | "saving";
type HeaderDraft = { name: string; contactLine: string };

// The structured-field counterpart to PdfImportBody, for editing entries
// that already exist in the bank (opened from the desktop's Bank folder,
// see import-review-modal.tsx's editSourceResume mode) rather than
// reviewing a fresh extraction before it's committed. Reconstructs an
// editable field set from each entry's immutable raw_latex
// (bank-entry-fields.ts) and, on save, PATCHes each entry back with its
// current fields — the API regenerates raw_latex server-side (see
// /api/entries/[id]/route.ts).
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
  const [entryDrafts, setEntryDrafts] = useState<Record<string, ExtractedEntry>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/entries?sourceResumeId=${sourceResumeId}`);
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
        setEntryDrafts(Object.fromEntries(rest.map((e) => [e.id, bankEntryToExtractedEntry(e)])));
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

  // First-appearance order, mirroring the bank pane's own section grouping.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byLabel = new Map<string, BankEntryRow[]>();
    for (const entry of entries) {
      if (removedIds.has(entry.id)) continue;
      if (!byLabel.has(entry.source_section)) {
        order.push(entry.source_section);
        byLabel.set(entry.source_section, []);
      }
      byLabel.get(entry.source_section)!.push(entry);
    }
    return order.map((label): [string, BankEntryRow[]] => [label, byLabel.get(label)!]);
  }, [entries, removedIds]);

  function updateEntry(id: string, patch: Partial<ExtractedEntry>) {
    setDirty(true);
    setEntryDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } as ExtractedEntry }));
  }

  function removeEntry(id: string) {
    setDirty(true);
    setRemovedIds((prev) => new Set(prev).add(id));
  }

  async function save() {
    setPhase("saving");
    setErrorMessage(null);
    try {
      const patches = entries
        .filter((e) => !removedIds.has(e.id))
        .map((e) =>
          fetch(`/api/entries/${e.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry: entryDrafts[e.id] }),
          }),
        );
      const headerPatch =
        headerEntryId && headerDraft
          ? [
              fetch(`/api/entries/${headerEntryId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ header: headerDraft }),
              }),
            ]
          : [];
      const deletes = Array.from(removedIds).map((id) => fetch(`/api/entries/${id}`, { method: "DELETE" }));

      const results = await Promise.all([...patches, ...headerPatch, ...deletes]);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const body = await failed.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "some changes could not be saved");
      }
      onSaved();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "some changes could not be saved");
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
        {errorMessage && <span className="text-[11.5px] text-danger">{errorMessage}</span>}
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
              setDirty(true);
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

      {errorMessage && <span className="text-[11.5px] text-danger">{errorMessage}</span>}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={phase === "saving"}>
          Cancel
        </Button>
        <Button onClick={save} disabled={phase === "saving" || !dirty}>
          {phase === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}
