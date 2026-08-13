import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { detectAdapter } from "@/lib/adapters/registry";
import { ArchiveRejectedError, parseLatexArchive } from "@/lib/latex-archive";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";
import {
  applyOverrides,
  commitImport,
  flattenEntries,
  normalizeLatex,
  parseOverrides,
} from "@/lib/import-commit";

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
  const ownerId = await getOwnerId();

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
      ownerId,
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

  const commitResult = await commitImport({
    ownerId,
    adapterId: adapter.id,
    fingerprint: result.fingerprint!,
    rootFile: archive.rootFile,
    preamble: extracted.preamble,
    archiveBytes: zipBytes,
    extracted,
    finalEntries,
    forceIncludeIndices,
    desiredDisplayName: file.name.replace(/\.zip$/i, "").trim() || "Imported resume",
  });

  return NextResponse.json(commitResult);
}
