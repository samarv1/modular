import { createSessionClient } from "@/lib/supabase/server";

// Single source for the current owner_id. Reads the signed-in user's id
// from their Supabase Auth session. src/proxy.ts redirects/401s any request
// without a session before a route handler runs, with two exceptions: "/"
// and "/resume/${DEMO_RESUME_ID}" (the anonymous playground, see
// demo-workspace.ts) are let through with no session at all. Those two
// pages must branch on getOwnerIdOrNull() before ever calling this. The
// throw below is a defensive fallback everywhere else, not a per-request
// condition.
export async function getOwnerId(): Promise<string> {
  const ownerId = await getOwnerIdOrNull();
  if (ownerId === null) {
    throw new Error("no authenticated user");
  }
  return ownerId;
}

// Non-throwing variant for the two routes that render something even
// without a session (see above). Everywhere else, prefer getOwnerId().
export async function getOwnerIdOrNull(): Promise<string | null> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}
