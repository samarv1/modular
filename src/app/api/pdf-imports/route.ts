import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/owner";
import {
  convertPdfToMarkdown,
  PdfToMarkdownError,
} from "@/lib/pdf-to-markdown";
import {
  extractResumeStructure,
  ResumeExtractionAuthError,
  ResumeExtractionError,
} from "@/lib/resume-extraction";
import { ResumeExtractionSchema } from "@/lib/resume-extraction-schema";
import { synthesizeJakeArchive } from "@/lib/synthesize-jake-archive";
import { ArchiveRejectedError } from "@/lib/latex-archive";
import { commitImport, flattenEntries } from "@/lib/import-commit";
import {
  assertUnderSharedKeyCap,
  recordSharedKeyUsage,
  SharedKeyCapExceededError,
} from "@/lib/ai-usage";
import { getByokKey, hasByokKey } from "@/lib/byok-store";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

// mode=preview: PDF -> markdown -> LLM-structured JSON, for the review modal.
// Nothing is persisted, mirroring mode=preview in /api/imports.
//
// mode=commit: the user's *edited* structured JSON -> deterministic LaTeX ->
// zipped in memory -> the exact same parseLatexArchive/detectAdapter/extract
// path a real .tex upload goes through, then the shared commitImport helper
// (src/lib/import-commit.ts). This is what guarantees a PDF-derived
// bank_entry is byte-for-byte indistinguishable from a real Jake upload's.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "body must be multipart form data" },
      { status: 400 },
    );
  }
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  const ownerId = await getOwnerId();

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

    const byok = (await hasByokKey(ownerId))
      ? { apiKey: (await getByokKey(ownerId))! }
      : undefined;

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

    if (!byok) {
      try {
        await assertUnderSharedKeyCap(ownerId);
      } catch (err) {
        if (err instanceof SharedKeyCapExceededError) {
          return NextResponse.json(
            {
              error:
                "you've used your shared AI extraction quota for this month",
              code: "shared_key_cap_reached",
            },
            { status: 429 },
          );
        }
        throw err;
      }
    }

    let extraction;
    try {
      extraction = await extractResumeStructure(markdown, byok);
    } catch (err) {
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
    if (!byok) await recordSharedKeyUsage(ownerId);

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

  // The schema leaves per-kind fields optional (see resume-extraction-schema.ts
  // for why), so an entry missing what its kind actually needs has to be
  // caught here — otherwise it'd synthesize as e.g. `\resumeSubheading{}{}{}{}`
  // and silently persist a bank_entry with an empty display name.
  const invalidEntries = extraction.sections.flatMap((section) =>
    section.entries
      .filter((entry) => {
        if (entry.kind === "section_chunk")
          return !entry.items || entry.items.length === 0;
        return !entry.title;
      })
      .map(
        (entry) =>
          `"${section.title}" entry missing ${entry.kind === "section_chunk" ? "items" : "a title"}`,
      ),
  );
  if (invalidEntries.length > 0) {
    return NextResponse.json(
      {
        error: "some entries are missing required fields",
        details: invalidEntries,
      },
      { status: 422 },
    );
  }

  // Backstop, not expected to fail: the canonical preamble always satisfies
  // the contract, so this only trips if the serializer produced something
  // structurally broken (e.g. an unbalanced brace from a bad escape).
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
  });

  return NextResponse.json(commitResult);
}
