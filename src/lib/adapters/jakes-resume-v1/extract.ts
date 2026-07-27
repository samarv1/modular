import type { ExtractedEntry, ExtractedResume, LatexNode } from "../types";
import { checkJakeContract } from "./fingerprint";
import { collapseWhitespace, documentBody, nodeToPlainText, parseJakeSource } from "./parse";
import { ENTRY_BOUNDARY_MACROS } from "./macros";

const USEPACKAGE_RE = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;

function extractPackages(preamble: string): string[] {
  const packages = new Set<string>();
  for (const match of preamble.matchAll(USEPACKAGE_RE)) {
    for (const name of match[1].split(",")) packages.add(name.trim());
  }
  return [...packages];
}

function isMeaningful(node: LatexNode): boolean {
  return node.type !== "whitespace" && node.type !== "parbreak" && node.type !== "comment";
}

function argText(node: LatexNode, argIndex: number): string {
  const arg = node.args?.[argIndex];
  return arg ? collapseWhitespace(nodeToPlainText(arg.content)) : "";
}

function entryDisplayName(node: LatexNode): string {
  if (node.content === "resumeProjectHeading") {
    // arg0 is typically `\textbf{Name} $|$ \emph{tech, stack}` — plain-texting
    // the whole group runs the name and the tech stack together. Pull just
    // the \textbf{} part when present.
    const arg0 = node.args?.[0]?.content ?? [];
    const bold = arg0.find((n) => n.type === "macro" && n.content === "textbf");
    if (bold?.args?.[0]) return collapseWhitespace(nodeToPlainText(bold.args[0].content));
    return argText(node, 0);
  }
  return [argText(node, 0), argText(node, 2)].filter(Boolean).join(" — ");
}

/**
 * Extracts one section's body into entries. If the body contains no
 * resumeSubheading/resumeProjectHeading, the whole body is one section_chunk
 * (the "otherwise unrecognized but valid section body" case).
 */
function extractSectionEntries(
  sectionBody: LatexNode[],
  sectionTitle: string,
  source: string,
  requiredPackages: string[],
): ExtractedEntry[] {
  const boundaries = sectionBody
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === "macro" && ENTRY_BOUNDARY_MACROS.has(node.content as string));

  if (boundaries.length === 0) {
    const meaningful = sectionBody.filter((n) => isMeaningful(n) && n.position);
    if (meaningful.length === 0) return [];
    const start = meaningful[0].position!.start.offset;
    const end = meaningful[meaningful.length - 1].position!.end.offset;
    return [
      {
        kind: "section_chunk",
        sourceSection: sectionTitle,
        displayName: sectionTitle,
        rawLatex: source.slice(start, end),
        sourceOffsetStart: start,
        sourceOffsetEnd: end,
        requiredPackages,
      },
    ];
  }

  const listEndIndex = sectionBody.findIndex(
    (n) => n.type === "macro" && n.content === "resumeSubHeadingListEnd",
  );
  const fallbackEnd =
    listEndIndex >= 0
      ? sectionBody[listEndIndex].position?.start.offset
      : sectionBody[sectionBody.length - 1]?.position?.end.offset;

  return boundaries.map(({ node }, i) => {
    const next = boundaries[i + 1];
    const endOffset = next
      ? next.node.position!.start.offset
      : (fallbackEnd ?? node.position!.end.offset);
    const startOffset = node.position!.start.offset;
    return {
      kind: node.content === "resumeProjectHeading" ? "project_entry" : "subheading_entry",
      sourceSection: sectionTitle,
      displayName: entryDisplayName(node),
      rawLatex: source.slice(startOffset, endOffset),
      sourceOffsetStart: startOffset,
      sourceOffsetEnd: endOffset,
      requiredPackages,
    };
  });
}

export function extractJakeResume(source: string): ExtractedResume {
  const contract = checkJakeContract(source);
  if (!contract.compatible) {
    throw new Error(
      `Source does not satisfy the Jake macro contract: missing=[${contract.missing.join(", ")}] mismatched=[${contract.mismatched.map((m) => `${m.macro} expected ${m.expected} found ${m.found}`).join(", ")}]`,
    );
  }

  const root = parseJakeSource(source);
  const body = documentBody(root);
  const docEnvOffset = (root.content as LatexNode[]).find(
    (n) => n.type === "environment" && n.env === "document",
  )?.position?.start.offset;
  const preamble = source.slice(0, docEnvOffset ?? 0);
  const requiredPackages = extractPackages(preamble);

  const sectionNodes = body
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === "macro" && node.content === "section");

  const sections = sectionNodes.map(({ node, index }, i) => {
    const title = collapseWhitespace(argText(node, 3));
    const bodyStart = index + 1;
    const bodyEnd = sectionNodes[i + 1]?.index ?? body.length;
    const sectionBody = body.slice(bodyStart, bodyEnd);
    return {
      title,
      entries: extractSectionEntries(sectionBody, title, source, requiredPackages),
    };
  });

  return {
    fingerprint: contract.fingerprint!,
    preamble,
    requiredPackages,
    sections,
  };
}
