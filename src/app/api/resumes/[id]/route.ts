import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { loadResumeComposition } from "@/lib/resume-composition-query";
import { dedupedName } from "@/lib/deduped-name";
import { mutationErrorStatus, readJsonObject } from "@/lib/api-request";
import { integerFieldError, nullableStringFieldError } from "@/lib/field-validation";
import { deleteOwnedRow } from "@/lib/delete-owned-row";
import { getSignedUrl } from "@/lib/storage";
import { resumeDownloadFilename } from "@/lib/resume-filename";

export type { ResumeSectionRow } from "@/lib/resume-composition-query";

// Full composition for the outline pane. Entry *display* data (name, tags,
// source_section) isn't joined in here — the bank pane already loaded every
// bank_entry for this owner, so the outline cross-references by id from that
// in-memory list instead of duplicating the join.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const composition = await loadResumeComposition(id);
  if (!composition) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }

  const pdfPath = composition.resume.pdf_artifact_path;
  const [pdfUrl, pdfDownloadUrl] = pdfPath
    ? await Promise.all([
        getSignedUrl(pdfPath),
        getSignedUrl(pdfPath, 3600, { download: resumeDownloadFilename(composition.resume.title) }),
      ])
    : [null, null];

  return NextResponse.json({ ...composition, pdfUrl, pdfDownloadUrl });
}

// Title rename, and (Phase 6) desktop placement — folder_id/position_x/
// position_y for the home page's free-drag canvas. Each field is optional
// and independent, unlike the old title-only guard: a drag-end position
// save shouldn't need to resend the title, and vice versa.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }

  const values: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const desiredTitle = body.title.trim();
    if (!desiredTitle) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    values.title = await dedupedName("resume", "title", desiredTitle, { excludeId: id });
  }
  const fieldError = integerFieldError(body, ["positionX", "positionY"]) ?? nullableStringFieldError(body, "folderId");
  if (fieldError) return fieldError;
  if (typeof body.folderId === "string") {
    const { data: folder, error: folderError } = await ownerScopedTable("resume_folder")
      .select("id")
      .eq("id", body.folderId)
      .maybeSingle();
    if (folderError) throw new Error((folderError as { message: string }).message);
    if (!folder) {
      return NextResponse.json({ error: "folder not found" }, { status: 422 });
    }
  }
  if (typeof body.positionX === "number") values.position_x = body.positionX;
  if (typeof body.positionY === "number") values.position_y = body.positionY;
  if (body.folderId === null || typeof body.folderId === "string") {
    values.folder_id = body.folderId;
  }
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await ownerScopedTable("resume")
    .update(values)
    .eq("id", id)
    .select("id, title, folder_id, position_x, position_y")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: mutationErrorStatus(error) },
    );
  }
  return NextResponse.json({ resume: data });
}

// resume_section/resume_section_entry are ON DELETE CASCADE off resume_id
// (0001_init.sql) — deleting a build cleans up its own composition rows.
// bank_entry is untouched (it only references source_resume, not resume).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteOwnedRow("resume", id, "resume not found");
}
