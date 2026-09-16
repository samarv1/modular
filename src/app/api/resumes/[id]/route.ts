import { NextResponse } from "next/server";
import { asRow } from "@/lib/db";
import { loadResumeComposition } from "@/lib/resume-composition-query";
import { dedupedName } from "@/lib/unique-db-name";
import {
  mutationErrorMessage,
  mutationErrorStatus,
  readJsonObject,
  throwDbError,
  isUuid,
} from "@/lib/api-request";
import {
  integerFieldError,
  nullableStringFieldError,
} from "@/lib/field-validation";
import { deleteOwnedRow } from "@/lib/delete-owned-row";
import { getSignedUrl } from "@/lib/storage";
import { resumeDownloadFilename } from "@/lib/resume-filename";
import { getOwnerContext } from "@/lib/request-context";
import { deleteArtifactSafely } from "@/lib/artifact-lifecycle";

export type { ResumeSectionRow } from "@/lib/resume-composition-query";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }

  const context = await getOwnerContext();
  const composition = await loadResumeComposition(id, context);
  if (!composition) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }

  const pdfPath = composition.resume.pdf_artifact_path;
  const [pdfUrl, pdfDownloadUrl] = pdfPath
    ? await Promise.all([
        getSignedUrl(pdfPath, 3600, undefined, context.client),
        getSignedUrl(
          pdfPath,
          3600,
          {
            download: resumeDownloadFilename(composition.resume.title),
          },
          context.client,
        ),
      ])
    : [null, null];

  return NextResponse.json({ ...composition, pdfUrl, pdfDownloadUrl });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "body must be a JSON object" },
      { status: 400 },
    );
  }

  const values: Record<string, unknown> = {};
  let desiredTitle: string | undefined;
  if (typeof body.title === "string") {
    desiredTitle = body.title.trim();
    if (!desiredTitle) {
      return NextResponse.json(
        { error: "title cannot be empty" },
        { status: 400 },
      );
    }
  }
  const fieldError =
    integerFieldError(body, ["positionX", "positionY"]) ??
    nullableStringFieldError(body, "folderId");
  if (fieldError) return fieldError;
  if (typeof body.folderId === "string" && !isUuid(body.folderId)) {
    return NextResponse.json({ error: "folder not found" }, { status: 422 });
  }
  if (
    desiredTitle === undefined &&
    typeof body.positionX !== "number" &&
    typeof body.positionY !== "number" &&
    body.folderId !== null &&
    typeof body.folderId !== "string"
  ) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const context = await getOwnerContext();
  if (desiredTitle !== undefined) {
    values.title = await dedupedName("resume", "title", desiredTitle, {
      excludeId: id,
      ownerId: context.ownerId,
      client: context.client,
    });
  }
  if (typeof body.folderId === "string") {
    const { data: folder, error: folderError } = await context
      .table("resume_folder")
      .select("id")
      .eq("id", body.folderId)
      .maybeSingle();
    if (folderError) throwDbError(folderError as { message: string });
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

  const { data, error } = await context
    .table("resume")
    .update(values)
    .eq("id", id)
    .select("id, title, folder_id, position_x, position_y")
    .single();

  if (error) {
    return NextResponse.json(
      { error: mutationErrorMessage(error) },
      { status: mutationErrorStatus(error) },
    );
  }
  return NextResponse.json({ resume: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }
  const context = await getOwnerContext();
  const { data: resume, error } = asRow<{
    pdf_artifact_path: string | null;
    latex_export_path: string | null;
  }>(
    await context
      .table("resume")
      .select("pdf_artifact_path, latex_export_path")
      .eq("id", id)
      .maybeSingle(),
  );
  if (error) throwDbError(error);
  if (!resume) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }
  const response = await deleteOwnedRow(
    "resume",
    id,
    "resume not found",
    undefined,
    context,
  );
  if (response.status === 204) {
    await Promise.all([
      deleteArtifactSafely(resume.pdf_artifact_path, context.client),
      deleteArtifactSafely(resume.latex_export_path, context.client),
    ]);
  }
  return response;
}
