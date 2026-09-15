import { NextResponse } from "next/server";
import { dedupedName } from "@/lib/unique-db-name";
import {
  mutationErrorMessage,
  mutationErrorStatus,
  readJsonObject,
  isUuid,
} from "@/lib/api-request";
import { integerFieldError } from "@/lib/field-validation";
import { deleteOwnedRow } from "@/lib/delete-owned-row";
import { getOwnerContext } from "@/lib/request-context";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "folder not found" }, { status: 404 });
  }
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "body must be a JSON object" },
      { status: 400 },
    );
  }

  const values: Record<string, unknown> = {};
  let desiredName: string | undefined;
  if (typeof body.name === "string") {
    desiredName = body.name.trim();
    if (!desiredName) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 },
      );
    }
  }
  const fieldError = integerFieldError(body, ["positionX", "positionY"]);
  if (fieldError) return fieldError;
  if (typeof body.positionX === "number") values.position_x = body.positionX;
  if (typeof body.positionY === "number") values.position_y = body.positionY;
  if (Object.keys(values).length === 0 && desiredName === undefined) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const context = await getOwnerContext();
  if (desiredName !== undefined) {
    values.name = await dedupedName("resume_folder", "name", desiredName, {
      excludeId: id,
      ownerId: context.ownerId,
      client: context.client,
    });
  }
  const { data, error } = await context
    .table("resume_folder")
    .update(values)
    .eq("id", id)
    .select("id, name, position_x, position_y, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: mutationErrorMessage(error) },
      { status: mutationErrorStatus(error) },
    );
  }
  return NextResponse.json({ folder: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "folder not found" }, { status: 404 });
  }
  const context = await getOwnerContext();
  return deleteOwnedRow(
    "resume_folder",
    id,
    "folder not found",
    undefined,
    context,
  );
}
