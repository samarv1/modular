import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { extractJakeResume } from "./extract";
import { checkJakeContract } from "./fingerprint";

const fixture = readFileSync(
  join(__dirname, "../../../fixtures/jakes-resume/resume.tex"),
  "utf8",
);

describe("jakes-resume-v1 contract check", () => {
  it("recognizes the canonical fixture as compatible", () => {
    const result = checkJakeContract(fixture);
    expect(result.compatible).toBe(true);
    expect(result.fingerprint).toBeTruthy();
  });

  it("rejects a source missing the macro contract", () => {
    const result = checkJakeContract("\\documentclass{article}\\begin{document}hi\\end{document}");
    expect(result.compatible).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("does not count commented-out macro declarations", () => {
    const commentedDeclarations = fixture
      .split("\n")
      .map((line) =>
        /\\(?:re)?newcommand/.test(line) ? `% ${line}` : line,
      )
      .join("\n");
    const result = checkJakeContract(commentedDeclarations);
    expect(result.compatible).toBe(false);
    expect(result.missing).toContain("resumeSubheading");
  });
});

describe("jakes-resume-v1 extraction", () => {
  const resume = extractJakeResume(fixture);

  it("extracts the expected sections", () => {
    expect(resume.sections.map((s) => s.title)).toEqual([
      "Name & Contact",
      "Education",
      "Experience",
      "Projects",
      "Technical Skills",
    ]);
  });

  it("extracts the name/contact block as a single header_chunk", () => {
    const section = resume.sections.find((s) => s.title === "Name & Contact")!;
    expect(section.entries).toHaveLength(1);
    expect(section.entries[0].kind).toBe("header_chunk");
  });

  it("extracts 2 education entries", () => {
    const section = resume.sections.find((s) => s.title === "Education")!;
    expect(section.entries).toHaveLength(2);
    expect(section.entries.every((e) => e.kind === "subheading_entry")).toBe(true);
  });

  it("extracts 3 experience entries, folding resumeSubSubheading into its preceding entry", () => {
    const section = resume.sections.find((s) => s.title === "Experience")!;
    expect(section.entries).toHaveLength(3);
    expect(section.entries.every((e) => e.kind === "subheading_entry")).toBe(true);
  });

  it("extracts 2 project entries", () => {
    const section = resume.sections.find((s) => s.title === "Projects")!;
    expect(section.entries).toHaveLength(2);
    expect(section.entries.every((e) => e.kind === "project_entry")).toBe(true);
  });

  it("extracts the Technical Skills section as a single section_chunk", () => {
    const section = resume.sections.find((s) => s.title === "Technical Skills")!;
    expect(section.entries).toHaveLength(1);
    expect(section.entries[0].kind).toBe("section_chunk");
  });

  it("produces raw LaTeX slices that round-trip from the source", () => {
    for (const section of resume.sections) {
      for (const entry of section.entries) {
        const slice = fixture.slice(entry.sourceOffsetStart, entry.sourceOffsetEnd);
        expect(slice).toBe(entry.rawLatex);
      }
    }
  });

  it("derives readable display names for subheading and project entries", () => {
    const education = resume.sections.find((s) => s.title === "Education")!;
    expect(education.entries[0].displayName).toBe(
      "Southwestern University — Bachelor of Arts in Computer Science, Minor in Business",
    );
    const projects = resume.sections.find((s) => s.title === "Projects")!;
    expect(projects.entries[0].displayName).toContain("Gitlytics");
  });

  it("collects the preamble's required packages", () => {
    expect(resume.requiredPackages).toContain("hyperref");
    expect(resume.requiredPackages).toContain("fancyhdr");
  });
});
