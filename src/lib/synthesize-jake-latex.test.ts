import { describe, expect, it } from "vitest";
import { checkJakeContract } from "./adapters/jakes-resume-v1/fingerprint";
import { extractJakeResume } from "./adapters/jakes-resume-v1/extract";
import type { ResumeExtraction } from "./resume-extraction-schema";
import { escapeLatex, synthesizeJakeLatex } from "./synthesize-jake-latex";

const sample: ResumeExtraction = {
  header: { name: "Jane Doe", contactLine: "jane@x.com | 555-123-4567 | linkedin.com/in/jane" },
  sections: [
    {
      title: "Education",
      entries: [
        {
          kind: "subheading_entry",
          sourceSection: "Education",
          title: "State University",
          date: "Aug 2020 -- May 2024",
          organization: "B.S. in Computer Science",
          location: "Town, TX",
          bullets: [],
        },
      ],
    },
    {
      title: "Experience",
      entries: [
        {
          kind: "subheading_entry",
          sourceSection: "Experience",
          title: "Software Engineer",
          date: "June 2024 -- Present",
          organization: "Acme Corp",
          location: "Remote",
          bullets: ["Built a service with 99.9% uptime", "Cut infra costs by 20%"],
        },
      ],
    },
    {
      title: "Projects",
      entries: [
        {
          kind: "project_entry",
          sourceSection: "Projects",
          title: "Cool Project",
          stack: "Python, Flask",
          date: "2023",
          bullets: ["Shipped a thing"],
        },
      ],
    },
    {
      title: "Technical Skills",
      entries: [
        {
          kind: "section_chunk",
          sourceSection: "Technical Skills",
          items: ["Languages: Java, Python, C++", "Tools: Git, Docker"],
        },
      ],
    },
  ],
};

describe("synthesizeJakeLatex", () => {
  it("produces a source that satisfies the Jake macro contract", () => {
    const source = synthesizeJakeLatex(sample);
    const contract = checkJakeContract(source);
    expect(contract.compatible).toBe(true);
  });

  it("round-trips through the real adapter's extractor with the expected shape", () => {
    const source = synthesizeJakeLatex(sample);
    const extracted = extractJakeResume(source);

    const titles = extracted.sections.map((s) => s.title);
    expect(titles).toEqual(["Name & Contact", "Education", "Experience", "Projects", "Technical Skills"]);

    const experience = extracted.sections.find((s) => s.title === "Experience")!;
    expect(experience.entries).toHaveLength(1);
    expect(experience.entries[0].kind).toBe("subheading_entry");
    expect(experience.entries[0].rawLatex).toContain("Built a service with 99.9\\% uptime");

    const projects = extracted.sections.find((s) => s.title === "Projects")!;
    expect(projects.entries[0].kind).toBe("project_entry");

    const skills = extracted.sections.find((s) => s.title === "Technical Skills")!;
    expect(skills.entries).toHaveLength(1);
    expect(skills.entries[0].kind).toBe("section_chunk");
  });

  it("escapes special LaTeX characters in user-derived text", () => {
    const withSpecialChars: ResumeExtraction = {
      header: { name: "Jane & Doe", contactLine: "jane@x.com" },
      sections: [
        {
          title: "Experience",
          entries: [
            {
              kind: "subheading_entry",
              sourceSection: "Experience",
              title: "Engineer",
              date: "2024",
              organization: "R&D Labs #1",
              location: "Remote",
              bullets: ["Cut costs by 20% ($5k/mo), used C# & ~50% less memory"],
            },
          ],
        },
      ],
    };

    const source = synthesizeJakeLatex(withSpecialChars);
    expect(checkJakeContract(source).compatible).toBe(true);

    const extracted = extractJakeResume(source);
    const entry = extracted.sections.find((s) => s.title === "Experience")!.entries[0];
    expect(entry.rawLatex).toContain("R\\&D Labs \\#1");
    expect(entry.rawLatex).toContain("20\\% (\\$5k/mo)");
    expect(entry.rawLatex).toContain("C\\#");
    expect(entry.rawLatex).toContain("\\textasciitilde{}50\\%");
  });

  it("escapes a lone backslash without double-escaping the inserted backslashes", () => {
    expect(escapeLatex("a\\b")).toBe("a\\textbackslash{}b");
    expect(escapeLatex("50%")).toBe("50\\%");
  });

  it("normalizes Unicode lookalikes that pdflatex can't render before escaping", () => {
    // Found via a real compile failure: MarkItDown emitted U+223C TILDE
    // OPERATOR (∼) for "~15%", which has no glyph in this preamble's fonts.
    expect(escapeLatex("saving ∼15%")).toBe("saving \\textasciitilde{}15\\%");
    expect(escapeLatex("‘quoted’ and “quoted”")).toBe(`'quoted' and "quoted"`);
    expect(escapeLatex("wait…")).toBe("wait...");
  });
});
