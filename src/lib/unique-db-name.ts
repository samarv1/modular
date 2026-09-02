import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { dedupeName } from "@/lib/finder-style-name";

/**
 * Picks a Finder-style unique name for a new or renamed row by comparing
 * `desired` against every other row's value in `column` (see dedupeName).
 * Pass `excludeId` when updating an existing row so renaming it to its own
 * current name is a no-op, not a self-collision; omit it when inserting.
 * Pass `excludeNulls` for columns that can be null (e.g. an in-progress
 * import's display_name) so those rows don't need to be fetched at all.
 * Pass `ownerId` when naming a row for someone other than the signed-in user
 * (the sample-resume backfill seeds every account); request-scoped callers omit
 * it and get the session's owner.
 */
export async function dedupedName(
  table: string,
  column: string,
  desired: string,
  options: {
    excludeId?: string;
    excludeNulls?: boolean;
    ownerId?: string;
  } = {},
): Promise<string> {
  const ownerId = options.ownerId ?? (await getOwnerId());
  let query = ownerScopedTable(table, ownerId).select(column);
  if (options.excludeId) query = query.neq("id", options.excludeId);
  if (options.excludeNulls) query = query.not(column, "is", null);
  const { data, error } = await query;
  if (error) throw new Error((error as { message: string }).message);
  const existingNames = (
    (data ?? []) as unknown as Record<string, string>[]
  ).map((row) => row[column]);
  return dedupeName(desired, existingNames);
}
