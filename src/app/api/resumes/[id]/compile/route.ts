import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAdapterOrThrow } from "@/lib/get-adapter-or-throw";
import { loadCompileComposition } from "@/lib/compile-composition-query";
import { compileLatexInSandbox } from "@/lib/sandbox-compile";
import { getSignedUrl, uploadArchive } from "@/lib/storage";
import { resumeDownloadFilename } from "@/lib/resume-filename";
import { isUuid, throwDbError } from "@/lib/api-request";
import { getOwnerContext } from "@/lib/request-context";
import { deleteArtifactSafely } from "@/lib/artifact-lifecycle";
import { asRow } from "@/lib/db";

// The route timeout must cover the synchronous sandbox compile.
// Request-id guards prevent stale compiles from overwriting newer results.
export const maxDuration = 180;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }

  const context = await getOwnerContext();
  const loaded = await loadCompileComposition(id, context);
  if (!loaded) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }

  const totalEntries = loaded.composition.sections.reduce(
    (n, s) => n + s.entries.length,
    0,
  );
  if (totalEntries === 0) {
    return NextResponse.json(
      { error: "add at least one entry before compiling" },
      { status: 422 },
    );
  }

  const adapter = getAdapterOrThrow(loaded.adapterId);
  const assembled = adapter.assemble(loaded.composition);

  const { ownerId } = context;
  const requestId = randomUUID();
  const { error: startError } = await context
    .table("resume")
    .update({
      compile_status: "compiling",
      last_compile_request_id: requestId,
      compile_error: null,
    })
    .eq("id", id);
  if (startError) throwDbError(startError);

  let result;
  try {
    result = await compileLatexInSandbox(assembled.source);
  } catch (err) {
    // The prefix lets the UI distinguish infrastructure failures from LaTeX
    // content errors.
    const message = err instanceof Error ? err.message : String(err);
    const compileError = `Compile environment error: ${message}`;
    const { data: failedResume, error: failUpdateError } = await context
      .table("resume")
      .update({ compile_status: "failed", compile_error: compileError })
      .eq("id", id)
      .eq("last_compile_request_id", requestId)
      .select("id")
      .maybeSingle();
    if (failUpdateError) throwDbError(failUpdateError);
    if (!failedResume) {
      return NextResponse.json({ error: "Compile failed." }, { status: 409 });
    }
    return NextResponse.json(
      { compileStatus: "failed", compileError },
      { status: 500 },
    );
  }

  if (!result.success || !result.pdf) {
    const { data: failedResume, error: failUpdateError } = await context
      .table("resume")
      .update({
        compile_status: "failed",
        compile_error: result.log.slice(-4000),
      })
      .eq("id", id)
      .eq("last_compile_request_id", requestId)
      .select("id")
      .maybeSingle();
    if (failUpdateError) throwDbError(failUpdateError);
    if (!failedResume) {
      return NextResponse.json({ error: "Compile failed." }, { status: 409 });
    }
    return NextResponse.json(
      { compileStatus: "failed", compileError: result.log.slice(-4000) },
      { status: 422 },
    );
  }

  const pdfPath = `compiled/${ownerId}/${id}/${requestId}.pdf`;
  await uploadArchive(
    pdfPath,
    new Uint8Array(result.pdf),
    "application/pdf",
    context.client,
  );

  const compileStatus =
    result.pageCount && result.pageCount > 1 ? "blocked_multipage" : "success";

  const { data: finishedResume, error: finishError } = await context
    .table("resume")
    .update({
      compile_status: compileStatus,
      compile_error: null,
      pdf_artifact_path: pdfPath,
      page_count: result.pageCount,
    })
    .eq("id", id)
    .eq("last_compile_request_id", requestId)
    .select("id")
    .maybeSingle();
  if (finishError) {
    await deleteArtifactSafely(pdfPath, context.client);
    throwDbError(finishError);
  }
  if (!finishedResume) {
    await deleteArtifactSafely(pdfPath, context.client);
    return NextResponse.json({ error: "Compile failed." }, { status: 409 });
  }
  if (loaded.pdfArtifactPath !== pdfPath) {
    await deleteArtifactSafely(loaded.pdfArtifactPath, context.client);
  }

  // Supabase sets Content-Disposition per URL, so preview and download need
  // separate signed URLs.
  const [pdfUrl, pdfDownloadUrl] = await Promise.all([
    getSignedUrl(pdfPath, 3600, undefined, context.client),
    getSignedUrl(
      pdfPath,
      3600,
      {
        download: resumeDownloadFilename(loaded.title),
      },
      context.client,
    ),
  ]);

  const { data: currentCompile, error: currentCompileError } = await context
    .table("resume")
    .select("id")
    .eq("id", id)
    .eq("last_compile_request_id", requestId)
    .eq("pdf_artifact_path", pdfPath)
    .maybeSingle();
  if (currentCompileError) throwDbError(currentCompileError);
  if (!currentCompile) {
    const { data: currentResume, error: currentResumeError } = asRow<{
      pdf_artifact_path: string | null;
    }>(
      await context
        .table("resume")
        .select("pdf_artifact_path")
        .eq("id", id)
        .maybeSingle(),
    );
    if (currentResumeError) throwDbError(currentResumeError);
    if (!currentResume || currentResume.pdf_artifact_path !== pdfPath) {
      await deleteArtifactSafely(pdfPath, context.client);
    }
    return NextResponse.json({ error: "Compile failed." }, { status: 409 });
  }

  return NextResponse.json({
    compileStatus,
    pageCount: result.pageCount,
    pdfUrl,
    pdfDownloadUrl,
  });
}
