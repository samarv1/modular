"use client";

import { useEffect, useState } from "react";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
        <div className="flex flex-col gap-2 rounded-md border border-line-strong p-2.5">
          <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">Name & Contact</div>
          <input
            value={extraction.header.name}
            onChange={(e) => setExtraction({ ...extraction, header: { ...extraction.header, name: e.target.value } })}
            className="min-w-0 border-b border-line-strong bg-transparent text-[12.5px] font-semibold outline-none focus:border-brand"
            placeholder="Name"
          />
          <input
            value={extraction.header.contactLine}
            onChange={(e) =>
              setExtraction({ ...extraction, header: { ...extraction.header, contactLine: e.target.value } })
            }
            className="min-w-0 border-b border-line-strong bg-transparent text-[11.5px] outline-none focus:border-brand"
            placeholder="email | phone | links"
          />
        </div>

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

function bulletsToText(bullets: string[]): string {
  return bullets.join("\n");
}

function textToBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function EntryEditor({
  entry,
  onChange,
  onRemove,
}: {
  entry: ExtractedEntry;
  onChange: (patch: Partial<ExtractedEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line-strong p-2.5">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {entry.kind === "subheading_entry" && (
            <>
              <div className="flex gap-2">
                <input
                  value={entry.title ?? ""}
                  onChange={(e) => onChange({ title: e.target.value })}
                  placeholder="Title / role"
                  className="min-w-0 flex-1 border-b border-line-strong bg-transparent text-[12.5px] font-semibold outline-none focus:border-brand"
                />
                <input
                  value={entry.date ?? ""}
                  onChange={(e) => onChange({ date: e.target.value })}
                  placeholder="Date"
                  className="w-32 shrink-0 border-b border-line-strong bg-transparent text-[11.5px] outline-none focus:border-brand"
                />
              </div>
              <div className="flex gap-2">
                <input
                  value={entry.organization ?? ""}
                  onChange={(e) => onChange({ organization: e.target.value })}
                  placeholder="Organization"
                  className="min-w-0 flex-1 border-b border-line-strong bg-transparent text-[11.5px] italic outline-none focus:border-brand"
                />
                <input
                  value={entry.location ?? ""}
                  onChange={(e) => onChange({ location: e.target.value })}
                  placeholder="Location"
                  className="w-32 shrink-0 border-b border-line-strong bg-transparent text-[11.5px] italic outline-none focus:border-brand"
                />
              </div>
              <textarea
                value={bulletsToText(entry.bullets ?? [])}
                onChange={(e) => onChange({ bullets: textToBullets(e.target.value) })}
                placeholder="One bullet per line"
                rows={Math.max(2, entry.bullets?.length ?? 2)}
                className="min-w-0 resize-y rounded-sm border border-line-strong bg-transparent p-1.5 text-[11.5px] outline-none focus:border-brand"
              />
            </>
          )}
          {entry.kind === "project_entry" && (
            <>
              <div className="flex gap-2">
                <input
                  value={entry.title ?? ""}
                  onChange={(e) => onChange({ title: e.target.value })}
                  placeholder="Project name"
                  className="min-w-0 flex-1 border-b border-line-strong bg-transparent text-[12.5px] font-semibold outline-none focus:border-brand"
                />
                <input
                  value={entry.date ?? ""}
                  onChange={(e) => onChange({ date: e.target.value })}
                  placeholder="Date"
                  className="w-32 shrink-0 border-b border-line-strong bg-transparent text-[11.5px] outline-none focus:border-brand"
                />
              </div>
              <input
                value={entry.stack ?? ""}
                onChange={(e) => onChange({ stack: e.target.value })}
                placeholder="Stack (optional)"
                className="min-w-0 border-b border-line-strong bg-transparent text-[11.5px] italic outline-none focus:border-brand"
              />
              <textarea
                value={bulletsToText(entry.bullets ?? [])}
                onChange={(e) => onChange({ bullets: textToBullets(e.target.value) })}
                placeholder="One bullet per line"
                rows={Math.max(2, entry.bullets?.length ?? 2)}
                className="min-w-0 resize-y rounded-sm border border-line-strong bg-transparent p-1.5 text-[11.5px] outline-none focus:border-brand"
              />
            </>
          )}
          {entry.kind === "section_chunk" && (
            <textarea
              value={(entry.items ?? []).join("\n")}
              onChange={(e) => onChange({ items: textToBullets(e.target.value) })}
              placeholder="Category: values (one per line)"
              rows={Math.max(2, entry.items?.length ?? 2)}
              className="min-w-0 resize-y rounded-sm border border-line-strong bg-transparent p-1.5 text-[11.5px] outline-none focus:border-brand"
            />
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-fg hover:bg-danger/10 hover:text-danger"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
