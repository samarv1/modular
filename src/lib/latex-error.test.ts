import { describe, expect, it } from "vitest";
import { summarizeCompileError } from "./latex-error";

const USER_LATEX_ERROR_LOG = `
This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex)
(./resume.tex
LaTeX2e <2026-06-01>
(/usr/local/texlive/2024/texmf-dist/tex/latex/base/article.cls)

! Undefined control sequence.
l.22 \\resumeSubheading
                       {Foo}{Bar}
!  ==> Fatal error occurred, no output PDF file produced!
Transcript written on resume.log.
`;

const MISSING_PACKAGE_LOG = `
This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex)
(./resume.tex
LaTeX2e <2026-06-01>
(/usr/local/texlive/2024/texmf-dist/tex/latex/base/article.cls)

! LaTeX Error: File \`ulem.sty' not found.

Type X to quit or <RETURN> to proceed,
or enter new name. (Default extension: sty)

Enter file name:
! Emergency stop.
<read *>

l.22 \\usepackage
                {hyperref}^^M
!  ==> Fatal error occurred, no output PDF file produced!
Transcript written on resume.log.
`;

describe("summarizeCompileError", () => {
  it("treats a real LaTeX content error as the user's — not an environment issue", () => {
    const summary = summarizeCompileError(USER_LATEX_ERROR_LOG);
    expect(summary.headline).toBe(
      "Undefined control sequence. (near line 22 of the assembled document)",
    );
    expect(summary.isEnvironmentIssue).toBe(false);
  });

  it("treats a missing package/file as an environment issue, not the user's resume", () => {
    const summary = summarizeCompileError(MISSING_PACKAGE_LOG);
    expect(summary.headline).toBe(
      "The compile environment is missing a required file (ulem.sty).",
    );
    expect(summary.isEnvironmentIssue).toBe(true);
  });

  it("treats a pre-compile infra failure (tagged by the compile route) as an environment issue", () => {
    const summary = summarizeCompileError(
      "Compile environment error: TEXLIVE_SNAPSHOT_ID is not set.",
    );
    expect(summary.headline).toBe("TEXLIVE_SNAPSHOT_ID is not set.");
    expect(summary.isEnvironmentIssue).toBe(true);
  });

  it("falls back to a generic message with no recognizable error line", () => {
    const summary = summarizeCompileError(
      "some unrelated stdout with no bang lines",
    );
    expect(summary.isEnvironmentIssue).toBe(true);
  });
});
