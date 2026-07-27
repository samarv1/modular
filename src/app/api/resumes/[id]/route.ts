import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { loadResumeComposition } from "@/lib/resume-composition-query";

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

// Title rename only, same immutability shape as PATCH /api/entries/:id.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (typeof body?.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }

  const { data, error } = await ownerScopedTable("resume")
    .update({ title: body.title.trim() })
    .eq("id", id)
    .select("id, title")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json({ resume: data });
}
