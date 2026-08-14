import type { MacroInfoRecord } from "@unified-latex/unified-latex-types";

// The Jake's Resume macro contract: names + xparse arg-count signatures.
// This is the fingerprint surface (see fingerprint.ts) and also what we hand
// to the parser so argument boundaries are attached correctly — without it,
// unified-latex has no way to know `\resumeSubheading` takes 4 groups.
export const JAKE_MACROS: MacroInfoRecord = {
  resumeItem: { signature: "m" },
  resumeSubItem: { signature: "m" },
  resumeSubheading: { signature: "m m m m" },
  resumeSubSubheading: { signature: "m m" },
  resumeProjectHeading: { signature: "m m" },
  resumeSubHeadingListStart: { signature: "" },
  resumeSubHeadingListEnd: { signature: "" },
  resumeItemListStart: { signature: "" },
  resumeItemListEnd: { signature: "" },
};

/** Macros whose presence + arg count define the Jake family (order matters for the fingerprint string). */
export const JAKE_CONTRACT_MACROS = [
  "resumeSubheading",
  "resumeProjectHeading",
  "resumeSubSubheading",
  "resumeItem",
  "resumeSubHeadingListStart",
  "resumeSubHeadingListEnd",
  "resumeItemListStart",
  "resumeItemListEnd",
] as const;

/** Macro names that start a bank entry within a resumeSubHeadingList. */
export const ENTRY_BOUNDARY_MACROS = new Set([
  "resumeSubheading",
  "resumeProjectHeading",
]);
