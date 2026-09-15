import { NextResponse } from "next/server";
import {
  convertPdfToMarkdown,
  PdfToMarkdownError,
} from "@/lib/pdf-to-markdown";
import {
  ResumeExtractionAuthError,
  ResumeExtractionError,
} from "@/lib/resume-extraction";
import { ResumeExtractionSchema } from "@/lib/resume-extraction-schema";
import { synthesizeJakeArchive } from "@/lib/synthesize-jake-archive";
import { ArchiveRejectedError } from "@/lib/latex-archive";
import { commitImport } from "@/lib/import-commit";
import { flattenEntries } from "@/lib/flatten-entries";
import { SharedKeyCapExceededError } from "@/lib/ai-usage";
import { extractResumeForOwner } from "@/lib/extract-for-owner";
import { validateExtractionRequiredFields } from "@/lib/entry-materialization";
import { getOwnerContext } from "@/lib/request-context";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

// Commit routes PDF extraction through the same archive pipeline as ZIP input.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "body must be multipart form data" },
      { status: 400 },
    );
  }
  const mode = form.get("mode") === "commit" ? "commit" : "preview";

  if (mode === "preview") {
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: `pdf exceeds the ${MAX_PDF_BYTES} byte limit` },
        { status: 413 },
      );
    }
    const context = await getOwnerContext();
    const { ownerId } = context;

    const pdfBytes = new Uint8Array(await file.arrayBuffer());

    let markdown: string;
    try {
      markdown = await convertPdfToMarkdown(pdfBytes);
    } catch (err) {
      if (err instanceof PdfToMarkdownError) {
        return NextResponse.json(
          { error: `could not read pdf: ${err.message}` },
          { status: 422 },
        );
      }
      throw err;
    }

    let extraction;
    try {
      extraction = await extractResumeForOwner(
        markdown,
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
      if (err instanceof ResumeExtractionError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }

    return NextResponse.json({
      extraction,
      filenameHint: file.name.replace(/\.pdf$/i, "").trim(),
    });
  }

  const rawExtraction = form.get("extraction");
  if (typeof rawExtraction !== "string") {
    return NextResponse.json({ error: "missing extraction" }, { status: 400 });
  }
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawExtraction);
  } catch {
    return NextResponse.json(
      { error: "extraction is not valid JSON" },
      { status: 400 },
    );
  }
  const parsed = ResumeExtractionSchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "extraction did not match the expected shape",
        details: parsed.error.issues,
      },
      { status: 422 },
    );
  }
  const extraction = parsed.data;

  // The shared schema permits fields that are optional for other entry kinds.
  const invalidEntries = validateExtractionRequiredFields(extraction);
  if (invalidEntries.length > 0) {
    return NextResponse.json(
      {
        error: "some entries are missing required fields",
        details: invalidEntries,
      },
      { status: 422 },
    );
  }
  const context = await getOwnerContext();
  const { ownerId } = context;

  let converted;
  try {
    converted = await synthesizeJakeArchive(extraction);
  } catch (err) {
    if (err instanceof ArchiveRejectedError) {
      return NextResponse.json(
        {
          error: `conversion to a resume failed: ${err.reason}`,
          details: err.details,
        },
        { status: 500 },
      );
    }
    throw err;
  }
  const { zipBytes, archive, adapter, result } = converted;
  if (!adapter || !result.compatible) {
    return NextResponse.json(
      {
        error:
          "conversion to a resume failed: synthesized document was not recognized",
      },
      { status: 500 },
    );
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

  const filenameHint = form.get("filenameHint");
  const desiredDisplayName =
    (typeof filenameHint === "string" && filenameHint.trim()) ||
    extraction.header.name ||
    "Imported resume";

  const commitResult = await commitImport({
    ownerId,
    adapterId: adapter.id,
    fingerprint: result.fingerprint!,
    rootFile: archive.rootFile,
    preamble: extracted.preamble,
    archiveBytes: zipBytes,
    extracted,
    finalEntries: flatEntries,
    forceIncludeIndices: new Set<number>(),
    desiredDisplayName,
    client: context.client,
  });

  return NextResponse.json(commitResult);
}
