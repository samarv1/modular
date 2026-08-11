import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { detectAdapter } from "@/lib/adapters/registry";
import { ArchiveRejectedError, parseLatexArchive } from "@/lib/latex-archive";
import { deleteArchive, uploadArchive } from "@/lib/storage";
import { dedupedName } from "@/lib/deduped-name";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";
import { asRow, asRows } from "@/lib/supabase-result";
import type { ExtractedResume } from "@/lib/adapters/types";

// Exact-duplicate matching should ignore incidental whitespace differences
// (trailing spaces, blank lines) without doing any semantic comparison.
function normalizeLatex(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

// Flat, index-stable view of every extracted entry, in the same order
// section-by-section that the DB insert eventually uses. `mode=preview` and
// `mode=commit` both derive this from an identical parse/extract of the same
// file, so an override's `index` addresses the same entry in either call.
type FlatEntry = {
  index: number;
  kind: string;
  sourceSection: string;
  displayName: string;
  rawLatex: string;
  sourceOffsetStart: number | null;
  sourceOffsetEnd: number | null;
  requiredPackages: string[];
};

function flattenEntries(extracted: ExtractedResume): FlatEntry[] {
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

type EntryOverride = {
  index: number;
  displayName?: string;
  excluded?: boolean;
  // The review modal auto-excludes entries flagged isDuplicate in preview
  // (see mode=preview's existingNormalized check below); this says the user
  // explicitly opted back in, so the exact-duplicate filter further down
  // must not silently drop it again.
  includeDuplicate?: boolean;
};

function parseOverrides(raw: FormDataEntryValue | null): EntryOverride[] {
  if (typeof raw !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (o): o is EntryOverride => typeof o === "object" && o !== null && typeof (o as EntryOverride).index === "number",
  );
}

function applyOverrides(entries: FlatEntry[], overrides: EntryOverride[]): FlatEntry[] {
  const byIndex = new Map(overrides.map((o) => [o.index, o]));
  const result: FlatEntry[] = [];
  for (const entry of entries) {
    const override = byIndex.get(entry.index);
    if (override?.excluded) continue;
    result.push({
      ...entry,
      displayName:
        typeof override?.displayName === "string" && override.displayName.trim()
          ? override.displayName.trim()
          : entry.displayName,
    });
  }
  return result;
}

async function cleanupFailedImport({
  archivePath,
  sourceResumeId,
  createdShellId,
}: {
  archivePath: string;
  sourceResumeId?: string;
  createdShellId?: string;
}) {
  if (sourceResumeId) {
    await ownerScopedTable("bank_entry")
      .delete()
      .eq("source_resume_id", sourceResumeId)
      .then(() => undefined, () => undefined);
    await ownerScopedTable("source_resume")
      .delete()
      .eq("id", sourceResumeId)
      .then(() => undefined, () => undefined);
  }
  if (createdShellId) {
    await ownerScopedTable("template_shell")
      .delete()
      .eq("id", createdShellId)
      .then(() => undefined, () => undefined);
  }
  await deleteArchive(archivePath).catch(() => undefined);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "body must be multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (file.size > MAX_ARCHIVE_BYTES) {
    return NextResponse.json(
      { error: `archive exceeds the ${MAX_ARCHIVE_BYTES} byte limit` },
      { status: 413 },
    );
  }
  const mode = form.get("mode") === "preview" ? "preview" : "commit";

  const zipBytes = new Uint8Array(await file.arrayBuffer());

  let archive;
  try {
    archive = await parseLatexArchive(zipBytes);
  } catch (err) {
    if (err instanceof ArchiveRejectedError) {
      return NextResponse.json(
        { error: err.reason, details: err.details },
        { status: 422 },
      );
    }
    throw err;
  }

  const { adapter, result } = detectAdapter({
    rootFile: archive.rootFile,
    source: archive.source,
  });

  if (!adapter || !result.compatible) {
    // Not persisted — an incompatible upload was never really "imported"
    // (see PLAN.md Phase 3 notes). The client gets the mismatch report only.
    return NextResponse.json(
      { compatible: false, mismatchReport: result.mismatchReport },
      { status: 422 },
    );
  }

  const extracted = adapter.extract({ rootFile: archive.rootFile, source: archive.source });
  const flatEntries = flattenEntries(extracted);
  if (flatEntries.length === 0) {
    return NextResponse.json(
      { error: "no reusable resume entries were found" },
      { status: 422 },
    );
  }

  if (mode === "preview") {
    // Pure parse/extract — no storage upload, no DB writes, so there's
    // nothing to clean up if the user cancels the review modal. Duplicate
    // flags are informational only (dedup itself still runs at commit time).
    const { data: existingLatex, error: existingLatexError } = await ownerScopedTable(
      "bank_entry",
    ).select("raw_latex");
    if (existingLatexError) throw new Error(existingLatexError.message);
    const existingNormalized = new Set(
      ((existingLatex ?? []) as unknown as { raw_latex: string }[]).map((row) =>
        normalizeLatex(row.raw_latex),
      ),
    );

    return NextResponse.json({
      compatible: true,
      sections: extracted.sections.map((section) => ({
        title: section.title,
        entryCount: section.entries.length,
      })),
      entries: flatEntries.map((entry) => ({
        ...entry,
        isDuplicate: existingNormalized.has(normalizeLatex(entry.rawLatex)),
      })),
    });
  }

  const overrides = parseOverrides(form.get("overrides"));
  const finalEntries = applyOverrides(flatEntries, overrides);
  if (finalEntries.length === 0) {
    return NextResponse.json(
      { error: "no reusable resume entries were found" },
      { status: 422 },
    );
  }
  const forceIncludeIndices = new Set(
    overrides.filter((o) => o.includeDuplicate).map((o) => o.index),
  );
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

  const ownerId = getOwnerId();
  const archivePath = `${ownerId}/${randomUUID()}.zip`;
  await uploadArchive(archivePath, zipBytes, "application/zip");

  const partial: { sourceResumeId?: string; createdShellId?: string } = {};
  try {
    // First compatible upload for this fingerprint establishes the shell;
    // later ones reuse it (see PLAN.md: "first upload becomes the template shell").
    const shells = ownerScopedTable("template_shell");
    const { data: existingShell, error: shellLookupError } = asRow<{ id: string }>(
      await shells
        .select("id")
        .eq("adapter_id", adapter.id)
        .eq("fingerprint", result.fingerprint!)
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
            root_file: archive.rootFile,
            adapter_id: adapter.id,
            fingerprint: result.fingerprint,
            preamble: extracted.preamble,
          })
          .select("id")
          .single(),
      );
      if (insertShellError) throw new Error(insertShellError.message);
      templateShellId = newShell!.id;
      partial.createdShellId = templateShellId;
    }

    const desiredDisplayName =
      file.name.replace(/\.zip$/i, "").trim() || "Imported resume";
    const displayName = await dedupedName("source_resume", "display_name", desiredDisplayName, {
      excludeNulls: true,
    });

    const { data: sourceResume, error: sourceResumeError } = asRow<{ id: string }>(
      await ownerScopedTable("source_resume")
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
    const { data: existingLatex, error: existingLatexError } =
      await ownerScopedTable("bank_entry").select("raw_latex");
    if (existingLatexError) throw new Error(existingLatexError.message);
    const seen = new Set(
      ((existingLatex ?? []) as unknown as { raw_latex: string }[]).map((row) =>
        normalizeLatex(row.raw_latex),
      ),
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
        : await ownerScopedTable("bank_entry")
            .insert(dedupedEntryRows)
            .select(
              "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
            ),
    );
    if (entriesError) throw new Error(entriesError.message);

    return NextResponse.json({
      compatible: true,
      templateShellId,
      sourceResumeId,
      entryCount: dedupedEntryRows.length,
      entries: insertedEntries,
      sections: extracted.sections.map((section) => ({
        title: section.title,
        entryCount: section.entries.length,
      })),
    });
  } catch (error) {
    await cleanupFailedImport({ archivePath, ...partial });
    throw error;
  }
}
