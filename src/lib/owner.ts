import { createSessionClient } from "@/lib/supabase/server";

// Keep this fallback because routes can run outside the proxy boundary in tests.
export async function getOwnerId(): Promise<string> {
  const ownerId = await getOwnerIdOrNull();
  if (!ownerId) throw new Error("no authenticated user");
  return ownerId;
}

export async function getOwnerIdOrNull(): Promise<string | null> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}
