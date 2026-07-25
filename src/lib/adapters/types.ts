// Minimal structural typing over unified-latex AST nodes. The library's own
// types are a deep discriminated union that's awkward to narrow through a
// generic tree walk; this covers exactly the shapes the adapters consume.
export interface LatexNode {
  type: string;
  content?: LatexNode[] | string;
  env?: string;
  args?: LatexArgument[];
  position?: { start: { offset: number }; end: { offset: number } };
}

export interface LatexArgument {
  type: "argument";
  content: LatexNode[];
  openMark: string;
  closeMark: string;
}

export interface ParsedLatexProject {
  /** Path of the single root .tex file within the uploaded archive. */
  rootFile: string;
  /** Full raw source of the root file, used for source-range slicing. */
  source: string;
}

export interface DetectionResult {
  compatible: boolean;
  adapterId: string;
  /** Macro-contract fingerprint; present only when compatible. */
  fingerprint?: string;
  /** Present only when compatible === false. */
  mismatchReport?: {
    reason: string;
    details: string[];
  };
}

export type BankEntryKind = "subheading_entry" | "project_entry" | "section_chunk";

export interface ExtractedEntry {
  kind: BankEntryKind;
  sourceSection: string;
  displayName: string;
  rawLatex: string;
  sourceOffsetStart: number;
  sourceOffsetEnd: number;
  requiredPackages: string[];
}

export interface ExtractedSection {
  title: string;
  entries: ExtractedEntry[];
}

export interface ExtractedResume {
  fingerprint: string;
  preamble: string;
  requiredPackages: string[];
  sections: ExtractedSection[];
}

export interface ResumeComposition {
  sections: {
    title: string;
    entries: { rawLatex: string }[];
  }[];
}

export interface AssembledLatexProject {
  source: string;
}

export interface TemplateAdapter {
  id: string;
  detect(project: ParsedLatexProject): DetectionResult;
  extract(project: ParsedLatexProject): ExtractedResume;
  assemble(input: ResumeComposition): AssembledLatexProject;
}
