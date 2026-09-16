import {
  bankEntryToExtractedEntry,
  bankEntryToHeaderData,
} from "@/lib/bank-entry-fields";
import type { ExtractedEntry } from "@/lib/resume-extraction-schema";

export interface ImportPreviewEntry {
  key: string;
  index: number;
  kind: string;
  sourceSection: string;
  displayName: string;
  rawLatex: string;
  isDuplicate: boolean;
}

type HeaderDraft = { name: string; contactLine: string };
type ImportError = { message: string; code?: string };
type ReviewFields = {
  file: File;
  entries: ImportPreviewEntry[];
  removedIndices: Set<number>;
  entryDrafts: Record<string, ExtractedEntry>;
  initialDrafts: Record<string, ExtractedEntry>;
  headerDraft: HeaderDraft | null;
  initialHeaderDraft: HeaderDraft | null;
};

export type ImportReviewState =
  | ({ phase: "idle" } & Partial<ImportError>)
  | { phase: "loading"; file: File }
  | {
      phase: "mismatch";
      report: { reason: string; details: string[] };
    }
  | { phase: "pdf"; file: File }
  | ({ phase: "review" } & ReviewFields & Partial<ImportError>)
  | ({ phase: "committing" } & ReviewFields & Partial<ImportError>);

export type ImportReviewAction =
  | { type: "reset" }
  | { type: "select_pdf"; file: File }
  | { type: "preview_started"; file: File }
  | {
      type: "preview_loaded";
      file: File;
      entries: ImportPreviewEntry[];
    }
  | {
      type: "preview_failed";
      message: string;
      code?: string;
    }
  | {
      type: "preview_mismatch";
      report: { reason: string; details: string[] };
    }
  | { type: "remove_entry"; index: number }
  | {
      type: "update_entry";
      key: string;
      patch: Partial<ExtractedEntry>;
    }
  | { type: "update_header"; patch: Partial<HeaderDraft> }
  | { type: "commit_started" }
  | { type: "commit_failed"; message: string; code?: string };

export const initialImportReviewState: ImportReviewState = { phase: "idle" };

function reviewFields(file: File, entries: ImportPreviewEntry[]): ReviewFields {
  const header = entries.find((entry) => entry.kind === "header_chunk");
  const headerDraft = header
    ? bankEntryToHeaderData({ raw_latex: header.rawLatex })
    : null;
  const entryDrafts = Object.fromEntries(
    entries
      .filter((entry) => entry.kind !== "header_chunk")
      .map((entry) => [
        entry.key,
        bankEntryToExtractedEntry({
          kind: entry.kind,
          source_section: entry.sourceSection,
          raw_latex: entry.rawLatex,
          display_name: entry.displayName,
        }),
      ]),
  );
  return {
    file,
    entries,
    removedIndices: new Set(),
    entryDrafts,
    initialDrafts: entryDrafts,
    headerDraft,
    initialHeaderDraft: headerDraft,
  };
}

export function importReviewReducer(
  state: ImportReviewState,
  action: ImportReviewAction,
): ImportReviewState {
  switch (action.type) {
    case "reset":
      return initialImportReviewState;
    case "select_pdf":
      return { phase: "pdf", file: action.file };
    case "preview_started":
      return { phase: "loading", file: action.file };
    case "preview_loaded":
      return {
        phase: "review",
        ...reviewFields(action.file, action.entries),
      };
    case "preview_failed":
      return { phase: "idle", message: action.message, code: action.code };
    case "preview_mismatch":
      return { phase: "mismatch", report: action.report };
    case "remove_entry":
      if (state.phase !== "review" && state.phase !== "committing")
        return state;
      return {
        ...state,
        removedIndices: new Set(state.removedIndices).add(action.index),
      };
    case "update_entry":
      if (state.phase !== "review" && state.phase !== "committing")
        return state;
      return {
        ...state,
        entryDrafts: {
          ...state.entryDrafts,
          [action.key]: {
            ...state.entryDrafts[action.key],
            ...action.patch,
          } as ExtractedEntry,
        },
      };
    case "update_header":
      if (
        (state.phase !== "review" && state.phase !== "committing") ||
        !state.headerDraft
      )
        return state;
      return {
        ...state,
        headerDraft: { ...state.headerDraft, ...action.patch },
      };
    case "commit_started":
      if (state.phase !== "review") return state;
      return {
        ...state,
        phase: "committing",
        message: undefined,
        code: undefined,
      };
    case "commit_failed":
      if (state.phase !== "committing") return state;
      return {
        ...state,
        phase: "review",
        message: action.message,
        code: action.code,
      };
  }
}
