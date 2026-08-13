// A light, non-authoritative reader for Jake's-Resume-family macros
// (see src/lib/adapters/jakes-resume-v1/macros.ts for the real contract).
// This is purely for the bank pane's "what does this look like" preview —
// it never touches raw_latex, which stays immutable and is never
// regenerated from a parse (see PLAN.md).

// str[start] must be "{". Returns the group's inner content and the index
// just past its closing brace (matching depth, so nested braces are safe).
export function readBraceGroup(str: string, start: number): { content: string; end: number } {
  let depth = 0;
  let i = start;
  for (; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return { content: str.slice(start + 1, i - 1), end: i };
}

export function readBalancedArgs(str: string, count: number): string[] {
  const args: string[] = [];
  let i = 0;
  for (let a = 0; a < count; a++) {
    while (i < str.length && str[i] !== "{") i++;
    if (str[i] !== "{") {
      args.push("");
      continue;
    }
    const group = readBraceGroup(str, i);
    args.push(group.content);
    i = group.end;
  }
  return args;
}

// Macros that wrap text we want to keep, keyed by how many required-brace
// args they take and which of those args to keep (in order). Anything not
// listed here still degrades gracefully — see the "unknown macro" case below
// — so a new formatting macro doesn't need an entry to avoid leaking raw
// LaTeX, only to be handled with full fidelity (e.g. \href keeping the link
// text, not the URL).
const ARG_MACROS: Record<string, { args: number; keep: number[] }> = {
  href: { args: 2, keep: [1] },
  textcolor: { args: 2, keep: [1] },
  textbf: { args: 1, keep: [0] },
  textit: { args: 1, keep: [0] },
  emph: { args: 1, keep: [0] },
  underline: { args: 1, keep: [0] },
  uline: { args: 1, keep: [0] },
  textsc: { args: 1, keep: [0] },
  texttt: { args: 1, keep: [0] },
  textrm: { args: 1, keep: [0] },
  textsf: { args: 1, keep: [0] },
  textsuperscript: { args: 1, keep: [0] },
  textsubscript: { args: 1, keep: [0] },
  url: { args: 1, keep: [0] },
  hspace: { args: 1, keep: [] },
  vspace: { args: 1, keep: [] },
};

// Declarations / spacing commands with no braced arg to worry about.
const DROP_MACROS = new Set([
  "small",
  "normalsize",
  "large",
  "Large",
  "footnotesize",
  "scriptsize",
  "noindent",
  "centering",
  "bfseries",
  "itshape",
  "quad",
  "hfill",
]);

const ESCAPES: Record<string, string> = {
  "&": "&",
  "%": "%",
  $: "$",
  "#": "#",
  _: "_",
  "{": "{",
  "}": "}",
  "^": "^",
  "~": "~",
};

// Brace-aware LaTeX-to-plain-text cleaner. Unlike a fixed regex whitelist,
// this recursively descends into macro args so nested formatting (e.g.
// \textbf{\underline{x}} or a stray grouping brace like {\underline{x}})
// degrades correctly instead of leaking raw LaTeX into the preview.
export function cleanLatexText(input: string): string {
  let i = 0;
  const n = input.length;
  let out = "";

  function skipWhitespace() {
    while (i < n && /\s/.test(input[i])) i++;
  }

  function readBalanced(): string {
    skipWhitespace();
    if (input[i] !== "{") return "";
    const group = readBraceGroup(input, i);
    i = group.end;
    return group.content;
  }

  function skipOptionalArg() {
    skipWhitespace();
    if (input[i] !== "[") return;
    let depth = 0;
    for (; i < n; i++) {
      if (input[i] === "[") depth++;
      else if (input[i] === "]") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
  }

  while (i < n) {
    const c = input[i];

    if (c === "%") {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }

    if (c === "\\") {
      const next = input[i + 1];
      if (next === "\\") {
        i += 2;
        skipOptionalArg(); // e.g. \\[4pt]
        out += " ";
        continue;
      }
      if (next !== undefined && next in ESCAPES) {
        out += ESCAPES[next];
        i += 2;
        continue;
      }
      const nameMatch = /^[a-zA-Z]+/.exec(input.slice(i + 1));
      if (nameMatch) {
        const name = nameMatch[0];
        i += 1 + name.length;
        skipOptionalArg();

        if (name in ARG_MACROS) {
          const spec = ARG_MACROS[name];
          const args: string[] = [];
          for (let a = 0; a < spec.args; a++) args.push(readBalanced());
          for (const idx of spec.keep) out += cleanLatexText(args[idx] ?? "");
          continue;
        }
        if (DROP_MACROS.has(name)) continue;

        // Unknown macro: best-effort assume it wraps displayable text if
        // followed by a brace group, otherwise just drop the macro name
        // (e.g. \LaTeX).
        skipWhitespace();
        if (input[i] === "{") out += cleanLatexText(readBalanced());
        continue;
      }
      // Lone backslash before something unexpected — drop it.
      i += 1;
      continue;
    }

    // Bare braces are just LaTeX grouping (e.g. `{\underline{x}}`) — they
    // carry no text of their own, so make them transparent.
    if (c === "{" || c === "}") {
      i += 1;
      continue;
    }

    out += c;
    i += 1;
  }

  return out
    .replace(/\$\|\$/g, "•")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractItems(latex: string): string[] {
  const items: string[] = [];
  // The negative lookahead matters: LaTeX macro names are maximal runs of
  // letters, so a bare \\resumeItem would also match as a prefix of
  // \resumeItemListStart / \resumeItemListEnd, then scan forward and grab
  // the next real bullet's braces, duplicating it.
  const re = /\\resumeSubItem(?![a-zA-Z])|\\resumeItem(?![a-zA-Z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latex))) {
    const [arg] = readBalancedArgs(latex.slice(m.index + m[0].length), 1);
    if (arg) items.push(cleanLatexText(arg));
  }
  return items;
}

// Jake's-resume project headings pack the project name and the tech-stack
// list into one arg: \textbf{Name} $|$ \emph{Skill, Skill, Skill}. Pull the
// bold part out as the title and the emph part out as its own line — a
// naive whole-string clean concatenates them into one run-on title.
export function extractMacroArg(text: string, macro: string): string | undefined {
  const idx = text.indexOf(`\\${macro}`);
  if (idx === -1) return undefined;
  const [arg] = readBalancedArgs(text.slice(idx + macro.length + 1), 1);
  return arg;
}

export function parseProjectTitle(titleLine: string): { title: string; meta?: string } {
  const bold = extractMacroArg(titleLine, "textbf");
  if (bold === undefined) return { title: cleanLatexText(titleLine) };
  const emph = extractMacroArg(titleLine, "emph");
  return { title: cleanLatexText(bold), meta: emph !== undefined ? cleanLatexText(emph) : undefined };
}

export interface EntryPreview {
  title: string;
  subtitle?: string;
  meta?: string;
  location?: string;
  bullets: string[];
}

// section_chunk entries have no known heading macro (that's what makes them
// a section_chunk rather than a subheading/project entry) — but the common
// Jake's-resume "Technical Skills" idiom is a single itemize/\item wrapping
// several `\textbf{Category}{: values}` lines separated by `\\`. Handle that
// specifically rather than dumping stripped-but-still-brace-laden text.
// Inverse of renderSectionChunkBody (synthesize-jake-latex.ts): recombines
// each `\textbf{Category}{: values}` pair back into one "Category: values"
// line, one per `\\`-separated line. Shared by the preview (below) and the
// structured reverse-parser (bank-entry-fields.ts), which both need the same
// per-line split, just packaged differently.
export function parseSectionChunkLines(rawLatex: string): string[] {
  const body = rawLatex
    .replace(/\\begin\{[^}]*\}(\[[^\]]*\])?/g, " ")
    .replace(/\\end\{[^}]*\}/g, " ")
    .replace(/\\(?:small|normalsize|item)\b/g, " ")
    .replace(/\\textbf\{([^{}]*)\}\{([^{}]*)\}/g, "$1$2"); // Category + {: values} idiom

  return body
    .split("\\\\")
    .map((line) => cleanLatexText(line).replace(/[{}]/g, ""))
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseSectionChunkPreview(rawLatex: string): EntryPreview {
  const lines = parseSectionChunkLines(rawLatex);
  if (lines.length > 1) return { title: "", bullets: lines };
  const body = rawLatex
    .replace(/\\begin\{[^}]*\}(\[[^\]]*\])?/g, " ")
    .replace(/\\end\{[^}]*\}/g, " ");
  const text = (lines[0] ?? cleanLatexText(body).replace(/[{}]/g, "")).trim();
  return { title: text.slice(0, 200) || "Section content", bullets: [] };
}

// The name/contact block (see extract.ts's headerSection) is centered plain
// text — a name line, then a `\\`-separated contact line — not an itemized
// list, so it must not go through parseSectionChunkPreview's "multiple
// `\\`-separated lines ⇒ bullets" heuristic (that's for the Technical
// Skills idiom). First line is the name/title; the rest join into one
// contact line.
export function parseHeaderChunkPreview(rawLatex: string): EntryPreview {
  const body = rawLatex
    .replace(/\\begin\{[^}]*\}(\[[^\]]*\])?/g, " ")
    .replace(/\\end\{[^}]*\}/g, " ");

  const lines = body
    .split("\\\\")
    .map((line) => cleanLatexText(line))
    .filter(Boolean);

  const [title, ...rest] = lines;
  return { title: title ?? "", meta: rest.join(" ") || undefined, bullets: [] };
}

export function parseJakeEntryPreview(kind: string, rawLatex: string): EntryPreview {
  const bullets = extractItems(rawLatex);

  if (kind === "header_chunk") return parseHeaderChunkPreview(rawLatex);

  if (kind === "project_entry") {
    const idx = rawLatex.indexOf("\\resumeProjectHeading");
    if (idx === -1) return { title: "Untitled project", bullets };
    const [titleLine, date] = readBalancedArgs(
      rawLatex.slice(idx + "\\resumeProjectHeading".length),
      2,
    );
    const { title, meta } = parseProjectTitle(titleLine);
    return { title, subtitle: cleanLatexText(date), meta, bullets };
  }

  if (kind === "subheading_entry") {
    const idx = rawLatex.indexOf("\\resumeSubheading");
    if (idx === -1) return { title: "Untitled entry", bullets };
    const [title, date, org, location] = readBalancedArgs(
      rawLatex.slice(idx + "\\resumeSubheading".length),
      4,
    );
    return {
      title: cleanLatexText(title),
      subtitle: cleanLatexText(date),
      meta: cleanLatexText(org),
      location: cleanLatexText(location),
      bullets,
    };
  }

  return parseSectionChunkPreview(rawLatex);
}
