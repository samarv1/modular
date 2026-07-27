import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { dedupeName } from "@/lib/dedupe-name";
import { readJsonObject } from "@/lib/api-request";
import type { ResumeFolderRow } from "@/lib/rows";

export async function GET() {
  const { data, error } = await ownerScopedTable("resume_folder")
    .select("id, name, position_x, position_y, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error((error as { message: string }).message);
  return NextResponse.json({ folders: (data ?? []) as unknown as ResumeFolderRow[] });
}

// Like a fresh Finder folder — defaults to "Untitled Folder", immediately
// renameable client-side rather than prompting for a name up front.
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }
  const desiredName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Untitled Folder";
  if (body.positionX !== undefined && !Number.isInteger(body.positionX)) {
    return NextResponse.json({ error: "positionX must be an integer" }, { status: 400 });
  }
  if (body.positionY !== undefined && !Number.isInteger(body.positionY)) {
    return NextResponse.json({ error: "positionY must be an integer" }, { status: 400 });
  }
  const positionX = typeof body.positionX === "number" ? body.positionX : 0;
  const positionY = typeof body.positionY === "number" ? body.positionY : 0;

  const { data: existing, error: existingError } = await ownerScopedTable("resume_folder").select("name");
  if (existingError) throw new Error((existingError as { message: string }).message);
  const name = dedupeName(
    desiredName,
    ((existing ?? []) as unknown as { name: string }[]).map((f) => f.name),
  );

  const { data, error } = await ownerScopedTable("resume_folder")
    .insert({ name, position_x: positionX, position_y: positionY })
    .select("id, name, position_x, position_y, created_at")
    .single();
  if (error) throw new Error((error as { message: string }).message);
  return NextResponse.json({ folder: data as unknown as ResumeFolderRow }, { status: 201 });
}
