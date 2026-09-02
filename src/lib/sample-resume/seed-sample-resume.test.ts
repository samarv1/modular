import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseLatexArchive } from "@/lib/latex-archive";
import { detectAdapter } from "@/lib/adapters/registry";
import { flattenEntries } from "@/lib/import-commit";
import { assembleJakeResume } from "@/lib/adapters/jakes-resume-v1/assemble";
import {
  bankEntryToExtractedEntry,
  bankEntryToHeaderData,
} from "@/lib/bank-entry-fields";
import { SAMPLE_RESUME_TEX } from "./sample-resume-source";

// Entries are stored as trimmed source slices, so reassembly loses the
// fixture's indentation and its comment lines. Neither changes the document.
function significantLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("%"));
}

// seed-sample-resume.ts writes to Storage and four tables, so this covers the
// part that isn't a database call: the fixture surviving the same
// zip -> parse -> detect -> extract path a real upload takes, those entries
// still opening in the bank editor, and the whole set reassembling into valid
// LaTeX once a user composes them.

async function extractSample() {
  const zip = new JSZip();
  zip.file("resume.tex", SAMPLE_RESUME_TEX);
  const archive = await parseLatexArchive(
    await zip.generateAsync({ type: "uint8array" }),
  );
  const { adapter, result } = detectAdapter({
    rootFile: archive.rootFile,
    source: archive.source,
  });
  return { adapter, result, archive };
}

describe("sample resume extraction", () => {
  it("is recognized by the Jake adapter", async () => {
    const { adapter, result } = await extractSample();
    expect(adapter?.id).toBe("jakes-resume-v1");
    expect(result.compatible).toBe(true);
    expect(result.fingerprint).toBeTruthy();
  });

  it("yields one header chunk and the four expected sections", async () => {
    const { adapter, archive } = await extractSample();
    const extracted = adapter!.extract({
      rootFile: archive.rootFile,
      source: archive.source,
    });

    expect(extracted.sections.map((s) => s.title)).toEqual([
      "Name & Contact",
      "Education",
      "Experience",
      "Projects",
      "Technical Skills",
    ]);

    const kindsBySection = Object.fromEntries(
      extracted.sections.map((s) => [s.title, s.entries.map((e) => e.kind)]),
    );
    expect(kindsBySection["Name & Contact"]).toEqual(["header_chunk"]);
    expect(kindsBySection["Education"]).toEqual([
      "subheading_entry",
      "subheading_entry",
    ]);
    expect(kindsBySection["Experience"]).toHaveLength(3);
    expect(kindsBySection["Projects"]).toEqual([
      "project_entry",
      "project_entry",
    ]);
    expect(kindsBySection["Technical Skills"]).toEqual(["section_chunk"]);
  });

  it("every extracted entry is placed exactly once", async () => {
    const { adapter, archive } = await extractSample();
    const extracted = adapter!.extract({
      rootFile: archive.rootFile,
      source: archive.source,
    });
    const flat = flattenEntries(extracted);

    // The seed maps committed rows back onto extracted.sections by position,
    // so the two orderings have to agree entry for entry.
    expect(flat.map((e) => e.sourceSection)).toEqual(
      extracted.sections.flatMap((s) => s.entries.map(() => s.title)),
    );
  });
});

// The seed leaves the resume empty, so nothing composes these entries today.
// This still matters: it's what a user gets after dragging every bank entry in,
// and it's the only check that the seeded LaTeX reassembles into a compilable
// document rather than just parsing.
describe("sample resume entries, once composed by hand", () => {
  it("assemble back into a single-document resume", async () => {
    const { adapter, archive } = await extractSample();
    const extracted = adapter!.extract({
      rootFile: archive.rootFile,
      source: archive.source,
    });

    // The same section tree the seed builds for set_resume_composition.
    const assembled = assembleJakeResume({
      shellPreamble: extracted.preamble,
      sections: extracted.sections.map((section) => ({
        title: section.title,
        entries: section.entries.map((entry) => ({
          rawLatex: entry.rawLatex,
          kind: entry.kind,
          requiredPackages: entry.requiredPackages,
        })),
      })),
    });

    // The header renders bare: its section title must not leak into the output.
    expect(assembled.source).not.toContain("\\section{Name & Contact}");

    // Stronger than any structural assertion: the composed resume is the
    // fixture again, line for line. Indentation is the only thing entry
    // slicing drops, and LaTeX ignores it. Since the fixture is known to
    // compile to one page, so does the seeded resume.
    expect(significantLines(assembled.source)).toEqual(
      significantLines(SAMPLE_RESUME_TEX),
    );
  });
});

describe("sample resume entries open in the bank editor", () => {
  it("every entry's fields parse back out of its raw latex", async () => {
    const { adapter, archive } = await extractSample();
    const extracted = adapter!.extract({
      rootFile: archive.rootFile,
      source: archive.source,
    });

    // bankEntryToExtractedEntry is a different reverse-parser from the one
    // that produced these slices, and it degrades to a title-only shell rather
    // than throwing when it can't find its macro. A seeded entry that hits
    // that path is uneditable in the bank pane but looks fine everywhere else,
    // so assert the fields are actually populated.
    for (const section of extracted.sections) {
      for (const entry of section.entries) {
        const row = {
          kind: entry.kind,
          source_section: entry.sourceSection,
          raw_latex: entry.rawLatex,
          display_name: entry.displayName,
        };

        if (entry.kind === "header_chunk") {
          const header = bankEntryToHeaderData(row);
          expect(header.name).toBe("Jake Ryan");
          expect(header.contactLine).toContain("jake@su.edu");
          continue;
        }

        const fields = bankEntryToExtractedEntry(row);
        if (entry.kind === "section_chunk") {
          expect(fields.items?.length, entry.displayName).toBeGreaterThan(0);
          continue;
        }

        expect(fields.title, entry.displayName).toBeTruthy();
        expect(fields.date, entry.displayName).toBeTruthy();
        // Not every entry has bullets (Jake's education entries don't), so
        // count what the source actually carries rather than requiring some.
        expect(fields.bullets?.length ?? 0, entry.displayName).toBe(
          entry.rawLatex.split("\\resumeItem{").length - 1,
        );
        if (entry.kind === "subheading_entry") {
          expect(fields.organization, entry.displayName).toBeTruthy();
          expect(fields.location, entry.displayName).toBeTruthy();
        }
      }
    }
  });
});
