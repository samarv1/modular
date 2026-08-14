"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sectionGroupLabel } from "@/lib/section-label";
import {
  EntryEditor,
  HeaderFieldsEditor,
} from "@/components/bank/entry-editor";
import {
  bankEntryToExtractedEntry,
  bankEntryToHeaderData,
} from "@/lib/bank-entry-fields";
import type { ExtractedEntry } from "@/lib/resume-extraction-schema";
import type { BankEntryRow } from "@/lib/rows";
import { UploadZone } from "@/components/home/upload-zone";
import { PdfImportBody } from "@/components/home/pdf-import-review-modal";
import { EditSourceResumeBody } from "@/components/home/edit-source-resume-body";

interface PreviewEntry {
  key: string;
  // Position in the flat extraction order, used to build /api/imports'
  // overrides payload.
  index: number;
  kind: string;
  sourceSection: string;
  displayName: string;
  rawLatex: string;
  isDuplicate: boolean;
}

type Phase = "idle" | "loading" | "mismatch" | "review" | "committing" | "pdf";

// Owns two lifecycles inside the same Dialog shell:
//  - import: pick a file, preview what the extractor found (nothing
//    persisted yet), fix mistakes, then commit via POST /api/imports.
//  - edit (editSourceResume set): hands off entirely to
//    EditSourceResumeBody, which loads an already-imported upload's real
//    bank_entry rows into the same structured field editor the PDF-import
//    flow uses, and saves changes directly (PATCH/DELETE /api/entries/:id).
// Cancel before a successful commit is always a no-op for import mode
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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mismatchReport, setMismatchReport] = useState<{
    reason: string;
    details: string[];
  } | null>(null);
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [entryDrafts, setEntryDrafts] = useState<
    Record<string, ExtractedEntry>
  >({});
  const [initialDrafts, setInitialDrafts] = useState<
    Record<string, ExtractedEntry>
  >({});
  const [headerDraft, setHeaderDraft] = useState<{
    name: string;
    contactLine: string;
  } | null>(null);
  const [initialHeaderDraft, setInitialHeaderDraft] = useState<{
    name: string;
    contactLine: string;
  } | null>(null);

  function reset() {
    setPhase("idle");
    setFile(null);
    setPdfFile(null);
    setErrorMessage(null);
    setMismatchReport(null);
    setEntries([]);
    setRemovedIndices(new Set());
    setEntryDrafts({});
    setInitialDrafts({});
    setHeaderDraft(null);
    setInitialHeaderDraft(null);
  }

  // The shared UploadZone accepts both a LaTeX export (.zip) and a plain PDF
  // resume (see upload-zone.tsx) — a PDF has no LaTeX to parse, so it skips
  // straight to the structured-extraction review body (pdf-import-review-modal.tsx)
  // instead of loadPreview's mode=preview call to /api/imports.
  function handleFileSelected(selected: File) {
    if (selected.name.toLowerCase().endsWith(".pdf")) {
      setPdfFile(selected);
      setPhase("pdf");
      return;
    }
    loadPreview(selected);
  }

  function close() {
    onOpenChange(false);
  }

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
        const loaded: PreviewEntry[] = (
          body.entries as (Omit<PreviewEntry, "key"> & { index: number })[]
        ).map((entry) => ({ ...entry, key: String(entry.index) }));
        setEntries(loaded);
        setRemovedIndices(new Set());

        const header = loaded.find((e) => e.kind === "header_chunk") ?? null;
        const header0 = header
          ? bankEntryToHeaderData({ raw_latex: header.rawLatex })
          : null;
        setHeaderDraft(header0);
        setInitialHeaderDraft(header0);

        const drafts = Object.fromEntries(
          loaded
            .filter((e) => e.kind !== "header_chunk")
            .map((e) => [
              e.key,
              bankEntryToExtractedEntry({
                kind: e.kind,
                source_section: e.sourceSection,
                raw_latex: e.rawLatex,
                display_name: e.displayName,
              }),
            ]),
        );
        setEntryDrafts(drafts);
        setInitialDrafts(drafts);

        setPhase("review");
        return;
      }
      if (body?.mismatchReport) {
        setMismatchReport(body.mismatchReport);
        setPhase("mismatch");
        return;
      }
      setErrorMessage(
        typeof body?.error === "string"
          ? body.error
          : "could not read that file",
      );
      setPhase("idle");
    } catch {
      setErrorMessage("could not read that file");
      setPhase("idle");
    }
  }

  // Matches PdfImportBody's removeEntry: takes the entry out of the review
  // screen entirely (no reversible exclude toggle). The backend's own
  // exact-duplicate check in commitImport runs unconditionally regardless
  // of what's removed here, so a true duplicate is still silently skipped
  // even if left in.
  function removeEntry(entry: PreviewEntry) {
    setRemovedIndices((prev) => new Set(prev).add(entry.index));
  }

  function updateEntryDraft(key: string, patch: Partial<ExtractedEntry>) {
    setEntryDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch } as ExtractedEntry,
    }));
  }

  const visibleEntries = entries.filter((e) => !removedIndices.has(e.index));
  // The header entry is always committed (edited via HeaderFieldsEditor
  // above the sections, no Remove button), so it's left out of these counts,
  // otherwise "Approve (N)" and the summary line's entry count would
  // include something not listed in any section.
  const nonHeaderEntries = visibleEntries.filter(
    (e) => e.kind !== "header_chunk",
  );

  // Grouped by section, in first-appearance order, header entry excluded
  // (rendered separately via HeaderFieldsEditor, same as EditSourceResumeBody
  // and PdfImportBody). Mirrors the bank pane's own grouping so the review
  // screen reads like a preview of where things will land.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byLabel = new Map<string, PreviewEntry[]>();
    for (const entry of nonHeaderEntries) {
      if (!byLabel.has(entry.sourceSection)) {
        order.push(entry.sourceSection);
        byLabel.set(entry.sourceSection, []);
      }
      byLabel.get(entry.sourceSection)!.push(entry);
    }
    return order.map((label): [string, PreviewEntry[]] => [
      label,
      byLabel.get(label)!,
    ]);
  }, [nonHeaderEntries]);

  async function commitImport() {
    if (!file) return;
    setPhase("committing");
    setErrorMessage(null);
    const overrides = entries
      .map((entry) => {
        const patch: Record<string, unknown> = { index: entry.index };
        let touched = false;
        if (removedIndices.has(entry.index)) {
          patch.excluded = true;
          touched = true;
        }
        if (entry.kind === "header_chunk") {
          if (
            headerDraft &&
            JSON.stringify(headerDraft) !== JSON.stringify(initialHeaderDraft)
          ) {
            patch.headerFields = headerDraft;
            touched = true;
          }
        } else if (
          JSON.stringify(entryDrafts[entry.key]) !==
          JSON.stringify(initialDrafts[entry.key])
        ) {
          patch.entryFields = entryDrafts[entry.key];
          touched = true;
        }
        return touched ? patch : null;
      })
      .filter((o): o is Record<string, unknown> => o !== null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", "commit");
      if (overrides.length > 0)
        form.set("overrides", JSON.stringify(overrides));
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.compatible) {
        onImported(body.entries ?? []);
        close();
        return;
      }
      setErrorMessage(
        typeof body?.error === "string"
          ? body.error
          : "upload failed, try again",
      );
      setPhase("review");
    } catch {
      setErrorMessage("upload failed, try again");
      setPhase("review");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) reset();
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col sm:max-w-[640px]"
        showCloseButton={phase !== "committing"}
      >
        <DialogHeader>
          <DialogTitle>
            {editSourceResume
              ? `Edit "${editSourceResume.displayName}"`
              : phase === "pdf"
                ? "Review PDF upload"
                : "Review upload"}
          </DialogTitle>
        </DialogHeader>

        {editSourceResume ? (
          <EditSourceResumeBody
            sourceResumeId={editSourceResume.id}
            onSaved={() => {
              onImported([]);
              close();
            }}
            onCancel={close}
          />
        ) : (
          <>
            {phase === "idle" && (
              <div className="flex flex-col gap-2">
                <UploadZone
                  onFileSelected={handleFileSelected}
                  onRejected={setErrorMessage}
                />
                {errorMessage && (
                  <span className="text-[11.5px] text-danger">
                    {errorMessage}
                  </span>
                )}
              </div>
            )}

            {phase === "pdf" && pdfFile && (
              <PdfImportBody
                file={pdfFile}
                onImported={(imported) => {
                  onImported(imported);
                  close();
                }}
                onCancel={reset}
              />
            )}

            {phase === "loading" && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-4 animate-spin text-faint" />
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
                <Button
                  variant="outline"
                  onClick={reset}
                  className="self-start"
                >
                  Try another file
                </Button>
              </div>
            )}

            {(phase === "review" || phase === "committing") && (
              <>
                <div className="text-[11.5px] text-faint">
                  {`Found ${groups.length} section${groups.length === 1 ? "" : "s"}, ${nonHeaderEntries.length} entr${nonHeaderEntries.length === 1 ? "y" : "ies"}. Review and edit before uploading.`}
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
                  {headerDraft && (
                    <HeaderFieldsEditor
                      header={headerDraft}
                      onChange={(patch) =>
                        setHeaderDraft({ ...headerDraft, ...patch })
                      }
                    />
                  )}
                  {groups.map(([label, groupEntries]) => (
                    <div key={label} className="flex flex-col gap-2">
                      <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
                        {sectionGroupLabel(label)}
                      </div>
                      {groupEntries.map((entry) => (
                        <EntryEditor
                          key={entry.key}
                          entry={entryDrafts[entry.key]}
                          onChange={(patch) =>
                            updateEntryDraft(entry.key, patch)
                          }
                          onRemove={() => removeEntry(entry)}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {errorMessage && (
                  <span className="text-[11.5px] text-danger">
                    {errorMessage}
                  </span>
                )}

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={close}
                    disabled={phase === "committing"}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={commitImport}
                    disabled={
                      phase === "committing" || nonHeaderEntries.length === 0
                    }
                  >
                    {phase === "committing" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      `Approve (${nonHeaderEntries.length})`
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
