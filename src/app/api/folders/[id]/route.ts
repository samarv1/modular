import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { dedupedName } from "@/lib/deduped-name";
import { mutationErrorStatus, readJsonObject } from "@/lib/api-request";
import { integerFieldError } from "@/lib/field-validation";
import { deleteOwnedRow } from "@/lib/delete-owned-row";

// Rename and/or reposition — same partial-update shape as PATCH /api/entries/:id.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }

  const values: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const desiredName = body.name.trim();
    if (!desiredName) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    values.name = await dedupedName("resume_folder", "name", desiredName, { excludeId: id });
  }
  const fieldError = integerFieldError(body, ["positionX", "positionY"]);
  if (fieldError) return fieldError;
  if (typeof body.positionX === "number") values.position_x = body.positionX;
  if (typeof body.positionY === "number") values.position_y = body.positionY;
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const ownerId = await getOwnerId();
  const { data, error } = await ownerScopedTable("resume_folder", ownerId)
    .update(values)
    .eq("id", id)
    .select("id, name, position_x, position_y, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: mutationErrorStatus(error) },
    );
  }
  return NextResponse.json({ folder: data });
}

// resume.folder_id is ON DELETE SET NULL (0003_folders.sql) — deleting a
// folder orphans its resumes back onto the desktop, it never deletes them.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteOwnedRow("resume_folder", id, "folder not found");
}
