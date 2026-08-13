import { CANONICAL_JAKE_PREAMBLE } from "./adapters/jakes-resume-v1/canonical-preamble";
import type { ExtractedEntry, ResumeExtraction } from "./resume-extraction-schema";

// Deterministic inverse of the ESCAPES table in jake-entry-preview.ts: turns
// plain extracted text back into LaTeX-safe text. A single character-by-
// character pass (rather than chained global replaces) so the backslashes
// and braces this function inserts are never themselves re-escaped.
const ESCAPE_MAP: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

// PDF text extraction (MarkItDown) commonly emits visually-identical but
// distinct Unicode characters in place of their ASCII counterparts (verified
// against a real compile failure: "∼15%" used U+223C TILDE OPERATOR, not
// ASCII "~" — pdflatex has no glyph for it with this preamble's fonts and
// fails the whole compile). Normalized to the ASCII form before escaping so
// they hit the same rules as if the source had used ASCII in the first
// place, rather than trying to teach LaTeX every Unicode lookalike.
const UNICODE_LOOKALIKES: Record<string, string> = {
  "∼": "~", // ∼ TILDE OPERATOR
  "‘": "'", // ' LEFT SINGLE QUOTATION MARK
  "’": "'", // ' RIGHT SINGLE QUOTATION MARK
  "“": '"', // " LEFT DOUBLE QUOTATION MARK
  "”": '"', // " RIGHT DOUBLE QUOTATION MARK
  "…": "...", // … HORIZONTAL ELLIPSIS
  "•": "-", // • BULLET
};

export function escapeLatex(text: string): string {
  let out = "";
  for (const char of text) {
    const normalized = UNICODE_LOOKALIKES[char] ?? char;
    out += ESCAPE_MAP[normalized] ?? normalized;
  }
  return out;
}

function renderBullets(bullets: string[]): string {
  if (bullets.length === 0) return "";
  const items = bullets.map((bullet) => `        \\resumeItem{${escapeLatex(bullet)}}`).join("\n");
  return `\n      \\resumeItemListStart\n${items}\n      \\resumeItemListEnd`;
}

function renderEntry(entry: ExtractedEntry): string {
  if (entry.kind === "subheading_entry") {
    return (
      `    \\resumeSubheading\n` +
      `      {${escapeLatex(entry.title ?? "")}}{${escapeLatex(entry.date ?? "")}}\n` +
      `      {${escapeLatex(entry.organization ?? "")}}{${escapeLatex(entry.location ?? "")}}` +
      renderBullets(entry.bullets ?? [])
    );
  }
  if (entry.kind === "project_entry") {
    const name = escapeLatex(entry.title ?? "");
    const heading = entry.stack
      ? `\\textbf{${name}} $|$ \\emph{${escapeLatex(entry.stack)}}`
      : `\\textbf{${name}}`;
    return (
      `    \\resumeProjectHeading\n` +
      `        {${heading}}{${escapeLatex(entry.date ?? "")}}` +
      renderBullets(entry.bullets ?? [])
    );
  }
  // section_chunk: not itself a \resumeSubheading-family entry, so it can't
  // sit inside a resumeSubHeadingList — the caller renders its section body
  // separately (see renderSectionBody).
  throw new Error("section_chunk entries must be rendered via renderSectionBody");
}

// The common "Category: value, value" idiom (e.g. Technical Skills) — split
// once here, on the model/serializer boundary, rather than carrying a
// {label, value} shape through the LLM schema (see resume-extraction-schema.ts
// on why that schema stays flat).
function renderSectionChunkBody(entry: ExtractedEntry): string {
  const lines = (entry.items ?? [])
    .map((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) return `     ${escapeLatex(line)}`;
      const label = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      return `     \\textbf{${escapeLatex(label)}}{: ${escapeLatex(value)}}`;
    })
    .join(" \\\\\n");
  return ` \\begin{itemize}[leftmargin=0.15in, label={}]\n    \\small{\\item{\n${lines}\n    }}\n \\end{itemize}`;
}

function renderSectionBody(entries: ExtractedEntry[]): string {
  if (entries.length === 1 && entries[0].kind === "section_chunk") {
    return renderSectionChunkBody(entries[0]);
  }
  const rendered = entries.map(renderEntry).join("\n\n");
  return `  \\resumeSubHeadingListStart\n${rendered}\n  \\resumeSubHeadingListEnd`;
}

function renderHeader(header: ResumeExtraction["header"]): string {
  return (
    `\\begin{center}\n` +
    `    \\textbf{\\Huge \\scshape ${escapeLatex(header.name)}} \\\\ \\vspace{1pt}\n` +
    `    \\small ${escapeLatex(header.contactLine)}\n` +
    `\\end{center}`
  );
}

// Structured extraction -> a full, standalone .tex source using the
// canonical Jake's Resume preamble, so it satisfies checkJakeContract and can
// be fed through the exact same parseLatexArchive/detectAdapter/extract path
// as a real uploaded .tex file (see src/app/api/imports/route.ts).
export function synthesizeJakeLatex(extraction: ResumeExtraction): string {
  const sections = extraction.sections
    .map((section) => `\\section{${escapeLatex(section.title)}}\n${renderSectionBody(section.entries)}`)
    .join("\n\n\n");

  const body = [renderHeader(extraction.header), sections].join("\n\n\n");

  return `${CANONICAL_JAKE_PREAMBLE}\\begin{document}\n\n${body}\n\n\\end{document}\n`;
}
