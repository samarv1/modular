"use client";

import type { ExtractedEntry } from "@/lib/resume-extraction-schema";

// Shared structured-field editor for one ExtractedEntry, built for the
// PDF-scan review screen (pdf-import-review-modal.tsx) and reused wherever
// else an existing bank_entry needs the same kind of editing (see
// bank-entry-fields.ts for the raw_latex <-> ExtractedEntry conversion that
// makes that reuse possible).

export function bulletsToText(bullets: string[]): string {
  return bullets.join("\n");
}

export function textToBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function HeaderFieldsEditor({
  header,
  onChange,
}: {
  header: { name: string; contactLine: string };
  onChange: (patch: Partial<{ name: string; contactLine: string }>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line-strong p-2.5">
      <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
        Name & Contact
      </div>
      <input
        value={header.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="min-w-0 border-b border-line-strong bg-transparent text-[12.5px] font-semibold outline-none focus:border-brand"
        placeholder="Name"
      />
      <input
        value={header.contactLine}
        onChange={(e) => onChange({ contactLine: e.target.value })}
        className="min-w-0 border-b border-line-strong bg-transparent text-[11.5px] outline-none focus:border-brand"
        placeholder="email | phone | links"
      />
    </div>
  );
}

export function EntryEditor({
  entry,
  onChange,
  onRemove,
}: {
  entry: ExtractedEntry;
  onChange: (patch: Partial<ExtractedEntry>) => void;
  onRemove?: () => void;
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
                onChange={(e) =>
                  onChange({ bullets: textToBullets(e.target.value) })
                }
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
                onChange={(e) =>
                  onChange({ bullets: textToBullets(e.target.value) })
                }
                placeholder="One bullet per line"
                rows={Math.max(2, entry.bullets?.length ?? 2)}
                className="min-w-0 resize-y rounded-sm border border-line-strong bg-transparent p-1.5 text-[11.5px] outline-none focus:border-brand"
              />
            </>
          )}
          {entry.kind === "section_chunk" && (
            <textarea
              value={(entry.items ?? []).join("\n")}
              onChange={(e) =>
                onChange({ items: textToBullets(e.target.value) })
              }
              placeholder="Category: values (one per line)"
              rows={Math.max(2, entry.items?.length ?? 2)}
              className="min-w-0 resize-y rounded-sm border border-line-strong bg-transparent p-1.5 text-[11.5px] outline-none focus:border-brand"
            />
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-fg hover:bg-danger/10 hover:text-danger"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
