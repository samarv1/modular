import { createServiceClient } from "@/lib/supabase/server";

// supabase-js returns loosely-typed results here (see the `as any` note on
// select() below); these cast a result back to the shape the caller expects.
export function asRow<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T | null; error: { message: string } | null };
}
export function asRows<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
}

// Every table in 0001_init.sql carries owner_id. RLS is enabled as a
// backstop (0008_rls.sql), but the service-role key used here bypasses it —
// this wrapper is what actually enforces isolation, so route handlers should
// read/write through this, not a bare createServiceClient() call, and not
// forget to resolve+pass ownerId (a forgotten filter is a grep-able mistake
// rather than a silent one). Callers resolve ownerId once via
// `await getOwnerId()` and pass it in, rather than this function resolving
// its own session on every call.
export function ownerScopedTable(table: string, ownerId: string) {
  const client = createServiceClient();
  return {
    // `as any` on the columns string sidesteps supabase-js's recursive
    // select-string type parser, which (without generated Database types)
    // blows the TS compiler's recursion limit rather than falling back
    // cleanly. Query results are effectively `any` here — callers own the
    // shape they expect back.
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
