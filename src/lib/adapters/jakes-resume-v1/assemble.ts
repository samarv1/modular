import type { AssembledLatexProject, ResumeComposition } from "../types";

const USEPACKAGE_RE = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;

function declaredPackages(preamble: string): Set<string> {
  const packages = new Set<string>();
  for (const match of preamble.matchAll(USEPACKAGE_RE)) {
    for (const name of match[1].split(",")) packages.add(name.trim());
  }
  return packages;
}

/**
 * Preamble-union rule (PLAN.md): the designated shell's preamble is the
 * base, plus any \usepackage a contributing entry needs that the shell
 * doesn't already declare. required_packages only stores bare names (not
 * options), so a shell's own \usepackage lines are never rewritten —
 * missing ones are appended bare. That's what "first-contributor-wins"
 * resolves to here: the shell (always a contributor) keeps whatever
 * options its own line carries.
 */
export function assembleJakeResume(input: ResumeComposition): AssembledLatexProject {
  const declared = declaredPackages(input.shellPreamble);
  const missing = new Set<string>();
  for (const section of input.sections) {
    for (const entry of section.entries) {
      for (const pkg of entry.requiredPackages) {
        if (!declared.has(pkg)) missing.add(pkg);
      }
    }
  }

  const preamble =
    missing.size === 0
      ? input.shellPreamble
      : `${input.shellPreamble}\n${[...missing].map((pkg) => `\\usepackage{${pkg}}`).join("\n")}\n`;

  const body = input.sections
    .map((section) => {
      // header_chunk is the name/contact block that precedes any \section{}
      // in the source — render it as-is with no \section wrapper.
      if (section.entries.length === 1 && section.entries[0].kind === "header_chunk") {
        return section.entries[0].rawLatex;
      }
      // section_chunk occupies its section exclusively (PLAN.md) — it's
      // opaque, already-structured content, so it's placed as-is rather
      // than wrapped in the subheading list macros.
      const isChunk = section.entries.length === 1 && section.entries[0].kind === "section_chunk";
      const inner = isChunk
        ? section.entries[0].rawLatex
        : `\\resumeSubHeadingListStart\n${section.entries.map((e) => e.rawLatex).join("\n\n")}\n\\resumeSubHeadingListEnd`;
      return `\\section{${section.title}}\n${inner}`;
    })
    .join("\n\n");

  return { source: `${preamble}\n\\begin{document}\n${body}\n\\end{document}\n` };
}
