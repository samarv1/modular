import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { loadResumeComposition } from "@/lib/resume-composition-query";
import { dedupeName } from "@/lib/dedupe-name";

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

  return NextResponse.json(composition);
}

// Title rename, and (Phase 6) desktop placement — folder_id/position_x/
// position_y for the home page's free-drag canvas. Each field is optional
// and independent, unlike the old title-only guard: a drag-end position
// save shouldn't need to resend the title, and vice versa.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const values: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const desiredTitle = body.title.trim();
    if (!desiredTitle) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    const { data: existingTitles, error: existingTitlesError } = await ownerScopedTable("resume")
      .select("title")
      .neq("id", id);
    if (existingTitlesError) throw new Error((existingTitlesError as { message: string }).message);
    values.title = dedupeName(
      desiredTitle,
      ((existingTitles ?? []) as unknown as { title: string }[]).map((r) => r.title),
    );
  }
  if (typeof body.positionX === "number") values.position_x = body.positionX;
  if (typeof body.positionY === "number") values.position_y = body.positionY;
  if (body.folderId === null || typeof body.folderId === "string") values.folder_id = body.folderId;
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await ownerScopedTable("resume")
    .update(values)
    .eq("id", id)
    .select("id, title, folder_id, position_x, position_y")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json({ resume: data });
}

// resume_section/resume_section_entry are ON DELETE CASCADE off resume_id
// (0001_init.sql) — deleting a build cleans up its own composition rows.
// bank_entry is untouched (it only references source_resume, not resume).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await ownerScopedTable("resume").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
