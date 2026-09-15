import type { ExtractedResume } from "@/lib/adapters/types";

// Preview and commit share this ordering, so override indices stay stable.
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
