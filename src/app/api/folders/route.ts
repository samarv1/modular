import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { dedupedName } from "@/lib/unique-db-name";
import { readJsonObject } from "@/lib/api-request";
import { integerFieldError } from "@/lib/field-validation";
import type { ResumeFolderRow } from "@/lib/rows";

export async function GET() {
  const ownerId = await getOwnerId();
  const { data, error } = await ownerScopedTable("resume_folder", ownerId)
    .select("id, name, position_x, position_y, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error((error as { message: string }).message);
  return NextResponse.json({
    folders: (data ?? []) as unknown as ResumeFolderRow[],
  });
}

// Like a fresh Finder folder — defaults to "Untitled Folder", immediately
// renameable client-side rather than prompting for a name up front.
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

  const name = await dedupedName("resume_folder", "name", desiredName);

  const ownerId = await getOwnerId();
  const { data, error } = await ownerScopedTable("resume_folder", ownerId)
    .insert({ name, position_x: positionX, position_y: positionY })
    .select("id, name, position_x, position_y, created_at")
    .single();
  if (error) throw new Error((error as { message: string }).message);
  return NextResponse.json(
    { folder: data as unknown as ResumeFolderRow },
    { status: 201 },
  );
}
