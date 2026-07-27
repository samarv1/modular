import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";

// Rename and/or reposition — same partial-update shape as PATCH /api/entries/:id.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const values: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    values.name = body.name.trim();
  }
  if (typeof body.positionX === "number") values.position_x = body.positionX;
  if (typeof body.positionY === "number") values.position_y = body.positionY;
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await ownerScopedTable("resume_folder")
    .update(values)
    .eq("id", id)
    .select("id, name, position_x, position_y, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json({ folder: data });
}

// resume.folder_id is ON DELETE SET NULL (0003_folders.sql) — deleting a
// folder orphans its resumes back onto the desktop, it never deletes them.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await ownerScopedTable("resume_folder").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
