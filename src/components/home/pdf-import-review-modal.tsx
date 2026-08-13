"use client";

import { useEffect, useState } from "react";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EntryEditor, HeaderFieldsEditor } from "@/components/bank/entry-editor";
import type { ExtractedEntry, ResumeExtraction } from "@/lib/resume-extraction-schema";
import type { BankEntryRow } from "@/lib/rows";

type Phase = "loading" | "review" | "committing";

function withEntry(
  extraction: ResumeExtraction,
  sectionIndex: number,
  entryIndex: number,
  patch: Partial<ExtractedEntry>,
): ResumeExtraction {
  const sections = extraction.sections.map((section, si) => {
    if (si !== sectionIndex) return section;
    const entries = section.entries.map((entry, ei) =>
      ei === entryIndex ? ({ ...entry, ...patch } as ExtractedEntry) : entry,
    );
    return { ...section, entries };
  });
  return { ...extraction, sections };
}

function removeEntry(extraction: ResumeExtraction, sectionIndex: number, entryIndex: number): ResumeExtraction {
  const sections = extraction.sections
    .map((section, si) => {
      if (si !== sectionIndex) return section;
      return { ...section, entries: section.entries.filter((_, ei) => ei !== entryIndex) };
    })
    .filter((section) => section.entries.length > 0);
  return { ...extraction, sections };
}

// A PDF/markdown-derived import can't be reviewed as raw LaTeX the way a real
// .tex upload is (see import-review-modal.tsx) — there's no source LaTeX
// yet, only the LLM's structured extraction, so the review surface here is
// editable structured fields instead. Rendered by ImportReviewModal inside
// its shared Dialog shell once the picked file turns out to be a .pdf.
export function PdfImportBody({
  file,
  onImported,
  onCancel,
}: {
  file: File;
  onImported: (entries: BankEntryRow[]) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [extraction, setExtraction] = useState<ResumeExtraction | null>(null);
  const [filenameHint, setFilenameHint] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("mode", "preview");
        const res = await fetch("/api/pdf-imports", { method: "POST", body: form });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.extraction) {
          setErrorMessage(typeof body?.error === "string" ? body.error : "could not read that PDF");
          setPhase("review");
          return;
        }
        setExtraction(body.extraction);
        setFilenameHint(typeof body.filenameHint === "string" ? body.filenameHint : "");
        setPhase("review");
      } catch {
        if (!cancelled) {
          setErrorMessage("could not read that PDF");
          setPhase("review");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  async function commit() {
    if (!extraction) return;
    setPhase("committing");
    setErrorMessage(null);
    try {
      const form = new FormData();
      form.set("mode", "commit");
      form.set("extraction", JSON.stringify(extraction));
      form.set("filenameHint", filenameHint);
      const res = await fetch("/api/pdf-imports", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.compatible) {
        onImported(body.entries ?? []);
        return;
      }
      setErrorMessage(typeof body?.error === "string" ? body.error : "import failed, try again");
      setPhase("review");
    } catch {
      setErrorMessage("import failed, try again");
      setPhase("review");
    }
  }

  if (phase === "loading") {
    return <div className="py-8 text-center text-[12.5px] text-faint">Reading your PDF…</div>;
  }

  if (!extraction) {
    return (
      <div className="flex flex-col gap-3">
        {errorMessage && <span className="text-[11.5px] text-danger">{errorMessage}</span>}
        <Button variant="outline" onClick={onCancel} className="self-start">
          Try another file
        </Button>
      </div>
    );
  }

  const entryCount = extraction.sections.reduce((n, s) => n + s.entries.length, 0);

  return (
    <>
      <div className="text-[11.5px] text-faint">
        {`Extracted ${extraction.sections.length} section${extraction.sections.length === 1 ? "" : "s"}, ${entryCount} entr${entryCount === 1 ? "y" : "ies"}. Review and edit before importing — AI extraction can misread dates or group bullets incorrectly.`}
      </div>

      <div className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        <HeaderFieldsEditor
          header={extraction.header}
          onChange={(patch) => setExtraction({ ...extraction, header: { ...extraction.header, ...patch } })}
        />

        {extraction.sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="flex flex-col gap-2">
            <input
              value={section.title}
              onChange={(e) => {
                const sections = extraction.sections.map((s, i) =>
                  i === sectionIndex ? { ...s, title: e.target.value } : s,
                );
                setExtraction({ ...extraction, sections });
              }}
              className="w-fit border-b border-line-strong bg-transparent font-mono text-[10.5px] uppercase tracking-wide text-muted-fg outline-none focus:border-brand"
            />
            {section.entries.map((entry, entryIndex) => (
              <EntryEditor
                key={entryIndex}
                entry={entry}
                onChange={(patch) => setExtraction(withEntry(extraction, sectionIndex, entryIndex, patch))}
                onRemove={() => setExtraction(removeEntry(extraction, sectionIndex, entryIndex))}
              />
            ))}
          </div>
        ))}
      </div>

      {errorMessage && <span className="text-[11.5px] text-danger">{errorMessage}</span>}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={phase === "committing"}>
          Cancel
        </Button>
        <Button onClick={commit} disabled={phase === "committing" || entryCount === 0}>
          {phase === "committing" ? "Importing…" : `Approve (${entryCount})`}
        </Button>
      </DialogFooter>
    </>
  );
}

