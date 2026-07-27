// A light, non-authoritative reader for Jake's-Resume-family macros
// (see src/lib/adapters/jakes-resume-v1/macros.ts for the real contract).
// This is purely for the bank pane's "what does this look like" preview —
// it never touches raw_latex, which stays immutable and is never
// regenerated from a parse (see PLAN.md).

function readBalancedArgs(str: string, count: number): string[] {
  const args: string[] = [];
  let i = 0;
  for (let a = 0; a < count; a++) {
    while (i < str.length && str[i] !== "{") i++;
    if (str[i] !== "{") {
      args.push("");
      continue;
    }
    const start = i;
    let depth = 0;
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
    args.push(str.slice(start + 1, i - 1));
  }
  return args;
}

function cleanLatexText(s: string): string {
  return s
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1")
    .replace(/\\textbf\{([^{}]*)\}/g, "$1")
    .replace(/\\textit\{([^{}]*)\}/g, "$1")
    .replace(/\\emph\{([^{}]*)\}/g, "$1")
    .replace(/\$\|\$/g, "•")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\\\/g, " ")
    .replace(/~/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractItems(latex: string): string[] {
  const items: string[] = [];
  const re = /\\resumeSubItem|\\resumeItem/g;
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
function parseProjectTitle(titleLine: string): { title: string; meta?: string } {
  const bold = titleLine.match(/\\textbf\{([^{}]*)\}/);
  if (!bold) return { title: cleanLatexText(titleLine) };
  const emph = titleLine.match(/\\emph\{([^{}]*)\}/);
  return { title: cleanLatexText(bold[1]), meta: emph ? cleanLatexText(emph[1]) : undefined };
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
function parseSectionChunkPreview(rawLatex: string): EntryPreview {
  const body = rawLatex
    .replace(/\\begin\{[^}]*\}(\[[^\]]*\])?/g, " ")
    .replace(/\\end\{[^}]*\}/g, " ")
    .replace(/\\(?:small|normalsize|item)\b/g, " ")
    .replace(/\\textbf\{([^{}]*)\}\{([^{}]*)\}/g, "$1$2"); // Category + {: values} idiom

  const lines = body
    .split("\\\\")
    .map((line) => cleanLatexText(line).replace(/[{}]/g, ""))
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) return { title: "", bullets: lines };
  const text = (lines[0] ?? cleanLatexText(body).replace(/[{}]/g, "")).trim();
  return { title: text.slice(0, 200) || "Section content", bullets: [] };
}

export function parseJakeEntryPreview(kind: string, rawLatex: string): EntryPreview {
  const bullets = extractItems(rawLatex);

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
