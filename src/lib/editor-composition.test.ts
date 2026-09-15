import { describe, expect, it } from "vitest";
import {
  addCompositionEntry,
  moveCompositionEntry,
  moveCompositionSection,
  removeCompositionEntry,
  reorderCompositionEntry,
  type EditorSection,
} from "./editor-composition";

const sections: EditorSection[] = [
  { title: "Experience", entries: ["first", "second"] },
  { title: "Projects", entries: ["project"] },
];
const entries = new Map([
  ["first", { kind: "subheading_entry", source_section: "Experience" }],
  ["second", { kind: "subheading_entry", source_section: "Experience" }],
  ["third", { kind: "subheading_entry", source_section: "Experience" }],
  ["project", { kind: "project_entry", source_section: "Projects" }],
  ["chunk", { kind: "section_chunk", source_section: "Experience" }],
]);

describe("editor composition transitions", () => {
  it("adds an entry at a requested position without mutating the input", () => {
    const result = addCompositionEntry(
      sections,
      { id: "third", ...entries.get("third")! },
      entries,
      "Experience",
      "second",
    );

    expect(result.sections[0].entries).toEqual(["first", "third", "second"]);
    expect(sections[0].entries).toEqual(["first", "second"]);
  });

  it("rejects duplicate entries, invalid sections, and mixed chunk sections", () => {
    expect(
      addCompositionEntry(
        sections,
        { id: "first", ...entries.get("first")! },
        entries,
        "Experience",
      ).changed,
    ).toBe(false);
    expect(
      addCompositionEntry(
        sections,
        { id: "third", ...entries.get("third")! },
        entries,
        "Projects",
      ).error,
    ).toBe("source_mismatch");
    expect(
      addCompositionEntry(
        sections,
        { id: "chunk", ...entries.get("chunk")! },
        entries,
        "Experience",
      ).error,
    ).toBe("exclusive_entry");
  });

  it("moves entries across matching sections and removes empty sources", () => {
    const splitSections = [
      { title: "Experience", entries: ["first"] },
      { title: " experience ", entries: ["second"] },
    ];
    const result = moveCompositionEntry(
      splitSections,
      "first",
      " experience ",
      entries,
      "second",
    );

    expect(result.sections).toEqual([
      { title: " experience ", entries: ["first", "second"] },
    ]);
  });

  it("reorders and removes entries and moves sections", () => {
    expect(
      reorderCompositionEntry(sections, "first", "second").sections[0].entries,
    ).toEqual(["second", "first"]);
    expect(removeCompositionEntry(sections, "Projects", "project")).toEqual([
      sections[0],
    ]);
    expect(moveCompositionSection(sections, "Projects", "up")).toEqual([
      sections[1],
      sections[0],
    ]);
  });
});
