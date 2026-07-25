import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key — never import this from
// client components. RLS is not enabled (see migration 0001), so owner_id
// scoping happens in src/lib/db.ts, not here.
export function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  }
  // No generated Database types yet (no live schema to codegen from) — `any`
  // keeps query builder types loose instead of collapsing to GenericStringError.
  // Swap in `Database` from a generated types file once one exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any, any, any>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
