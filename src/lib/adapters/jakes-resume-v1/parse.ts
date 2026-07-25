import { getParser } from "@unified-latex/unified-latex-util-parse";
import { JAKE_MACROS } from "./macros";
import type { LatexNode } from "../types";

export function parseJakeSource(source: string): LatexNode {
  const parser = getParser({ macros: JAKE_MACROS });
  return parser.parse(source) as unknown as LatexNode;
}

/** The flat list of top-level nodes inside \begin{document}...\end{document}. */
export function documentBody(root: LatexNode): LatexNode[] {
  const content = root.content;
  if (!Array.isArray(content)) return [];
  const doc = content.find((n) => n.type === "environment" && n.env === "document");
  const body = doc?.content;
  return Array.isArray(body) ? body : [];
}

/** Best-effort flatten of a node (or arg content array) to plain text — enough for a display name, not for round-tripping LaTeX. */
export function nodeToPlainText(node: LatexNode | LatexNode[]): string {
  if (Array.isArray(node)) return node.map(nodeToPlainText).join("");
  switch (node.type) {
    case "string":
      return typeof node.content === "string" ? node.content : "";
    case "whitespace":
    case "parbreak":
      return " ";
    case "comment":
      return "";
    case "macro": {
      // Best-effort: render the macro's own args' text (e.g. \textbf{X} -> X),
      // falling back to the macro name for things like \& with no args.
      if (node.args?.length) {
        return node.args.map((a) => nodeToPlainText(a.content)).join("");
      }
      if (typeof node.content === "string" && node.content.length === 1) {
        return node.content; // e.g. \& , \$
      }
      return "";
    }
    case "group":
    case "environment":
      return Array.isArray(node.content) ? nodeToPlainText(node.content) : "";
    default:
      return "";
  }
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
