import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { extractJakeResume } from "./extract";
import { assembleJakeResume } from "./assemble";
import type { ResumeComposition } from "../types";

const fixture = readFileSync(
  join(__dirname, "../../../../fixtures/jakes-resume/resume.tex"),
  "utf8",
);

function compositionFromExtracted(preamble: string, sectionTitles: string[]) {
  const resume = extractJakeResume(fixture);
  const composition: ResumeComposition = {
    shellPreamble: preamble,
    sections: resume.sections
      .filter((s) => sectionTitles.includes(s.title))
      .map((s) => ({
        title: s.title,
        entries: s.entries.map((e) => ({
          rawLatex: e.rawLatex,
          kind: e.kind,
          requiredPackages: e.requiredPackages,
        })),
      })),
  };
  return composition;
}

describe("jakes-resume-v1 assemble", () => {
  const resume = extractJakeResume(fixture);

  it("wraps subheading/project sections in the list macros and leaves section_chunk bare", () => {
    const composition = compositionFromExtracted(resume.preamble, ["Education", "Technical Skills"]);
    const assembled = assembleJakeResume(composition);

    expect(assembled.source).toContain("\\section{Education}\n\\resumeSubHeadingListStart");
    expect(assembled.source).toContain("\\resumeSubHeadingListEnd");
    expect(assembled.source).toContain("\\begin{document}");
    expect(assembled.source).toContain("\\end{document}");

    // section_chunk (Technical Skills) shouldn't be wrapped in list macros.
    const chunkIndex = assembled.source.indexOf("\\section{Technical Skills}");
    const nextChars = assembled.source.slice(chunkIndex, chunkIndex + 60);
    expect(nextChars).not.toContain("resumeSubHeadingListStart");
  });

  it("does not duplicate a package already declared in the shell preamble", () => {
    const composition = compositionFromExtracted(resume.preamble, ["Education"]);
    const assembled = assembleJakeResume(composition);
    const occurrences = assembled.source.match(/\\usepackage(?:\[[^\]]*\])?\{hyperref\}/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("appends a missing package required by a contributing entry", () => {
    const strippedPreamble = resume.preamble.replace(
      /\\usepackage(?:\[[^\]]*\])?\{hyperref\}\n?/,
      "",
    );
    const composition = compositionFromExtracted(strippedPreamble, ["Education"]);
    // Education entries carry requiredPackages from the full original preamble, incl. hyperref.
    const assembled = assembleJakeResume(composition);
    expect(assembled.source).toContain("\\usepackage{hyperref}");
  });
});
