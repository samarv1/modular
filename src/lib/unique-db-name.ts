import { ownerScopedTable, type ServiceClient } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { dedupeName } from "@/lib/finder-style-name";

// Excluding the edited row prevents its unchanged name from colliding with itself.
export async function dedupedName(
  table: string,
  column: string,
  desired: string,
  options: {
    excludeId?: string;
    excludeNulls?: boolean;
    ownerId?: string;
    client?: ServiceClient;
  } = {},
): Promise<string> {
  const ownerId = options.ownerId ?? (await getOwnerId());
  let query = ownerScopedTable(table, ownerId, options.client).select(column);
  if (options.excludeId) query = query.neq("id", options.excludeId);
  if (options.excludeNulls) query = query.not(column, "is", null);
  const { data, error } = await query;
  if (error) throw new Error((error as { message: string }).message);
  const existingNames = (
    (data ?? []) as unknown as Record<string, string>[]
  ).map((row) => row[column]);
  return dedupeName(desired, existingNames);
}
