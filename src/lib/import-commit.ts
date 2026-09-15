import { randomUUID } from "crypto";
import { asRow, asRows, ownerScopedTable, type ServiceClient } from "@/lib/db";
import { dedupedName } from "@/lib/unique-db-name";
import { uploadArchive, deleteArchive } from "@/lib/storage";
import { z } from "zod";
import { materializeStructuredFields } from "@/lib/entry-materialization";
import type { BankEntryKind, ExtractedResume } from "@/lib/adapters/types";
import type { FlatEntry } from "@/lib/flatten-entries";

export { flattenEntries } from "@/lib/flatten-entries";
export type { FlatEntry } from "@/lib/flatten-entries";

// Exact-duplicate matching should ignore incidental whitespace differences
// (trailing spaces, blank lines) without doing any semantic comparison.
export function normalizeLatex(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export async function loadNormalizedLatexSet(
  ownerId: string,
  client?: ServiceClient,
): Promise<Set<string>> {
  const { data, error } = await ownerScopedTable(
    "bank_entry",
    ownerId,
    client,
  ).select("raw_latex");
  if (error) throw new Error(error.message);
  return new Set(
    ((data ?? []) as unknown as { raw_latex: string }[]).map((row) =>
      normalizeLatex(row.raw_latex),
    ),
  );
}
export type EntryOverride = {
  index: number;
  displayName?: string;
  excluded?: boolean;
  // Explicit inclusion overrides the server's exact-duplicate filter.
  includeDuplicate?: boolean;
  entryFields?: unknown;
  headerFields?: unknown;
};

const EntryOverrideSchema = z
  .object({
    index: z.number().int().nonnegative(),
    displayName: z.string().optional(),
    excluded: z.boolean().optional(),
    includeDuplicate: z.boolean().optional(),
    entryFields: z.unknown().optional(),
    headerFields: z.unknown().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.entryFields === undefined || value.headerFields === undefined,
    { message: "entryFields and headerFields are mutually exclusive" },
  );

const EntryOverridesSchema = z
  .array(EntryOverrideSchema)
  .superRefine((overrides, context) => {
    const indices = new Set<number>();
    for (const override of overrides) {
      if (indices.has(override.index)) {
        context.addIssue({
          code: "custom",
          message: `duplicate override index ${override.index}`,
        });
      }
      indices.add(override.index);
    }
  });

export function parseOverrides(raw: unknown): EntryOverride[] {
  if (raw === null || raw === undefined || raw === "") return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("overrides are not valid JSON");
    }
  }
  const result = EntryOverridesSchema.safeParse(parsed);
  if (!result.success) throw new Error("invalid overrides");
  return result.data;
}

// Touched entries are rematerialized server-side so clients never supply raw LaTeX.
export function applyOverrides(
  entries: FlatEntry[],
  overrides: EntryOverride[],
): FlatEntry[] {
  const byIndex = new Map(overrides.map((o) => [o.index, o]));
  const result: FlatEntry[] = [];
  for (const entry of entries) {
    const override = byIndex.get(entry.index);
    if (override?.excluded) continue;

    let rawLatex = entry.rawLatex;
    let displayName = entry.displayName;
    let sourceOffsetStart = entry.sourceOffsetStart;
    let sourceOffsetEnd = entry.sourceOffsetEnd;

    if (override) {
      const materialized = materializeStructuredFields({
        entry: override.entryFields,
        header: override.headerFields,
        currentDisplayName: displayName,
        expectedKind: entry.kind as BankEntryKind,
      });
      if (materialized) {
        rawLatex = materialized.rawLatex;
        displayName = materialized.displayName;
        sourceOffsetStart = materialized.sourceOffsetStart;
        sourceOffsetEnd = materialized.sourceOffsetEnd;
      }
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
  client,
}: {
  ownerId: string;
  archivePath: string;
  sourceResumeId?: string;
  createdShellId?: string;
  client?: ServiceClient;
}) {
  if (sourceResumeId) {
    await ownerScopedTable("bank_entry", ownerId, client)
      .delete()
      .eq("source_resume_id", sourceResumeId)
      .then(
        () => undefined,
        () => undefined,
      );
    await ownerScopedTable("source_resume", ownerId, client)
      .delete()
      .eq("id", sourceResumeId)
      .then(
        () => undefined,
        () => undefined,
      );
  }
  if (createdShellId) {
    await ownerScopedTable("template_shell", ownerId, client)
      .delete()
      .eq("id", createdShellId)
      .then(
        () => undefined,
        () => undefined,
      );
  }
  const [shellReference, sourceReference] = await Promise.all([
    ownerScopedTable("template_shell", ownerId, client)
      .select("id")
      .eq("archive_path", archivePath)
      .limit(1)
      .maybeSingle(),
    ownerScopedTable("source_resume", ownerId, client)
      .select("id")
      .eq("archive_path", archivePath)
      .limit(1)
      .maybeSingle(),
  ]);
  if (
    !shellReference.error &&
    !sourceReference.error &&
    !shellReference.data &&
    !sourceReference.data
  ) {
    await deleteArchive(archivePath, client).catch(() => undefined);
  }
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
  desiredDisplayName: string;
  client?: ServiceClient;
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
  client,
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
  await uploadArchive(archivePath, archiveBytes, "application/zip", client);

  const partial: { sourceResumeId?: string; createdShellId?: string } = {};
  try {
    // A fingerprint identifies one reusable shell for an owner and adapter.
    const shells = ownerScopedTable("template_shell", ownerId, client);
    const { data: existingShell, error: shellLookupError } = asRow<{
      id: string;
    }>(
      await shells
        .select("id")
        .eq("adapter_id", adapterId)
        .eq("fingerprint", fingerprint)
        .limit(1)
        .maybeSingle(),
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
      if (insertShellError?.code === "23505") {
        const { data: concurrentShell, error: concurrentShellError } = asRow<{
          id: string;
        }>(
          await shells
            .select("id")
            .eq("adapter_id", adapterId)
            .eq("fingerprint", fingerprint)
            .limit(1)
            .single(),
        );
        if (concurrentShellError) throw new Error(concurrentShellError.message);
        templateShellId = concurrentShell!.id;
      } else {
        if (insertShellError) throw new Error(insertShellError.message);
        templateShellId = newShell!.id;
        partial.createdShellId = templateShellId;
      }
    }

    const displayName = await dedupedName(
      "source_resume",
      "display_name",
      desiredDisplayName,
      {
        excludeNulls: true,
        ownerId,
        client,
      },
    );

    const { data: sourceResume, error: sourceResumeError } = asRow<{
      id: string;
    }>(
      await ownerScopedTable("source_resume", ownerId, client)
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
    for (const entryRow of entryRows)
      entryRow.source_resume_id = sourceResumeId;

    // Include earlier batch entries so one import cannot create duplicates.
    const seen = await loadNormalizedLatexSet(ownerId, client);
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
        : await ownerScopedTable("bank_entry", ownerId, client)
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
    await cleanupFailedImport({ ownerId, archivePath, client, ...partial });
    throw error;
  }
}
