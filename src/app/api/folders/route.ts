import { NextResponse } from "next/server";
import { dedupedName } from "@/lib/unique-db-name";
import { readJsonObject, throwDbError } from "@/lib/api-request";
import { integerFieldError } from "@/lib/field-validation";
import type { ResumeFolderRow } from "@/lib/rows";
import { getOwnerContext } from "@/lib/request-context";

export async function GET() {
  const context = await getOwnerContext();
  const { data, error } = await context
    .table("resume_folder")
    .select("id, name, position_x, position_y, created_at")
    .order("created_at", { ascending: true });
  if (error) throwDbError(error as { message: string });
  return NextResponse.json({
    folders: (data ?? []) as unknown as ResumeFolderRow[],
  });
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "body must be a JSON object" },
      { status: 400 },
    );
  }
  const desiredName =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "Untitled Folder";
  const fieldError = integerFieldError(body, ["positionX", "positionY"]);
  if (fieldError) return fieldError;
  const positionX = typeof body.positionX === "number" ? body.positionX : 0;
  const positionY = typeof body.positionY === "number" ? body.positionY : 0;

  const context = await getOwnerContext();
  const name = await dedupedName("resume_folder", "name", desiredName, {
    ownerId: context.ownerId,
    client: context.client,
  });
  const { data, error } = await context
    .table("resume_folder")
    .insert({ name, position_x: positionX, position_y: positionY })
    .select("id, name, position_x, position_y, created_at")
    .single();
  if (error) throwDbError(error as { message: string });
  return NextResponse.json(
    { folder: data as unknown as ResumeFolderRow },
    { status: 201 },
  );
}
