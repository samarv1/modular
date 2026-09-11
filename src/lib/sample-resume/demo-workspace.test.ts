import { describe, expect, it } from "vitest";
import { getDemoWorkspace, DEMO_RESUME_ID } from "./demo-workspace";

// The one piece of genuinely new logic in the anonymous playground (see
// PLAN.md's "Anonymous visitors get a read-mostly playground" decision):
// everything else is either an existing route gated by src/proxy.ts's
// session check, or a client-side guard with nothing to unit test. This
// breaks silently if the Jake adapter or the fixture ever drift apart.

describe("getDemoWorkspace", () => {
  it("yields the same nine entries and kinds seed-sample-resume.ts extracts", () => {
    const { entries } = getDemoWorkspace();

    expect(entries).toHaveLength(9);
    expect(entries.map((e) => e.kind)).toEqual([
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

  it("gives every entry a stable, unique id and no owner", () => {
    const { entries } = getDemoWorkspace();
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.source_resume_id).toBe("demo-source");
    }
  });

  it("the resume and editor-resume shapes agree on id and title", () => {
    const { resume, editorResume } = getDemoWorkspace();
    expect(resume.id).toBe(DEMO_RESUME_ID);
    expect(editorResume.id).toBe(DEMO_RESUME_ID);
    expect(resume.title).toBe(editorResume.title);
    expect(resume.compile_status).toBe("unbuilt");
  });

  it("is memoized, repeat calls return the same object", () => {
    expect(getDemoWorkspace()).toBe(getDemoWorkspace());
  });
});
