import { describe, expect, it } from "vitest";
import {
  EntryMaterializationError,
  materializeStructuredFields,
  validateExtractionRequiredFields,
} from "@/lib/entry-materialization";

describe("materializeStructuredFields", () => {
  it("renders an entry, derives its name, and clears source offsets", () => {
    const result = materializeStructuredFields({
      entry: {
        kind: "subheading_entry",
        sourceSection: "Experience",
        title: "Engineer",
        organization: "Acme",
        bullets: ["Built things"],
      },
      currentDisplayName: "Old name",
      expectedKind: "subheading_entry",
    });

    expect(result).toMatchObject({
      displayName: "Engineer — Acme",
      sourceOffsetStart: null,
      sourceOffsetEnd: null,
    });
    expect(result?.rawLatex).toContain("\\resumeSubheading");
  });

  it("rejects both structured shapes", () => {
    expect(() =>
      materializeStructuredFields({
        entry: {},
        header: {},
        currentDisplayName: "Header",
      }),
    ).toThrow("entry and header fields are mutually exclusive");
  });

  it("rejects missing kind-specific fields and kind changes", () => {
    expect(() =>
      materializeStructuredFields({
        entry: {
          kind: "project_entry",
          sourceSection: "Projects",
          title: "   ",
        },
        currentDisplayName: "Old",
      }),
    ).toThrow('"Projects" entry missing a title');

    expect(() =>
      materializeStructuredFields({
        entry: {
          kind: "project_entry",
          sourceSection: "Projects",
          title: "New project",
        },
        currentDisplayName: "Old",
        expectedKind: "subheading_entry",
      }),
    ).toThrow("entry kind cannot be changed");
  });

  it("keeps a header's existing display name", () => {
    expect(
      materializeStructuredFields({
        header: { name: "Ada", contactLine: "ada@example.com" },
        currentDisplayName: "Name & Contact",
        expectedKind: "header_chunk",
      }),
    ).toMatchObject({
      displayName: "Name & Contact",
      sourceOffsetStart: null,
      sourceOffsetEnd: null,
    });
  });

  it("rejects a whitespace-only header name", () => {
    expect(() =>
      materializeStructuredFields({
        header: { name: "   ", contactLine: "contact" },
        currentDisplayName: "Name & Contact",
      }),
    ).toThrow("invalid header fields");
  });
});

describe("validateExtractionRequiredFields", () => {
  it("reports every incomplete extracted entry", () => {
    const errors = validateExtractionRequiredFields({
      header: { name: "Ada", contactLine: "" },
      sections: [
        {
          title: "Projects",
          entries: [
            { kind: "project_entry", sourceSection: "Projects" },
            { kind: "section_chunk", sourceSection: "Skills", items: [] },
          ],
        },
      ],
    });

    expect(errors).toEqual([
      '"Projects" entry missing a title',
      '"Skills" entry missing items',
    ]);
  });

  it("uses a typed error for invalid structured input", () => {
    expect(() =>
      materializeStructuredFields({ entry: null, currentDisplayName: "Old" }),
    ).toThrow(EntryMaterializationError);
  });
});
