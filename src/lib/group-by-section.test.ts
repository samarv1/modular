import { describe, expect, it } from "vitest";
import { groupEntriesBySection } from "@/lib/group-by-section";

describe("groupEntriesBySection", () => {
  it("preserves first section appearance and entry order", () => {
    const entries = [
      { id: "a", section: "Experience" },
      { id: "b", section: "Projects" },
      { id: "c", section: "Experience" },
    ];

    expect(groupEntriesBySection(entries, (entry) => entry.section)).toEqual([
      { key: "Experience", entries: [entries[0], entries[2]] },
      { key: "Projects", entries: [entries[1]] },
    ]);
  });

  it("supports view-specific grouping keys without changing the entries", () => {
    const entries = [
      { id: "a", section: "Skills" },
      { id: "b", section: "Languages" },
    ];

    expect(groupEntriesBySection(entries, () => "Other")).toEqual([
      { key: "Other", entries },
    ]);
  });
});
