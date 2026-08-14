import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { asRow, ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { getAdapterOrThrow } from "@/lib/get-adapter-or-throw";
import { loadCompileComposition } from "@/lib/compile-composition-query";
import { buildExportArchive } from "@/lib/latex-export";
import { downloadArchive, getSignedUrl, uploadArchive } from "@/lib/storage";
import { resumeDownloadFilename } from "@/lib/resume-filename";
import { isUuid } from "@/lib/api-request";

// LaTeX ZIP export (PLAN.md Phase 8). PDF download already exists as a side
// effect of compile (see compile/route.ts) — this only produces the source
// archive, gated to builds that last compiled to exactly one page. Reuses
// the resume's *current* composition (not the possibly-stale last-compiled
// PDF), the same way compile/route.ts always assembles fresh.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }

  const ownerId = await getOwnerId();
  const { data: resumeRow, error: resumeError } = asRow<{
    compile_status: string;
    template_shell_id: string;
  }>(
    await ownerScopedTable("resume", ownerId)
      .select("compile_status, template_shell_id")
      .eq("id", id)
      .maybeSingle(),
  );
  if (resumeError) throw new Error(resumeError.message);
  if (!resumeRow) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }
  if (resumeRow.compile_status !== "success") {
    return NextResponse.json(
      { error: "compile this resume to one page before exporting" },
      { status: 422 },
    );
  }

  const { data: shellRow, error: shellError } = asRow<{
    archive_path: string;
    root_file: string;
  }>(
    await ownerScopedTable("template_shell", ownerId)
      .select("archive_path, root_file")
      .eq("id", resumeRow.template_shell_id)
      .maybeSingle(),
  );
  if (shellError) throw new Error(shellError.message);
  if (!shellRow) {
    return NextResponse.json(
      { error: "template shell not found" },
      { status: 404 },
    );
  }

  const loaded = await loadCompileComposition(id);
  if (!loaded) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }
  const adapter = getAdapterOrThrow(loaded.adapterId);
  const assembled = adapter.assemble(loaded.composition);

  const originalZip = await downloadArchive(shellRow.archive_path);
  const exportZip = await buildExportArchive(
    originalZip,
    shellRow.root_file,
    assembled.source,
  );

  const zipPath = `exports/${ownerId}/${id}/${randomUUID()}.zip`;
  await uploadArchive(zipPath, exportZip, "application/zip");

  const { error: updateError } = await ownerScopedTable("resume", ownerId)
    .update({ latex_export_path: zipPath })
    .eq("id", id);
  if (updateError)
    throw new Error((updateError as { message: string }).message);

  const zipDownloadUrl = await getSignedUrl(zipPath, 3600, {
    download: resumeDownloadFilename(loaded.title, "zip"),
  });

  return NextResponse.json({ zipDownloadUrl });
}
