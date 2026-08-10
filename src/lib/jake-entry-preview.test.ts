import { describe, expect, it } from "vitest";
import { parseJakeEntryPreview } from "./jake-entry-preview";

describe("parseJakeEntryPreview bullet cleaning", () => {
  const bulletPreview = (bulletLatex: string) =>
    parseJakeEntryPreview(
      "subheading_entry",
      `\\resumeSubheading{Title}{Date}{Org}{Location}\\resumeItem{${bulletLatex}}`,
    ).bullets[0];

  it("strips \\underline{} instead of leaking it", () => {
    expect(bulletPreview("Built \\underline{interactive product tours} and led the redesign")).toBe(
      "Built interactive product tours and led the redesign",
    );
  });

  it("strips \\underline{} wrapped in a stray grouping brace", () => {
    expect(bulletPreview("Built {\\underline{interactive product tours}} and led the redesign")).toBe(
      "Built interactive product tours and led the redesign",
    );
  });

  it("handles nested formatting macros", () => {
    expect(bulletPreview("\\textbf{\\underline{Shipped}} a feature")).toBe("Shipped a feature");
  });

  it("strips other common text macros (textsc, texttt, textcolor, url)", () => {
    expect(bulletPreview("Used \\texttt{grep} and \\textsc{Sql} via \\url{example.com}")).toBe(
      "Used grep and Sql via example.com",
    );
    expect(bulletPreview("Marked \\textcolor{red}{urgent} items")).toBe("Marked urgent items");
  });

  it("resolves escaped special characters", () => {
    expect(bulletPreview("Cut costs 20\\% on a \\$50k budget for R\\&D \\#1 priority")).toBe(
      "Cut costs 20% on a $50k budget for R&D #1 priority",
    );
  });

  it("drops an unknown macro's name but keeps its braced content", () => {
    expect(bulletPreview("Led a \\somefuturemacro{cross-functional} team")).toBe(
      "Led a cross-functional team",
    );
  });

  it("handles line breaks with an optional spacing arg", () => {
    expect(bulletPreview("Line one\\\\[2pt]Line two")).toBe("Line one Line two");
  });

  it("strips LaTeX comments", () => {
    expect(bulletPreview("Visible text % this is a comment\nMore text")).toBe(
      "Visible text More text",
    );
  });
});

describe("parseJakeEntryPreview project titles", () => {
  it("splits bold title and emph tech stack even when nested", () => {
    const preview = parseJakeEntryPreview(
      "project_entry",
      "\\resumeProjectHeading{\\textbf{\\underline{My Project}} $|$ \\emph{React, Node}}{2024}",
    );
    expect(preview.title).toBe("My Project");
    expect(preview.meta).toBe("React, Node");
  });
});
