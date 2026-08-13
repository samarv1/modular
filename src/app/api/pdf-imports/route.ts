import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/owner";
import { convertPdfToMarkdown, PdfToMarkdownError } from "@/lib/pdf-to-markdown";
import { extractResumeStructure, ResumeExtractionError } from "@/lib/resume-extraction";
import { ResumeExtractionSchema } from "@/lib/resume-extraction-schema";
import { synthesizeJakeLatex } from "@/lib/synthesize-jake-latex";
import { parseLatexArchive, ArchiveRejectedError } from "@/lib/latex-archive";
import { detectAdapter } from "@/lib/adapters/registry";
import { commitImport, flattenEntries } from "@/lib/import-commit";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const SYNTHETIC_ROOT_FILE = "resume.tex";

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
    return NextResponse.json({ error: "body must be multipart form data" }, { status: 400 });
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

    const pdfBytes = new Uint8Array(await file.arrayBuffer());

    let markdown: string;
    try {
      markdown = await convertPdfToMarkdown(pdfBytes);
    } catch (err) {
      if (err instanceof PdfToMarkdownError) {
        return NextResponse.json({ error: `could not read pdf: ${err.message}` }, { status: 422 });
      }
      throw err;
    }

    let extraction;
    try {
      extraction = await extractResumeStructure(markdown);
    } catch (err) {
      if (err instanceof ResumeExtractionError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }
    return NextResponse.json({ extraction, filenameHint: file.name.replace(/\.pdf$/i, "").trim() });
  }

  const rawExtraction = form.get("extraction");
  if (typeof rawExtraction !== "string") {
    return NextResponse.json({ error: "missing extraction" }, { status: 400 });
  }
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawExtraction);
  } catch {
    return NextResponse.json({ error: "extraction is not valid JSON" }, { status: 400 });
  }
  const parsed = ResumeExtractionSchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "extraction did not match the expected shape", details: parsed.error.issues },
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
        if (entry.kind === "section_chunk") return !entry.items || entry.items.length === 0;
        return !entry.title;
      })
      .map((entry) => `"${section.title}" entry missing ${entry.kind === "section_chunk" ? "items" : "a title"}`),
  );
  if (invalidEntries.length > 0) {
    return NextResponse.json(
      { error: "some entries are missing required fields", details: invalidEntries },
      { status: 422 },
    );
  }

  const source = synthesizeJakeLatex(extraction);
  const zip = new JSZip();
  zip.file(SYNTHETIC_ROOT_FILE, source);
  const zipBytes = await zip.generateAsync({ type: "uint8array" });

  // Backstop, not expected to fail: the canonical preamble always satisfies
  // the contract, so this only trips if the serializer produced something
  // structurally broken (e.g. an unbalanced brace from a bad escape).
  let archive;
  try {
    archive = await parseLatexArchive(zipBytes);
  } catch (err) {
    if (err instanceof ArchiveRejectedError) {
      return NextResponse.json(
        { error: `conversion to a resume failed: ${err.reason}`, details: err.details },
        { status: 500 },
      );
    }
    throw err;
  }

  const { adapter, result } = detectAdapter({ rootFile: archive.rootFile, source: archive.source });
  if (!adapter || !result.compatible) {
    return NextResponse.json(
      { error: "conversion to a resume failed: synthesized document was not recognized" },
      { status: 500 },
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

  const filenameHint = form.get("filenameHint");
  const desiredDisplayName =
    (typeof filenameHint === "string" && filenameHint.trim()) || extraction.header.name || "Imported resume";

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
