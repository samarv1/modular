import { createServiceClient } from "@/lib/supabase/server";

export type ServiceClient = ReturnType<typeof createServiceClient>;

export function asRow<T>(result: { data: unknown; error: unknown }) {
  return result as {
    data: T | null;
    error: { message: string; code?: string } | null;
  };
}
export function asRows<T>(result: { data: unknown; error: unknown }) {
  return result as {
    data: T[] | null;
    error: { message: string; code?: string } | null;
  };
}

// The service-role client bypasses RLS, so this wrapper is the owner boundary.
export function ownerScopedTable(
  table: string,
  ownerId: string,
  client: ServiceClient = createServiceClient(),
) {
  return {
    // Untyped select strings can exceed supabase-js's recursive type limit.
    select: (columns: string = "*") =>
      client
        .from(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(columns as any)
        .eq("owner_id", ownerId),
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
