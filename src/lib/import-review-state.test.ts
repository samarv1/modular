import { describe, expect, it } from "vitest";
import {
  importReviewReducer,
  initialImportReviewState,
  type ImportPreviewEntry,
} from "@/lib/import-review-state";

const file = {} as File;
const entries: ImportPreviewEntry[] = [
  {
    key: "0",
    index: 0,
    kind: "header_chunk",
    sourceSection: "Name & Contact",
    displayName: "Ada Lovelace",
    rawLatex:
      "\\begin{center}\\textbf{Ada Lovelace}\\\\ada@example.com\\end{center}",
    isDuplicate: false,
  },
  {
    key: "1",
    index: 1,
    kind: "section_chunk",
    sourceSection: "Skills",
    displayName: "Skills",
    rawLatex: "TypeScript",
    isDuplicate: false,
  },
];

describe("importReviewReducer", () => {
  it("creates one complete review state from a loaded preview", () => {
    const state = importReviewReducer(initialImportReviewState, {
      type: "preview_loaded",
      file,
      entries,
    });

    expect(state.phase).toBe("review");
    if (state.phase !== "review") return;
    expect(state.file).toBe(file);
    expect(state.headerDraft).toEqual({
      name: "Ada Lovelace",
      contactLine: "ada@example.com",
    });
    expect(state.entryDrafts["1"]).toMatchObject({
      kind: "section_chunk",
      sourceSection: "Skills",
    });
  });

  it("preserves review edits when a commit fails, then resets atomically", () => {
    let state = importReviewReducer(initialImportReviewState, {
      type: "preview_loaded",
      file,
      entries,
    });
    state = importReviewReducer(state, { type: "remove_entry", index: 1 });
    state = importReviewReducer(state, { type: "commit_started" });
    state = importReviewReducer(state, {
      type: "commit_failed",
      message: "upload failed, try again",
    });

    expect(state.phase).toBe("review");
    if (state.phase !== "review") return;
    expect(state.removedIndices.has(1)).toBe(true);
    expect(state.message).toBe("upload failed, try again");
    expect(importReviewReducer(state, { type: "reset" })).toEqual({
      phase: "idle",
    });
  });

  it("ignores edit actions outside review phases", () => {
    expect(
      importReviewReducer(initialImportReviewState, {
        type: "remove_entry",
        index: 1,
      }),
    ).toBe(initialImportReviewState);
  });
});
