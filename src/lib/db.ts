import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerId } from "@/lib/owner";

// Every table in 0001_init.sql carries owner_id. Since RLS is off (server
// uses the service-role key), this wrapper is what actually enforces
// isolation — route handlers should read/write through this, not a bare
// createServiceClient() call, so a forgotten owner_id filter is a
// grep-able mistake rather than a silent one.
export function ownerScopedTable(table: string) {
  const client = createServiceClient();
  const ownerId = getOwnerId();
  return {
    select: (columns = "*") =>
      client.from(table).select(columns).eq("owner_id", ownerId),
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = Array.isArray(values) ? values : [values];
      return client
        .from(table)
        .insert(rows.map((row) => ({ ...row, owner_id: ownerId })));
    },
    update: (values: Record<string, unknown>) =>
      client.from(table).update(values).eq("owner_id", ownerId),
    delete: () => client.from(table).delete().eq("owner_id", ownerId),
  };
}
