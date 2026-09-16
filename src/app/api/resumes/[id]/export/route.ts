import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAdapterOrThrow } from "@/lib/get-adapter-or-throw";
import { loadCompileComposition } from "@/lib/compile-composition-query";
import { buildExportArchive } from "@/lib/latex-export";
import { downloadArchive, getSignedUrl, uploadArchive } from "@/lib/storage";
import { resumeDownloadFilename } from "@/lib/resume-filename";
import { isUuid, throwDbError } from "@/lib/api-request";
import { getOwnerContext } from "@/lib/request-context";
import { deleteArtifactSafely } from "@/lib/artifact-lifecycle";

export async function GET(
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
  if (loaded.compileStatus !== "success") {
    return NextResponse.json(
      { error: "compile this resume to one page before exporting" },
      { status: 422 },
    );
  }
  const adapter = getAdapterOrThrow(loaded.adapterId);
  const assembled = adapter.assemble(loaded.composition);

  const originalZip = await downloadArchive(
    loaded.shellArchivePath,
    context.client,
  );
  const exportZip = await buildExportArchive(
    originalZip,
    loaded.shellRootFile,
    assembled.source,
  );

  const { ownerId } = context;
  const zipPath = `exports/${ownerId}/${id}/${randomUUID()}.zip`;
  await uploadArchive(zipPath, exportZip, "application/zip", context.client);

  let update = context
    .table("resume")
    .update({ latex_export_path: zipPath })
    .eq("id", id);
  update = loaded.latexExportPath
    ? update.eq("latex_export_path", loaded.latexExportPath)
    : update.is("latex_export_path", null);
  const { data: updatedResume, error: updateError } = await update
    .select("id")
    .maybeSingle();
  if (updateError) {
    await deleteArtifactSafely(zipPath, context.client);
    throwDbError(updateError as { message: string });
  }
  if (!updatedResume) {
    await deleteArtifactSafely(zipPath, context.client);
    return NextResponse.json({ error: "Export failed." }, { status: 409 });
  }
  if (loaded.latexExportPath !== zipPath) {
    await deleteArtifactSafely(loaded.latexExportPath, context.client);
  }

  const zipDownloadUrl = await getSignedUrl(
    zipPath,
    3600,
    {
      download: resumeDownloadFilename(loaded.title, "zip"),
    },
    context.client,
  );

  const { data: currentExport, error: currentExportError } = await context
    .table("resume")
    .select("id")
    .eq("id", id)
    .eq("latex_export_path", zipPath)
    .maybeSingle();
  if (currentExportError) throwDbError(currentExportError);
  if (!currentExport) {
    await deleteArtifactSafely(zipPath, context.client);
    return NextResponse.json({ error: "Export failed." }, { status: 409 });
  }

  return NextResponse.json({ zipDownloadUrl });
}
