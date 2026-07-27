import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";

export interface ResumeFolderRow {
  id: string;
  name: string;
  position_x: number;
  position_y: number;
  created_at: string;
}

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
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Untitled Folder";
  const positionX = Number.isFinite(body.positionX) ? body.positionX : 0;
  const positionY = Number.isFinite(body.positionY) ? body.positionY : 0;

  const { data, error } = await ownerScopedTable("resume_folder")
    .insert({ name, position_x: positionX, position_y: positionY })
    .select("id, name, position_x, position_y, created_at")
    .single();
  if (error) throw new Error((error as { message: string }).message);
  return NextResponse.json({ folder: data as unknown as ResumeFolderRow }, { status: 201 });
}
