import type { ExtractedEntry, ExtractedResume, LatexNode } from "../types";
import { checkJakeContract } from "./fingerprint";
import { collapseWhitespace, documentBody, nodeToPlainText, parseJakeSource } from "./parse";
import { ENTRY_BOUNDARY_MACROS } from "./macros";
import { declaredPackages } from "./packages";
import { entryDisplayName } from "@/lib/entry-display-name";

function isMeaningful(node: LatexNode): boolean {
  return node.type !== "whitespace" && node.type !== "parbreak" && node.type !== "comment";
}

function argText(node: LatexNode, argIndex: number): string {
  const arg = node.args?.[argIndex];
  return arg ? collapseWhitespace(nodeToPlainText(arg.content)) : "";
}

// Pulls the (title, organization) pair a boundary node's display name is
// derived from, then defers to the shared entryDisplayName rule.
function nodeDisplayName(node: LatexNode, kind: "project_entry" | "subheading_entry"): string {
  if (kind === "project_entry") {
    // arg0 is typically `\textbf{Name} $|$ \emph{tech, stack}` — plain-texting
    // the whole group runs the name and the tech stack together. Pull just
    // the \textbf{} part when present.
    const arg0 = node.args?.[0]?.content ?? [];
    const bold = arg0.find((n) => n.type === "macro" && n.content === "textbf");
    const title = bold?.args?.[0] ? collapseWhitespace(nodeToPlainText(bold.args[0].content)) : argText(node, 0);
    return entryDisplayName(kind, title, undefined, "");
  }
  return entryDisplayName(kind, argText(node, 0), argText(node, 2), "");
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
    const kind = node.content === "resumeProjectHeading" ? "project_entry" : "subheading_entry";
    return {
      kind,
      sourceSection: sectionTitle,
      displayName: nodeDisplayName(node, kind),
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
  const requiredPackages = declaredPackages(preamble);

  const sectionNodes = body
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === "macro" && node.content === "section");

  // Content before the first \section{} — the name/contact block in Jake's
  // template — isn't a section at all, so it can't go through
  // extractSectionEntries' subheading/project boundary logic. It's captured
  // as its own header_chunk entry instead; assemble() knows to render it
  // without a \section{title} wrapper.
  const headerBody = body.slice(0, sectionNodes[0]?.index ?? body.length);
  const headerMeaningful = headerBody.filter((n) => isMeaningful(n) && n.position);
  const headerSection =
    headerMeaningful.length === 0
      ? []
      : [
          {
            title: "Name & Contact",
            entries: [
              {
                kind: "header_chunk" as const,
                sourceSection: "Name & Contact",
                displayName: "Name & Contact",
                rawLatex: source.slice(
                  headerMeaningful[0].position!.start.offset,
                  headerMeaningful[headerMeaningful.length - 1].position!.end.offset,
                ),
                sourceOffsetStart: headerMeaningful[0].position!.start.offset,
                sourceOffsetEnd: headerMeaningful[headerMeaningful.length - 1].position!.end.offset,
                requiredPackages,
              },
            ],
          },
        ];

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
    sections: [...headerSection, ...sections],
  };
}
