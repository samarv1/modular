import { createServiceClient } from "@/lib/supabase/server";

// Server-side encrypted key storage (supabase/migrations/0011_byok_keys.sql,
// Supabase Vault). The key never round-trips back to the client after
// saving. hasByokKey is what the settings page uses to show "configured",
// and getByokKey is only ever called server-side, at import time.

export async function saveByokKey(
  ownerId: string,
  apiKey: string,
): Promise<void> {
  const client = createServiceClient();
  const { error } = await client.rpc("upsert_byok_key", {
    p_owner_id: ownerId,
    p_api_key: apiKey,
  });
  if (error) throw new Error(error.message);
}

export async function getByokKey(ownerId: string): Promise<string | null> {
  const client = createServiceClient();
  const { data, error } = await client.rpc("get_byok_key", {
    p_owner_id: ownerId,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function hasByokKey(ownerId: string): Promise<boolean> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("byok_keys")
    .select("owner_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

export async function deleteByokKey(ownerId: string): Promise<void> {
  const client = createServiceClient();
  const { error } = await client.rpc("delete_byok_key", {
    p_owner_id: ownerId,
  });
  if (error) throw new Error(error.message);
}
