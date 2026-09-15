"use client";

import { useMemo, useReducer, useRef } from "react";
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
import { groupEntriesBySection } from "@/lib/group-by-section";
import {
  EntryEditor,
  HeaderFieldsEditor,
} from "@/components/bank/entry-editor";
import type { BankEntryRow } from "@/lib/rows";
import type { ExtractedEntry } from "@/lib/resume-extraction-schema";
import { UploadZone } from "@/components/home/upload-zone";
import { PdfImportBody } from "@/components/home/pdf-import-review-modal";
import { EditSourceResumeBody } from "@/components/home/edit-source-resume-body";
import { ImportErrorMessage } from "@/components/home/import-error-message";
import {
  importReviewReducer,
  initialImportReviewState,
  type ImportPreviewEntry,
} from "@/lib/import-review-state";

// Preview mode is read-only, so closing the dialog before commit has no side effects.
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
  const [state, dispatch] = useReducer(
    importReviewReducer,
    initialImportReviewState,
  );
  const phase = state.phase;
  const review =
    state.phase === "review" || state.phase === "committing" ? state : null;
  const errorMessage = "message" in state ? state.message : undefined;
  const errorCode = "code" in state ? state.code : undefined;
  const previewGenerationRef = useRef(0);

  function reset() {
    previewGenerationRef.current += 1;
    dispatch({ type: "reset" });
  }

  function handleFileSelected(selected: File) {
    if (selected.name.toLowerCase().endsWith(".pdf")) {
      previewGenerationRef.current += 1;
      dispatch({ type: "select_pdf", file: selected });
      return;
    }
    loadPreview(selected);
  }

  function close() {
    previewGenerationRef.current += 1;
    onOpenChange(false);
  }

  async function loadPreview(selected: File) {
    const generation = ++previewGenerationRef.current;
    dispatch({ type: "preview_started", file: selected });
    try {
      const form = new FormData();
      form.set("file", selected);
      form.set("mode", "preview");
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (previewGenerationRef.current !== generation) return;
      if (res.ok && body?.compatible) {
        // Commit must reuse converted bytes to avoid charging for a second conversion.
        if (typeof body.convertedArchive === "string") {
          const bytes = Uint8Array.from(atob(body.convertedArchive), (c) =>
            c.charCodeAt(0),
          );
          selected = new File([bytes], selected.name, { type: selected.type });
        }
        const loaded: ImportPreviewEntry[] = (
          body.entries as (Omit<ImportPreviewEntry, "key"> & {
            index: number;
          })[]
        ).map((entry) => ({ ...entry, key: String(entry.index) }));
        dispatch({ type: "preview_loaded", file: selected, entries: loaded });
        return;
      }
      if (body?.mismatchReport) {
        dispatch({ type: "preview_mismatch", report: body.mismatchReport });
        return;
      }
      dispatch({
        type: "preview_failed",
        code:
          body?.code === "shared_key_cap_reached" ||
          body?.code === "byok_key_rejected"
            ? body.code
            : undefined,
        message:
          typeof body?.error === "string"
            ? body.error
            : "could not read that file",
      });
    } catch {
      if (previewGenerationRef.current !== generation) return;
      dispatch({ type: "preview_failed", message: "could not read that file" });
    }
  }

  function removeEntry(entry: ImportPreviewEntry) {
    dispatch({ type: "remove_entry", index: entry.index });
  }

  function updateEntryDraft(key: string, patch: Partial<ExtractedEntry>) {
    dispatch({ type: "update_entry", key, patch });
  }

  const { nonHeaderEntries, groups } = useMemo(() => {
    const visibleEntries =
      review?.entries.filter(
        (entry) => !review.removedIndices.has(entry.index),
      ) ?? [];
    const visibleNonHeaderEntries = visibleEntries.filter(
      (entry) => entry.kind !== "header_chunk",
    );
    return {
      nonHeaderEntries: visibleNonHeaderEntries,
      groups: groupEntriesBySection(
        visibleNonHeaderEntries,
        (entry) => entry.sourceSection,
      ).map(
        ({ key, entries: groupEntries }): [string, ImportPreviewEntry[]] => [
          key,
          groupEntries,
        ],
      ),
    };
  }, [review]);

  async function commitImport() {
    if (!review) return;
    dispatch({ type: "commit_started" });
    const overrides = review.entries
      .map((entry) => {
        const patch: Record<string, unknown> = { index: entry.index };
        let touched = false;
        if (review.removedIndices.has(entry.index)) {
          patch.excluded = true;
          touched = true;
        }
        if (entry.kind === "header_chunk") {
          if (
            review.headerDraft &&
            JSON.stringify(review.headerDraft) !==
              JSON.stringify(review.initialHeaderDraft)
          ) {
            patch.headerFields = review.headerDraft;
            touched = true;
          }
        } else if (
          JSON.stringify(review.entryDrafts[entry.key]) !==
          JSON.stringify(review.initialDrafts[entry.key])
        ) {
          patch.entryFields = review.entryDrafts[entry.key];
          touched = true;
        }
        return touched ? patch : null;
      })
      .filter((o): o is Record<string, unknown> => o !== null);
    try {
      const form = new FormData();
      form.set("file", review.file);
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
      dispatch({
        type: "commit_failed",
        code:
          body?.code === "shared_key_cap_reached" ||
          body?.code === "byok_key_rejected"
            ? body.code
            : undefined,
        message:
          typeof body?.error === "string"
            ? body.error
            : "upload failed, try again",
      });
    } catch {
      dispatch({ type: "commit_failed", message: "upload failed, try again" });
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
                  onRejected={(message) => {
                    dispatch({ type: "preview_failed", message });
                  }}
                />
                {errorMessage && (
                  <ImportErrorMessage message={errorMessage} code={errorCode} />
                )}
              </div>
            )}

            {state.phase === "pdf" && (
              <PdfImportBody
                file={state.file}
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

            {state.phase === "mismatch" && (
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-[12.5px] text-danger">
                  {state.report.reason}
                  {state.report.details.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4">
                      {state.report.details.map((detail, i) => (
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

                {/* The native scrollbar gutter prevents row reflow in this bounded list. */}
                <div className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                  {review?.headerDraft && (
                    <HeaderFieldsEditor
                      header={review.headerDraft}
                      onChange={(patch) =>
                        dispatch({ type: "update_header", patch })
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
                          entry={review!.entryDrafts[entry.key]}
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
                  <ImportErrorMessage message={errorMessage} code={errorCode} />
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
