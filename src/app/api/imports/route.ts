import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { detectAdapter } from "@/lib/adapters/registry";
import { ArchiveRejectedError, parseLatexArchive } from "@/lib/latex-archive";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";
import {
  extractResumeStructure,
  ResumeExtractionError,
} from "@/lib/resume-extraction";
import { synthesizeJakeArchive } from "@/lib/synthesize-jake-archive";
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
    return NextResponse.json(
      { error: "body must be multipart form data" },
      { status: 400 },
    );
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

  let zipBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(
    await file.arrayBuffer(),
  );

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

  let { adapter, result } = detectAdapter({
    rootFile: archive.rootFile,
    source: archive.source,
  });

  if (!adapter || !result.compatible) {
    // Not Jake's template: try converting via AI instead of rejecting outright.
    // Raw LaTeX -> structured JSON -> re-synthesized Jake's-template LaTeX,
    // then re-run through the same detection so a successful conversion
    // falls through the normal path below indistinguishably from a native
    // Jake upload. If the AI can't make sense of it either, fall back to the
    // original mismatch report.
    const converted = await tryConvertViaAi(archive.source);
    if (!converted) {
      return NextResponse.json(
        { compatible: false, mismatchReport: result.mismatchReport },
        { status: 422 },
      );
    }
    zipBytes = converted.zipBytes;
    archive = converted.archive;
    adapter = converted.adapter;
    result = converted.result;
  }

  const extracted = adapter.extract({
    rootFile: archive.rootFile,
    source: archive.source,
  });
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
    const { data: existingLatex, error: existingLatexError } =
      await ownerScopedTable("bank_entry", ownerId).select("raw_latex");
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
  let finalEntries;
  try {
    finalEntries = applyOverrides(flatEntries, overrides);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid overrides" },
      { status: 400 },
    );
  }
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
    desiredDisplayName:
      file.name.replace(/\.zip$/i, "").trim() || "Imported resume",
  });

  return NextResponse.json(commitResult);
}

async function tryConvertViaAi(latexSource: string) {
  let extraction;
  try {
    extraction = await extractResumeStructure(latexSource);
  } catch (err) {
    if (err instanceof ResumeExtractionError) return null;
    throw err;
  }

  // Backstop, not expected to fail: the canonical preamble always satisfies
  // the contract, so this only trips if the serializer produced something
  // structurally broken.
  let zipBytes, archive, adapter, result;
  try {
    ({ zipBytes, archive, adapter, result } =
      await synthesizeJakeArchive(extraction));
  } catch {
    return null;
  }
  if (!adapter || !result.compatible) return null;

  return { zipBytes, archive, adapter, result };
}
