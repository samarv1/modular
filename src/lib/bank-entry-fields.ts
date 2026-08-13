import {
  extractItems,
  parseHeaderChunkPreview,
  parseProjectTitle,
  parseSectionChunkLines,
  readBalancedArgs,
} from "@/lib/jake-entry-preview";
import { HeaderDataSchema, type ExtractedEntry } from "@/lib/resume-extraction-schema";
import type { BankEntryRow } from "@/lib/rows";
import type { z } from "zod";

// Reverse of renderEntry/renderHeader (synthesize-jake-latex.ts): turns an
// existing bank_entry's immutable raw_latex back into the same structured
// field shape the PDF-import review screen already edits, so an existing
// entry can be loaded into that editor. Only bank_entry's own kinds
// (subheading_entry, project_entry, section_chunk, header_chunk) are
// handled — anything else falls back to an empty, title-only shell rather
// than throwing, since a malformed/legacy entry should still open for
// editing.
export function bankEntryToExtractedEntry(entry: BankEntryRow): ExtractedEntry {
  const { kind, source_section: sourceSection, raw_latex: rawLatex } = entry;

  if (kind === "subheading_entry") {
    const idx = rawLatex.indexOf("\\resumeSubheading");
    if (idx === -1) return { kind, sourceSection, title: entry.display_name, bullets: [] };
    const [title, date, organization, location] = readBalancedArgs(
      rawLatex.slice(idx + "\\resumeSubheading".length),
      4,
    );
    return {
      kind,
      sourceSection,
      title,
      date,
      organization,
      location,
      bullets: extractItems(rawLatex),
    };
  }

  if (kind === "project_entry") {
    const idx = rawLatex.indexOf("\\resumeProjectHeading");
    if (idx === -1) return { kind, sourceSection, title: entry.display_name, bullets: [] };
    const [titleLine, date] = readBalancedArgs(
      rawLatex.slice(idx + "\\resumeProjectHeading".length),
      2,
    );
    const { title, meta: stack } = parseProjectTitle(titleLine);
    return { kind, sourceSection, title, date, stack, bullets: extractItems(rawLatex) };
  }

  if (kind === "section_chunk") {
    return { kind, sourceSection, items: parseSectionChunkLines(rawLatex) };
  }

  return { kind: "section_chunk", sourceSection, items: [] };
}

export function bankEntryToHeaderData(entry: BankEntryRow): z.infer<typeof HeaderDataSchema> {
  const preview = parseHeaderChunkPreview(entry.raw_latex);
  return { name: preview.title, contactLine: preview.meta ?? "" };
}
