"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sectionGroupLabel } from "@/lib/section-label";
import { parseJakeEntryPreview } from "@/lib/jake-entry-preview";
import type { BankEntryRow } from "@/lib/rows";
import { UploadZone } from "@/components/home/upload-zone";

interface PreviewEntry {
  key: string;
  // Import mode only (position in the flat extraction order, used to
  // build /api/imports' overrides payload).
  index?: number;
  // Edit mode only (the real bank_entry id, used for PATCH/DELETE calls).
  entryId?: string;
  kind: string;
  sourceSection: string;
  displayName: string;
  rawLatex: string;
  isDuplicate: boolean;
}

interface EntryEdit {
  displayName?: string;
  excluded?: boolean;
  // Set when the user explicitly re-includes an entry that was auto-excluded
  // for being a duplicate. Tells the commit route to skip its own
  // exact-duplicate filter for this one instead of silently dropping it.
  includeDuplicate?: boolean;
}

type Phase = "idle" | "loading" | "mismatch" | "review" | "committing";

// Owns two lifecycles that share the same review UI:
//  - import: pick a file, preview what the extractor found (nothing
//    persisted yet), fix mistakes, then commit via POST /api/imports.
//  - edit (editSourceResume set): load an already-imported upload's real
//    bank_entry rows and let the user rename/remove them directly (PATCH /
//    DELETE /api/entries/:id), "edit it as if importing for the first
//    time" per the desktop's Bank folder.
// Cancel before a successful commit/save is always a no-op for import mode
// (mode=preview never touches storage or the DB); for edit mode it just
// discards the local, unsaved edits.
export function ImportReviewModal({
  open,
  onOpenChange,
  onImported,
  editSourceResume,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (entries: BankEntryRow[]) => void;
  editSourceResume?: { id: string; displayName: string } | null;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mismatchReport, setMismatchReport] = useState<{ reason: string; details: string[] } | null>(
    null,
  );
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [edits, setEdits] = useState<Record<string, EntryEdit>>({});

  function reset() {
    setPhase("idle");
    setFile(null);
    setErrorMessage(null);
    setMismatchReport(null);
    setEntries([]);
    setEdits({});
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function loadExisting(sourceResumeId: string) {
    setPhase("loading");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/entries?sourceResumeId=${sourceResumeId}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body?.entries)) {
        setErrorMessage("This resume's entries could not be loaded.");
        setPhase("review");
        return;
      }
      const mapped: PreviewEntry[] = (body.entries as BankEntryRow[]).map((entry) => ({
        key: entry.id,
        entryId: entry.id,
        kind: entry.kind,
        sourceSection: entry.source_section,
        displayName: entry.display_name,
        rawLatex: entry.raw_latex,
        isDuplicate: false,
      }));
      setEntries(mapped);
      setEdits({});
      setPhase("review");
    } catch {
      setErrorMessage("This resume's entries could not be loaded.");
      setPhase("review");
    }
  }

  // Opening in edit mode skips the file-picking phase entirely and loads
  // straight into a review of that upload's real entries. Deferred a tick
  // (not called directly) so the resulting setPhase("loading") doesn't fire
  // synchronously inside the effect itself.
  useEffect(() => {
    if (!open || !editSourceResume) return;
    const sourceResumeId = editSourceResume.id;
    Promise.resolve().then(() => loadExisting(sourceResumeId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editSourceResume?.id]);

  async function loadPreview(selected: File) {
    setFile(selected);
    setPhase("loading");
    setErrorMessage(null);
    try {
      const form = new FormData();
      form.set("file", selected);
      form.set("mode", "preview");
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.compatible) {
        setEntries(
          (body.entries as (Omit<PreviewEntry, "key"> & { index: number })[]).map((entry) => ({
            ...entry,
            key: String(entry.index),
          })),
        );
        setEdits({});
        setPhase("review");
        return;
      }
      if (body?.mismatchReport) {
        setMismatchReport(body.mismatchReport);
        setPhase("mismatch");
        return;
      }
      setErrorMessage(typeof body?.error === "string" ? body.error : "could not read that file");
      setPhase("idle");
    } catch {
      setErrorMessage("could not read that file");
      setPhase("idle");
    }
  }

  function updateEdit(key: string, patch: EntryEdit) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  // Duplicates default to excluded unless the user explicitly opts back in
  // (see PreviewEntryRow): an entry with no edit yet falls back to its
  // isDuplicate flag rather than always-included. Always false in edit
  // mode, so existing entries start included, matching "edit it as if
  // importing for the first time."
  function isExcluded(entry: PreviewEntry): boolean {
    return edits[entry.key]?.excluded ?? entry.isDuplicate;
  }

  const includedCount = entries.filter((e) => !isExcluded(e)).length;
  const duplicateCount = entries.filter((e) => e.isDuplicate).length;
  const hasChanges = Object.keys(edits).length > 0;

  // Grouped by section, in first-appearance order. Mirrors the bank pane's
  // own grouping so the review screen reads like a preview of where things
  // will land.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byLabel = new Map<string, PreviewEntry[]>();
    for (const entry of entries) {
      if (!byLabel.has(entry.sourceSection)) {
        order.push(entry.sourceSection);
        byLabel.set(entry.sourceSection, []);
      }
      byLabel.get(entry.sourceSection)!.push(entry);
    }
    return order.map((label): [string, PreviewEntry[]] => [label, byLabel.get(label)!]);
  }, [entries]);

  async function saveEdits() {
    setPhase("committing");
    setErrorMessage(null);
    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        const edit = edits[entry.key];
        if (!edit || !entry.entryId) return;
        if (edit.excluded) {
          const res = await fetch(`/api/entries/${entry.entryId}`, { method: "DELETE" });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(typeof body?.error === "string" ? body.error : "could not remove an entry");
          }
          return;
        }
        if (edit.displayName !== undefined) {
          const res = await fetch(`/api/entries/${entry.entryId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayName: edit.displayName }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(typeof body?.error === "string" ? body.error : "could not rename an entry");
          }
        }
      }),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) {
      setErrorMessage(failed.reason instanceof Error ? failed.reason.message : "some changes could not be saved");
      setPhase("review");
      return;
    }
    onImported([]);
    close();
  }

  async function commitImport() {
    if (!file) return;
    setPhase("committing");
    setErrorMessage(null);
    const overrides = Object.entries(edits)
      .map(([key, patch]) => ({ index: Number(key), ...patch }))
      .filter(
        (o) => o.displayName !== undefined || o.excluded !== undefined || o.includeDuplicate !== undefined,
      );
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", "commit");
      if (overrides.length > 0) form.set("overrides", JSON.stringify(overrides));
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.compatible) {
        onImported(body.entries ?? []);
        close();
        return;
      }
      setErrorMessage(typeof body?.error === "string" ? body.error : "import failed, try again");
      setPhase("review");
    } catch {
      setErrorMessage("import failed, try again");
      setPhase("review");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[640px]" showCloseButton={phase !== "committing"}>
        <DialogHeader>
          <DialogTitle>{editSourceResume ? `Edit "${editSourceResume.displayName}"` : "Review import"}</DialogTitle>
        </DialogHeader>

        {phase === "idle" && !editSourceResume && (
          <div className="flex flex-col gap-2">
            <UploadZone onFileSelected={loadPreview} onRejected={setErrorMessage} />
            {errorMessage && <span className="text-[11.5px] text-danger">{errorMessage}</span>}
          </div>
        )}

        {phase === "loading" && (
          <div className="py-8 text-center text-[12.5px] text-faint">
            {editSourceResume ? "Loading…" : "Parsing your resume…"}
          </div>
        )}

        {phase === "mismatch" && mismatchReport && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-[12.5px] text-danger">
              {mismatchReport.reason}
              {mismatchReport.details.length > 0 && (
                <ul className="mt-1.5 list-disc pl-4">
                  {mismatchReport.details.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
            <Button variant="outline" onClick={reset} className="self-start">
              Try another file
            </Button>
          </div>
        )}

        {(phase === "review" || phase === "committing") && (
          <>
            <div className="text-[11.5px] text-faint">
              {`Found ${groups.length} section${groups.length === 1 ? "" : "s"}, ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`}
              {duplicateCount > 0 && ` ${duplicateCount} already in your bank.`}
              {" View simplified previews."}
            </div>

            {/* Bounded + self-scrolling, independent of the dialog's own
                sizing (the entry list is the only part that can get long,
                many sections, so it's the only part that scrolls). Header,
                summary, and footer stay put above/below it. Plain
                overflow-y-auto, not the app's ScrollArea (its Root didn't
                reliably pick up a bounded height from just max-h inside
                this Dialog, which reintroduced the earlier
                content-spilling-past-the-card bug). scrollbar-gutter:stable
                reserves the native scrollbar's width up front instead, so
                it doesn't reflow row content when it appears mid-scroll
                (the actual cause of the flicker). */}
            <div className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
              {groups.map(([label, groupEntries]) => (
                <div key={label} className="flex flex-col gap-2">
                  <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
                    {sectionGroupLabel(label)}
                  </div>
                  {groupEntries.map((entry) => (
                    <PreviewEntryRow
                      key={entry.key}
                      entry={entry}
                      edit={edits[entry.key]}
                      onEdit={(patch) => updateEdit(entry.key, patch)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {errorMessage && <span className="text-[11.5px] text-danger">{errorMessage}</span>}

            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={phase === "committing"}>
                Cancel
              </Button>
              <Button
                onClick={editSourceResume ? saveEdits : commitImport}
                disabled={phase === "committing" || (editSourceResume ? !hasChanges : includedCount === 0)}
              >
                {phase === "committing"
                  ? editSourceResume
                    ? "Saving…"
                    : "Importing…"
                  : editSourceResume
                    ? "Save changes"
                    : `Approve (${includedCount})`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewEntryRow({
  entry,
  edit,
  onEdit,
}: {
  entry: PreviewEntry;
  edit: EntryEdit | undefined;
  onEdit: (patch: EntryEdit) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  // Duplicates start excluded. The user can still click Include to bring
  // one in anyway (see route.ts's includeDuplicate override).
  const excluded = edit?.excluded ?? entry.isDuplicate;
  const displayName = edit?.displayName ?? entry.displayName;
  const preview = useMemo(
    () => parseJakeEntryPreview(entry.kind, entry.rawLatex),
    [entry.kind, entry.rawLatex],
  );

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border border-line-strong p-2.5 ${excluded ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            value={displayName}
            onChange={(e) => onEdit({ displayName: e.target.value })}
            disabled={excluded}
            className="min-w-0 border-b border-line-strong bg-transparent text-[12.5px] font-semibold outline-none focus:border-brand disabled:cursor-not-allowed"
          />
          {entry.isDuplicate && <span className="text-[10.5px] text-danger">Already in your bank.</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-fg hover:bg-surface-sunken hover:text-brand"
          >
            {showPreview ? "Hide" : "View"}
          </button>
          <button
            type="button"
            onClick={() =>
              onEdit({
                excluded: !excluded,
                ...(entry.isDuplicate ? { includeDuplicate: true } : {}),
              })
            }
            className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
              excluded
                ? "text-brand hover:bg-surface-sunken"
                : "text-muted-fg hover:bg-danger/10 hover:text-danger"
            }`}
          >
            {excluded ? "Include" : "Exclude"}
          </button>
        </div>
      </div>
      {showPreview && (
        // Same rendered "what does this look like" preview as the bank
        // pane's entry dialog (src/lib/jake-entry-preview.ts): a light,
        // non-authoritative read of the macros, not a real LaTeX compile,
        // so exact layout (centering, hyperlink styling, the real `|`
        // separator) won't match (see the summary line's caption above).
        <div className="rounded-sm border border-line-strong bg-white p-4 font-latex text-[13px] text-[#111] shadow-[0_1px_0_var(--line-strong)]">
          {preview.title && (
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[14px] font-bold">{preview.title}</div>
              {preview.subtitle && <div className="shrink-0 text-[12px]">{preview.subtitle}</div>}
            </div>
          )}
          {(preview.meta || preview.location) && (
            <div
              className={`mt-0.5 flex items-baseline justify-between gap-3 text-[12px] ${entry.kind === "header_chunk" ? "" : "italic"}`}
            >
              <span>{preview.meta}</span>
              <span className="shrink-0">{preview.location}</span>
            </div>
          )}
          {preview.bullets.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] not-italic">
              {preview.bullets.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
