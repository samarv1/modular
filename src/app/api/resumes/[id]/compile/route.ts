import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { getAdapterOrThrow } from "@/lib/get-adapter-or-throw";
import { loadCompileComposition } from "@/lib/compile-composition-query";
import { compileLatexInSandbox } from "@/lib/sandbox-compile";
import { getSignedUrl, uploadArchive } from "@/lib/storage";
import { resumeDownloadFilename } from "@/lib/resume-filename";
import { isUuid } from "@/lib/api-request";

// Synchronous compile: awaits the whole Sandbox round trip and returns the
// final status in this response (Vercel Functions default to a 300s timeout,
// plenty for a one-page LaTeX compile) — no separate worker/queue needed.
// Every write after the sandbox call is guarded by
// .eq("last_compile_request_id", requestId) so a newer compile that started
// meanwhile silently wins (PLAN.md's latest-request-wins rule) instead of
// this one clobbering it.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }

  const loaded = await loadCompileComposition(id);
  if (!loaded) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }

  const totalEntries = loaded.composition.sections.reduce((n, s) => n + s.entries.length, 0);
  if (totalEntries === 0) {
    return NextResponse.json(
      { error: "add at least one entry before compiling" },
      { status: 422 },
    );
  }

  const adapter = getAdapterOrThrow(loaded.adapterId);
  const assembled = adapter.assemble(loaded.composition);

  const ownerId = await getOwnerId();
  const requestId = randomUUID();
  const { error: startError } = await ownerScopedTable("resume", ownerId)
    .update({ compile_status: "compiling", last_compile_request_id: requestId, compile_error: null })
    .eq("id", id);
  if (startError) throw new Error(startError.message);

  let result;
  try {
    result = await compileLatexInSandbox(assembled.source);
  } catch (err) {
    // Thrown before/outside pdflatex ever ran (Sandbox boot, missing
    // TEXLIVE_SNAPSHOT_ID, network) — not a LaTeX log, and not caused by
    // anything in the user's resume. Tagged with a recognizable prefix so
    // the UI (src/lib/latex-error.ts) can label it as an environment issue
    // rather than presenting it as a resume-content error.
    const message = err instanceof Error ? err.message : String(err);
    const compileError = `Compile environment error: ${message}`;
    await ownerScopedTable("resume", ownerId)
      .update({ compile_status: "failed", compile_error: compileError })
      .eq("id", id)
      .eq("last_compile_request_id", requestId);
    return NextResponse.json({ compileStatus: "failed", compileError }, { status: 500 });
  }

  if (!result.success || !result.pdf) {
    await ownerScopedTable("resume", ownerId)
      .update({ compile_status: "failed", compile_error: result.log.slice(-4000) })
      .eq("id", id)
      .eq("last_compile_request_id", requestId);
    return NextResponse.json(
      { compileStatus: "failed", compileError: result.log.slice(-4000) },
      { status: 422 },
    );
  }

  const pdfPath = `compiled/${ownerId}/${id}/${requestId}.pdf`;
  await uploadArchive(pdfPath, new Uint8Array(result.pdf), "application/pdf");

  const compileStatus = result.pageCount && result.pageCount > 1 ? "blocked_multipage" : "success";

  const { error: finishError } = await ownerScopedTable("resume", ownerId)
    .update({
      compile_status: compileStatus,
      compile_error: null,
      pdf_artifact_path: pdfPath,
      page_count: result.pageCount,
    })
    .eq("id", id)
    .eq("last_compile_request_id", requestId);
  if (finishError) throw new Error(finishError.message);

  // Two signed URLs, not one: the preview iframe needs an inline
  // (non-attachment) response, while the download button needs
  // Content-Disposition: attachment — Supabase Storage sets that per-URL via
  // the `download` option, so a single URL can't serve both.
  const [pdfUrl, pdfDownloadUrl] = await Promise.all([
    getSignedUrl(pdfPath),
    getSignedUrl(pdfPath, 3600, { download: resumeDownloadFilename(loaded.title) }),
  ]);

  return NextResponse.json({ compileStatus, pageCount: result.pageCount, pdfUrl, pdfDownloadUrl });
}
