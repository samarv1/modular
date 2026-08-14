import { randomUUID } from "crypto";
import { asRow, asRows, ownerScopedTable } from "@/lib/db";
import { dedupedName } from "@/lib/deduped-name";
import { uploadArchive, deleteArchive } from "@/lib/storage";
import type { ExtractedResume } from "@/lib/adapters/types";
import { renderEntry, renderHeader } from "@/lib/synthesize-jake-latex";
import { ExtractedEntrySchema, HeaderDataSchema } from "@/lib/resume-extraction-schema";
import { entryDisplayName } from "@/lib/entry-display-name";

// Shared by both import entry points (POST /api/imports for real .zip
// uploads, POST /api/pdf-imports for synthesized-from-PDF ones): everything
// downstream of "we have a compatible ExtractedResume and the zip bytes it
// came from" is identical — same template_shell fingerprint reuse, same
// exact-duplicate bank_entry detection, same failure cleanup.

// Exact-duplicate matching should ignore incidental whitespace differences
// (trailing spaces, blank lines) without doing any semantic comparison.
export function normalizeLatex(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

// Flat, index-stable view of every extracted entry, in the same order
// section-by-section that the DB insert eventually uses. `mode=preview` and
// `mode=commit` both derive this from an identical parse/extract of the same
// file, so an override's `index` addresses the same entry in either call.
export type FlatEntry = {
  index: number;
  kind: string;
  sourceSection: string;
  displayName: string;
  rawLatex: string;
  sourceOffsetStart: number | null;
  sourceOffsetEnd: number | null;
  requiredPackages: string[];
};

export function flattenEntries(extracted: ExtractedResume): FlatEntry[] {
  let index = 0;
  return extracted.sections.flatMap((section) =>
    section.entries.map((entry) => ({
      index: index++,
      kind: entry.kind,
      sourceSection: section.title,
      displayName: entry.displayName,
      rawLatex: entry.rawLatex,
      sourceOffsetStart: entry.sourceOffsetStart ?? null,
      sourceOffsetEnd: entry.sourceOffsetEnd ?? null,
      requiredPackages: entry.requiredPackages,
    })),
  );
}

export type EntryOverride = {
  index: number;
  displayName?: string;
  excluded?: boolean;
  // The review modal auto-excludes entries flagged isDuplicate in preview
  // (see mode=preview's existingNormalized check); this says the user
  // explicitly opted back in, so the exact-duplicate filter further down
  // must not silently drop it again.
  includeDuplicate?: boolean;
  // Structured field edits for a touched entry, keyed by kind (mirrors
  // PATCH /api/entries/:id's entry/header mutual exclusivity). Validated
  // against ExtractedEntrySchema/HeaderDataSchema in applyOverrides, so an
  // entry the user never touched in the review UI has neither set, and
  // keeps its original byte-for-byte rawLatex.
  entryFields?: unknown;
  headerFields?: unknown;
};

export function parseOverrides(raw: unknown): EntryOverride[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (o): o is EntryOverride => typeof o === "object" && o !== null && typeof (o as EntryOverride).index === "number",
  );
}

// Regenerates a touched entry's rawLatex from user-edited structured fields
// (same renderEntry/renderHeader path PATCH /api/entries/:id uses for an
// existing bank entry), server-side, so the client never has to be trusted
// with raw LaTeX text directly. Throws on an invalid or incomplete
// entryFields/headerFields payload (same required-fields check as
// /api/pdf-imports's commit path, since this now accepts the same
// structured shape from the same editor) so the caller fails the whole
// commit instead of silently keeping the entry's stale, pre-edit rawLatex.
export function applyOverrides(entries: FlatEntry[], overrides: EntryOverride[]): FlatEntry[] {
  const byIndex = new Map(overrides.map((o) => [o.index, o]));
  const result: FlatEntry[] = [];
  for (const entry of entries) {
    const override = byIndex.get(entry.index);
    if (override?.excluded) continue;

    let rawLatex = entry.rawLatex;
    let displayName = entry.displayName;
    let sourceOffsetStart = entry.sourceOffsetStart;
    let sourceOffsetEnd = entry.sourceOffsetEnd;

    if (override?.entryFields !== undefined) {
      const parsed = ExtractedEntrySchema.safeParse(override.entryFields);
      if (!parsed.success) throw new Error(`invalid fields for entry ${entry.index}`);
      // ExtractedEntrySchema leaves title/items optional (see
      // resume-extraction-schema.ts), so an edit that clears the one field
      // its kind actually needs has to be caught here too, same as
      // /api/pdf-imports's commit path, otherwise it'd silently synthesize
      // e.g. `\resumeSubheading{}{}{}{}` with an empty display name.
      const missingRequired =
        parsed.data.kind === "section_chunk"
          ? !parsed.data.items || parsed.data.items.length === 0
          : !parsed.data.title;
      if (missingRequired) {
        throw new Error(
          `"${parsed.data.sourceSection}" entry missing ${parsed.data.kind === "section_chunk" ? "items" : "a title"}`,
        );
      }
      rawLatex = renderEntry(parsed.data);
      displayName = entryDisplayName(
        parsed.data.kind,
        parsed.data.title,
        parsed.data.organization,
        parsed.data.sourceSection,
      );
      sourceOffsetStart = null;
      sourceOffsetEnd = null;
    } else if (override?.headerFields !== undefined) {
      const parsed = HeaderDataSchema.safeParse(override.headerFields);
      if (!parsed.success) throw new Error(`invalid header fields for entry ${entry.index}`);
      rawLatex = renderHeader(parsed.data);
      sourceOffsetStart = null;
      sourceOffsetEnd = null;
    }

    result.push({
      ...entry,
      rawLatex,
      sourceOffsetStart,
      sourceOffsetEnd,
      displayName:
        typeof override?.displayName === "string" && override.displayName.trim()
          ? override.displayName.trim()
          : displayName,
    });
  }
  return result;
}

async function cleanupFailedImport({
  ownerId,
  archivePath,
  sourceResumeId,
  createdShellId,
}: {
  ownerId: string;
  archivePath: string;
  sourceResumeId?: string;
  createdShellId?: string;
}) {
  if (sourceResumeId) {
    await ownerScopedTable("bank_entry", ownerId)
      .delete()
      .eq("source_resume_id", sourceResumeId)
      .then(() => undefined, () => undefined);
    await ownerScopedTable("source_resume", ownerId)
      .delete()
      .eq("id", sourceResumeId)
      .then(() => undefined, () => undefined);
  }
  if (createdShellId) {
    await ownerScopedTable("template_shell", ownerId)
      .delete()
      .eq("id", createdShellId)
      .then(() => undefined, () => undefined);
  }
  await deleteArchive(archivePath).catch(() => undefined);
}

export interface CommitImportParams {
  ownerId: string;
  adapterId: string;
  fingerprint: string;
  rootFile: string;
  preamble: string;
  archiveBytes: Uint8Array;
  extracted: ExtractedResume;
  finalEntries: FlatEntry[];
  forceIncludeIndices: Set<number>;
  /** Filename (no extension) used as the default source_resume display name. */
  desiredDisplayName: string;
}

export async function commitImport({
  ownerId,
  adapterId,
  fingerprint,
  rootFile,
  preamble,
  archiveBytes,
  extracted,
  finalEntries,
  forceIncludeIndices,
  desiredDisplayName,
}: CommitImportParams) {
  const entryRows = finalEntries.map((entry) => ({
    source_resume_id: "",
    kind: entry.kind,
    source_section: entry.sourceSection,
    raw_latex: entry.rawLatex,
    source_offset_start: entry.sourceOffsetStart,
    source_offset_end: entry.sourceOffsetEnd,
    required_packages: entry.requiredPackages,
    display_name: entry.displayName,
    tags: [] as string[],
  }));

  const archivePath = `${ownerId}/${randomUUID()}.zip`;
  await uploadArchive(archivePath, archiveBytes, "application/zip");

  const partial: { sourceResumeId?: string; createdShellId?: string } = {};
  try {
    // First compatible upload for this fingerprint establishes the shell;
    // later ones reuse it (see PLAN.md: "first upload becomes the template shell").
    const shells = ownerScopedTable("template_shell", ownerId);
    const { data: existingShell, error: shellLookupError } = asRow<{ id: string }>(
      await shells.select("id").eq("adapter_id", adapterId).eq("fingerprint", fingerprint).limit(1).maybeSingle(),
    );
    if (shellLookupError) throw new Error(shellLookupError.message);

    let templateShellId = existingShell?.id;
    if (!templateShellId) {
      const { data: newShell, error: insertShellError } = asRow<{ id: string }>(
        await shells
          .insert({
            archive_path: archivePath,
            root_file: rootFile,
            adapter_id: adapterId,
            fingerprint,
            preamble,
          })
          .select("id")
          .single(),
      );
      if (insertShellError) throw new Error(insertShellError.message);
      templateShellId = newShell!.id;
      partial.createdShellId = templateShellId;
    }

    const displayName = await dedupedName("source_resume", "display_name", desiredDisplayName, {
      excludeNulls: true,
    });

    const { data: sourceResume, error: sourceResumeError } = asRow<{ id: string }>(
      await ownerScopedTable("source_resume", ownerId)
        .insert({
          template_shell_id: templateShellId,
          archive_path: archivePath,
          import_status: "success",
          display_name: displayName,
        })
        .select("id")
        .single(),
    );
    if (sourceResumeError) throw new Error(sourceResumeError.message);
    const sourceResumeId = sourceResume!.id;
    partial.sourceResumeId = sourceResumeId;
    for (const entryRow of entryRows) entryRow.source_resume_id = sourceResumeId;

    // Exact-duplicate detection: an entry is a duplicate if its raw_latex
    // (normalized) matches one already in this owner's bank, or another
    // entry earlier in this same upload batch.
    const { data: existingLatex, error: existingLatexError } = await ownerScopedTable(
      "bank_entry",
      ownerId,
    ).select("raw_latex");
    if (existingLatexError) throw new Error(existingLatexError.message);
    const seen = new Set(
      ((existingLatex ?? []) as unknown as { raw_latex: string }[]).map((row) => normalizeLatex(row.raw_latex)),
    );
    const dedupedEntryRows = entryRows.filter((entryRow, i) => {
      const normalized = normalizeLatex(entryRow.raw_latex as string);
      if (forceIncludeIndices.has(finalEntries[i].index)) {
        seen.add(normalized);
        return true;
      }
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    // Same column set as GET /api/entries, so the client can prepend these
    // straight into its BankEntryRow[] state without a refetch.
    const { data: insertedEntries, error: entriesError } = asRows<{
      id: string;
      kind: string;
      source_section: string;
      display_name: string;
      raw_latex: string;
      tags: string[];
      required_packages: string[];
      source_resume_id: string | null;
      source_resume: { display_name: string | null } | null;
      created_at: string;
    }>(
      dedupedEntryRows.length === 0
        ? { data: [], error: null }
        : await ownerScopedTable("bank_entry", ownerId)
            .insert(dedupedEntryRows)
            .select(
              "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
            ),
    );
    if (entriesError) throw new Error(entriesError.message);

    return {
      compatible: true as const,
      templateShellId,
      sourceResumeId,
      entryCount: dedupedEntryRows.length,
      entries: insertedEntries,
      sections: extracted.sections.map((section) => ({
        title: section.title,
        entryCount: section.entries.length,
      })),
    };
  } catch (error) {
    await cleanupFailedImport({ ownerId, archivePath, ...partial });
    throw error;
  }
}
