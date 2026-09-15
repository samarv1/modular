import { describe, expect, it } from "vitest";
import { applyOverrides, parseOverrides } from "@/lib/import-commit";

describe("parseOverrides", () => {
  it("accepts no override payload", () => {
    expect(parseOverrides(null)).toEqual([]);
  });

  it.each([
    "not json",
    "{}",
    '[{"index":-1}]',
    '[{"index":1.5}]',
    '[{"index":0},{"index":0}]',
    '[{"index":0,"unknown":true}]',
    '[{"index":0,"entryFields":{},"headerFields":{}}]',
  ])("rejects malformed overrides: %s", (raw) => {
    expect(() => parseOverrides(raw)).toThrow();
  });
});

describe("applyOverrides", () => {
  const entry = {
    index: 0,
    kind: "project_entry",
    sourceSection: "Projects",
    displayName: "Old project",
    rawLatex: "old latex",
    sourceOffsetStart: 10,
    sourceOffsetEnd: 20,
    requiredPackages: [],
  };

  it("materializes edited fields and lets an explicit name win", () => {
    expect(
      applyOverrides(
        [entry],
        [
          {
            index: 0,
            displayName: "Custom name",
            entryFields: {
              kind: "project_entry",
              sourceSection: "Projects",
              title: "New project",
            },
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        displayName: "Custom name",
        sourceOffsetStart: null,
        sourceOffsetEnd: null,
      }),
    ]);
  });

  it("rejects changing the persisted entry kind", () => {
    expect(() =>
      applyOverrides(
        [entry],
        [
          {
            index: 0,
            entryFields: {
              kind: "subheading_entry",
              sourceSection: "Projects",
              title: "Engineer",
            },
          },
        ],
      ),
    ).toThrow("entry kind cannot be changed");
  });
});
