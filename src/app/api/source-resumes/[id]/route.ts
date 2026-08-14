import { asRows, ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { deleteOwnedRow } from "@/lib/delete-owned-row";

// bank_entry.source_resume_id and resume.source_resume_id are both ON
// DELETE SET NULL (0001_init.sql) — deleting an upload orphans its entries
// rather than removing them (they stay usable, see PLAN.md). But an orphan
// nobody placed in a resume yet is just clutter, not a useful survivor, so
// this clears those out first — entries still in use fall back to the
// ON DELETE SET NULL orphan path as before (resume_section_entry.bank_entry_id
// is ON DELETE RESTRICT, so a used entry can't be caught up in this delete).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();

  const { data: usedEntries, error: usedError } = asRows<{
    bank_entry_id: string;
  }>(
    await ownerScopedTable("resume_section_entry", ownerId).select(
      "bank_entry_id",
    ),
  );
  if (usedError) throw new Error(usedError.message);
  const usedIds = new Set((usedEntries ?? []).map((e) => e.bank_entry_id));

  const { data: candidateEntries, error: candidateError } = asRows<{
    id: string;
  }>(
    await ownerScopedTable("bank_entry", ownerId)
      .select("id")
      .eq("source_resume_id", id),
  );
  if (candidateError) throw new Error(candidateError.message);
  const unusedIds = (candidateEntries ?? [])
    .map((e) => e.id)
    .filter((entryId) => !usedIds.has(entryId));

  if (unusedIds.length > 0) {
    const { error: deleteEntriesError } = await ownerScopedTable(
      "bank_entry",
      ownerId,
    )
      .delete()
      .in("id", unusedIds);
    if (deleteEntriesError) throw new Error(deleteEntriesError.message);
  }

  return deleteOwnedRow("source_resume", id, "source resume not found");
}
