import { asRows, ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { deleteOwnedRow } from "@/lib/delete-owned-row";
import { throwDbError } from "@/lib/api-request";

// Deleting an upload removes every entry it produced, including ones
// currently placed in a resume outline (resume_section_entry.bank_entry_id
// is ON DELETE RESTRICT, so those rows are cleared first) — orphaning them
// via source_resume's ON DELETE SET NULL instead left "source unavailable"
// entries stranded in the bank with no way to trace them back. The frontend
// warns before calling this that in-use entries will disappear from the
// resume too.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();

  const { data: candidateEntries, error: candidateError } = asRows<{
    id: string;
  }>(
    await ownerScopedTable("bank_entry", ownerId)
      .select("id")
      .eq("source_resume_id", id),
  );
  if (candidateError) throwDbError(candidateError);
  const entryIds = (candidateEntries ?? []).map((e) => e.id);

  if (entryIds.length > 0) {
    const { error: deleteSectionEntriesError } = await ownerScopedTable(
      "resume_section_entry",
      ownerId,
    )
      .delete()
      .in("bank_entry_id", entryIds);
    if (deleteSectionEntriesError) throwDbError(deleteSectionEntriesError);

    const { error: deleteEntriesError } = await ownerScopedTable(
      "bank_entry",
      ownerId,
    )
      .delete()
      .in("id", entryIds);
    if (deleteEntriesError) throwDbError(deleteEntriesError);
  }

  return deleteOwnedRow("source_resume", id, "source resume not found");
}
