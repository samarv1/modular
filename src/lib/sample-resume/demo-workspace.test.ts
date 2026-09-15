import { describe, expect, it } from "vitest";
import { getDemoWorkspace, DEMO_RESUME_ID } from "./demo-workspace";

describe("getDemoWorkspace", () => {
  it("yields the nine entries and kinds from the sample resume", () => {
    const { entries } = getDemoWorkspace();

    expect(entries).toHaveLength(9);
    expect(entries.map((entry) => entry.kind)).toEqual([
      "header_chunk",
      "subheading_entry",
      "subheading_entry",
      "subheading_entry",
      "subheading_entry",
      "subheading_entry",
      "project_entry",
      "project_entry",
      "section_chunk",
    ]);
  });

  it("gives every entry a stable, unique id", () => {
    const { entries } = getDemoWorkspace();
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.source_resume_id).toBe("demo-source");
    }
  });

  it("keeps the desktop and editor resume shapes aligned", () => {
    const { resume, editorResume } = getDemoWorkspace();
    expect(resume.id).toBe(DEMO_RESUME_ID);
    expect(editorResume.id).toBe(DEMO_RESUME_ID);
    expect(resume.title).toBe(editorResume.title);
    expect(resume.compile_status).toBe("unbuilt");
  });

  it("is memoized", () => {
    expect(getDemoWorkspace()).toBe(getDemoWorkspace());
  });
});
