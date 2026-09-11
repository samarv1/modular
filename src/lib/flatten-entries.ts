import type { ExtractedResume } from "@/lib/adapters/types";

// Flat, index-stable view of every extracted entry, in the same order
// section-by-section that the DB insert eventually uses. `mode=preview` and
// `mode=commit` both derive this from an identical parse/extract of the same
// file, so an override's `index` addresses the same entry in either call.
export type FlatEntry = {
  index: number;
  kind: string;
  sourceSection: string;
  displayName: string;
  rawLatex: string;
  sourceOffsetStart: number | null;
  sourceOffsetEnd: number | null;
  requiredPackages: string[];
};

export function flattenEntries(extracted: ExtractedResume): FlatEntry[] {
  let index = 0;
  return extracted.sections.flatMap((section) =>
    section.entries.map((entry) => ({
      index: index++,
      kind: entry.kind,
      sourceSection: section.title,
      displayName: entry.displayName,
      rawLatex: entry.rawLatex,
      sourceOffsetStart: entry.sourceOffsetStart ?? null,
      sourceOffsetEnd: entry.sourceOffsetEnd ?? null,
      requiredPackages: entry.requiredPackages,
    })),
  );
}
