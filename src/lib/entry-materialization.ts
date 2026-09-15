import { entryDisplayName } from "@/lib/entry-display-name";
import {
  ExtractedEntrySchema,
  HeaderDataSchema,
  type ExtractedEntry,
  type ResumeExtraction,
} from "@/lib/resume-extraction-schema";
import { renderEntry, renderHeader } from "@/lib/synthesize-jake-latex";
import type { BankEntryKind } from "@/lib/adapters/types";

export class EntryMaterializationError extends Error {}

export type EntryMaterialization = {
  rawLatex: string;
  displayName: string;
  sourceOffsetStart: null;
  sourceOffsetEnd: null;
};

function requiredFieldError(entry: ExtractedEntry): string | null {
  if (entry.kind === "section_chunk") {
    return entry.items?.some((item) => item.trim())
      ? null
      : `"${entry.sourceSection}" entry missing items`;
  }
  return entry.title?.trim()
    ? null
    : `"${entry.sourceSection}" entry missing a title`;
}

export function materializeEntryFields(fields: unknown): EntryMaterialization {
  const parsed = ExtractedEntrySchema.safeParse(fields);
  if (!parsed.success) {
    throw new EntryMaterializationError("invalid entry fields");
  }
  const missing = requiredFieldError(parsed.data);
  if (missing) throw new EntryMaterializationError(missing);

  return {
    rawLatex: renderEntry(parsed.data),
    displayName: entryDisplayName(
      parsed.data.kind,
      parsed.data.title,
      parsed.data.organization,
      parsed.data.sourceSection,
    ),
    sourceOffsetStart: null,
    sourceOffsetEnd: null,
  };
}

export function materializeHeaderFields(
  fields: unknown,
  displayName: string,
): EntryMaterialization {
  const parsed = HeaderDataSchema.safeParse(fields);
  if (!parsed.success || !parsed.data.name.trim()) {
    throw new EntryMaterializationError("invalid header fields");
  }
  return {
    rawLatex: renderHeader(parsed.data),
    displayName,
    sourceOffsetStart: null,
    sourceOffsetEnd: null,
  };
}

export function materializeStructuredFields({
  entry,
  header,
  currentDisplayName,
  expectedKind,
}: {
  entry?: unknown;
  header?: unknown;
  currentDisplayName: string;
  expectedKind?: BankEntryKind;
}): EntryMaterialization | null {
  if (entry !== undefined && header !== undefined) {
    throw new EntryMaterializationError(
      "entry and header fields are mutually exclusive",
    );
  }
  if (entry !== undefined) {
    if (expectedKind === "header_chunk") {
      throw new EntryMaterializationError("invalid entry fields");
    }
    const materialized = materializeEntryFields(entry);
    if (
      expectedKind !== undefined &&
      (entry as { kind?: unknown }).kind !== expectedKind
    ) {
      throw new EntryMaterializationError("entry kind cannot be changed");
    }
    return materialized;
  }
  if (header !== undefined) {
    if (expectedKind !== undefined && expectedKind !== "header_chunk") {
      throw new EntryMaterializationError("invalid header fields");
    }
    return materializeHeaderFields(header, currentDisplayName);
  }
  return null;
}

export function validateExtractionRequiredFields(
  extraction: ResumeExtraction,
): string[] {
  const errors: string[] = [];
  for (const section of extraction.sections) {
    for (const entry of section.entries) {
      try {
        materializeEntryFields(entry);
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : "invalid entry fields",
        );
      }
    }
  }
  return errors;
}
