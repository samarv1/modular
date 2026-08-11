import { deleteOwnedRow } from "@/lib/delete-owned-row";

// bank_entry.source_resume_id and resume.source_resume_id are both ON
// DELETE SET NULL (0001_init.sql) — deleting an upload orphans its entries
// rather than removing them (they stay usable, see PLAN.md), so this is a
// plain delete with no restrict case to handle.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return deleteOwnedRow("source_resume", id, "source resume not found");
}
