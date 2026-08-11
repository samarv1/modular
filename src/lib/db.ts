import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerId } from "@/lib/owner";

// supabase-js returns loosely-typed results here (see the `as any` note on
// select() below); these cast a result back to the shape the caller expects.
export function asRow<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T | null; error: { message: string } | null };
}
export function asRows<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
}

// Every table in 0001_init.sql carries owner_id. Since RLS is off (server
// uses the service-role key), this wrapper is what actually enforces
// isolation — route handlers should read/write through this, not a bare
// createServiceClient() call, so a forgotten owner_id filter is a
// grep-able mistake rather than a silent one.
export function ownerScopedTable(table: string) {
  const client = createServiceClient();
  const ownerId = getOwnerId();
  return {
    // `as any` on the columns string sidesteps supabase-js's recursive
    // select-string type parser, which (without generated Database types)
    // blows the TS compiler's recursion limit rather than falling back
    // cleanly. Query results are effectively `any` here — callers own the
    // shape they expect back.
    select: (columns: string = "*") =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.from(table).select(columns as any).eq("owner_id", ownerId),
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
