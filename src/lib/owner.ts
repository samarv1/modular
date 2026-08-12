import { createSessionClient } from "@/lib/supabase/server";

// Single source for the current owner_id. Reads the signed-in user's id
// from their Supabase Auth session. middleware.ts already redirects/401s
// any request without a session before a route handler runs, so the throw
// below is a defensive fallback, not a per-request condition.
export async function getOwnerId(): Promise<string> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("no authenticated user");
  }
  return user.id;
}
