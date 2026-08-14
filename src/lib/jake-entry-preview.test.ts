import { describe, expect, it } from "vitest";
import { extractItems, parseHeaderChunkPreview, parseProjectTitle } from "./jake-entry-preview";

describe("parseHeaderChunkPreview", () => {
  it("renders the name as the title and the contact line as meta, not as bullets", () => {
    const preview = parseHeaderChunkPreview(
      `\\begin{center}
    \\textbf{\\Huge \\scshape Jake Ryan} \\\\ \\vspace{1pt}
    \\small 123-456-7890 $|$ \\href{mailto:x@x.com}{\\underline{jake@su.edu}} $|$
    \\href{https://linkedin.com/in/...}{\\underline{linkedin.com/in/jake}}
\\end{center}`,
    );
    expect(preview.title).toBe("Jake Ryan");
    expect(preview.meta).toContain("123-456-7890");
    expect(preview.meta).toContain("jake@su.edu");
    expect(preview.bullets).toEqual([]);
  });
});

describe("extractItems resumeItemListStart/End", () => {
  it("doesn't duplicate the first bullet by matching \\resumeItem inside \\resumeItemListStart/End", () => {
    const bullets = extractItems(
      `\\resumeSubheading
        {University of California, Davis}{Davis, CA}
        {Bachelor of Science in Computer Science}{Jun. 2026}
        \\resumeItemListStart
          \\resumeItem{GPA: 3.84 Coursework: Artificial Intelligence, Human-Computer Interaction, Data Structures \\& Algorithms}
        \\resumeItemListEnd`,
    );
    expect(bullets).toEqual([
      "GPA: 3.84 Coursework: Artificial Intelligence, Human-Computer Interaction, Data Structures & Algorithms",
    ]);
  });
});

describe("extractItems bullet cleaning", () => {
  const bulletPreview = (bulletLatex: string) => extractItems(`\\resumeItem{${bulletLatex}}`)[0];

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

describe("parseProjectTitle", () => {
  it("splits bold title and emph tech stack even when nested", () => {
    const preview = parseProjectTitle(
      "\\textbf{\\underline{My Project}} $|$ \\emph{React, Node}",
    );
    expect(preview.title).toBe("My Project");
    expect(preview.meta).toBe("React, Node");
  });
});
