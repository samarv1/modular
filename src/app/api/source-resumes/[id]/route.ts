import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { mutationErrorStatus } from "@/lib/api-request";

// bank_entry.source_resume_id and resume.source_resume_id are both ON
// DELETE SET NULL (0001_init.sql) — deleting an upload orphans its entries
// rather than removing them (they stay usable, see PLAN.md), so this is a
// plain delete with no restrict case to handle.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { data, error } = await ownerScopedTable("source_resume")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: mutationErrorStatus(error) },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "source resume not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
