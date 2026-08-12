import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-only client using the service role key — never import this from
// client components. RLS is enabled as a defense-in-depth backstop (see
// migration 0008_rls.sql), but owner_id scoping is still primarily enforced
// in src/lib/db.ts, since this client's service-role key bypasses RLS.
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

// Cookie-aware client for reading/refreshing the signed-in user's session
// (Server Components, Route Handlers, Server Actions). Uses the anon key —
// the actual read/write access still goes through createServiceClient() +
// ownerScopedTable(), this client is only for auth.getUser()/signOut().
export async function createSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies() is
          // read-only — middleware's session refresh covers this case.
        }
      },
    },
  });
}
