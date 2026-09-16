import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadDemoComposition,
  saveDemoComposition,
} from "./demo-composition-store";
import { getDemoWorkspace } from "./sample-resume/demo-workspace";

function useSessionStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("modular-demo-composition", initial);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo composition store", () => {
  const entries = getDemoWorkspace().entries;

  it("round-trips valid demo sections", () => {
    useSessionStorage();
    const sections = [{ title: "Education", entries: ["demo-entry-1"] }];

    saveDemoComposition(sections);

    expect(loadDemoComposition(entries)).toEqual(sections);
  });

  it("rejects unknown entry ids", () => {
    useSessionStorage(
      JSON.stringify([{ title: "Experience", entries: ["unknown-entry"] }]),
    );

    expect(loadDemoComposition(entries)).toBeNull();
  });

  it("rejects duplicate entries and section titles", () => {
    useSessionStorage(
      JSON.stringify([
        { title: "Education", entries: ["demo-entry-1"] },
        { title: "education", entries: ["demo-entry-1"] },
      ]),
    );

    expect(loadDemoComposition(entries)).toBeNull();
  });

  it("rejects entries outside their source section", () => {
    useSessionStorage(
      JSON.stringify([{ title: "Projects", entries: ["demo-entry-1"] }]),
    );

    expect(loadDemoComposition(entries)).toBeNull();
  });

  it("rejects exclusive chunks placed beside another entry", () => {
    const technicalSkills = entries.find(
      (entry) => entry.kind === "section_chunk",
    )!;
    const mixedEntries = [
      ...entries,
      {
        ...entries[1],
        id: "demo-extra",
        source_section: technicalSkills.source_section,
      },
    ];
    useSessionStorage(
      JSON.stringify([
        {
          title: technicalSkills.source_section,
          entries: [technicalSkills.id, "demo-extra"],
        },
      ]),
    );

    expect(loadDemoComposition(mixedEntries)).toBeNull();
  });

  it("rejects empty sections", () => {
    useSessionStorage(JSON.stringify([{ title: "Experience", entries: [] }]));

    expect(loadDemoComposition(entries)).toBeNull();
  });

  it("treats blocked browser storage as unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });

    expect(loadDemoComposition(entries)).toBeNull();
    expect(() => saveDemoComposition([])).not.toThrow();
  });
});
