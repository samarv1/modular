import { NextResponse } from "next/server";
import { detectAdapter } from "@/lib/adapters/registry";
import { ArchiveRejectedError, parseLatexArchive } from "@/lib/latex-archive";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";
import {
  ResumeExtractionAuthError,
  ResumeExtractionError,
} from "@/lib/resume-extraction";
import { synthesizeJakeArchive } from "@/lib/synthesize-jake-archive";
import {
  applyOverrides,
  commitImport,
  loadNormalizedLatexSet,
  normalizeLatex,
  parseOverrides,
} from "@/lib/import-commit";
import { flattenEntries } from "@/lib/flatten-entries";
import { SharedKeyCapExceededError } from "@/lib/ai-usage";
import { extractResumeForOwner } from "@/lib/extract-for-owner";
import { getOwnerContext } from "@/lib/request-context";

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
  let overrides: ReturnType<typeof parseOverrides> = [];
  if (mode === "commit") {
    try {
      overrides = parseOverrides(form.get("overrides"));
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "invalid overrides" },
        { status: 400 },
      );
    }
  }
  const context = await getOwnerContext();
  const { ownerId } = context;

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

  // Reuse converted preview bytes during commit to avoid a second AI call.
  let convertedZipBytes: Uint8Array<ArrayBufferLike> | null = null;

  if (!adapter || !result.compatible) {
    let converted;
    try {
      converted = await tryConvertViaAi(
        archive.source,
        ownerId,
        context.client,
      );
    } catch (err) {
      if (err instanceof SharedKeyCapExceededError) {
        return NextResponse.json(
          {
            error: "you've used your shared AI extraction quota for this month",
            code: "shared_key_cap_reached",
          },
          { status: 429 },
        );
      }
      if (err instanceof ResumeExtractionAuthError) {
        return NextResponse.json(
          { error: err.message, code: "byok_key_rejected" },
          { status: 401 },
        );
      }
      throw err;
    }
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
    convertedZipBytes = converted.zipBytes;
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
    // Preview is read-only. Duplicate checks run again during commit.
    const existingNormalized = await loadNormalizedLatexSet(
      ownerId,
      context.client,
    );

    return NextResponse.json({
      compatible: true,
      convertedArchive: convertedZipBytes
        ? Buffer.from(convertedZipBytes).toString("base64")
        : undefined,
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
    client: context.client,
  });

  return NextResponse.json(commitResult);
}

async function tryConvertViaAi(
  latexSource: string,
  ownerId: string,
  client: import("@/lib/db").ServiceClient,
) {
  let extraction;
  try {
    extraction = await extractResumeForOwner(latexSource, ownerId, client);
  } catch (err) {
    if (err instanceof ResumeExtractionError) return null;
    throw err;
  }

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
