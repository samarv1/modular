import { createServiceClient } from "@/lib/supabase/server";
import type { ServiceClient } from "@/lib/db";

// Supabase Vault keys must never cross the server boundary after saving.

export async function saveByokKey(
  ownerId: string,
  apiKey: string,
  client: ServiceClient = createServiceClient(),
): Promise<void> {
  const { error } = await client.rpc("upsert_byok_key", {
    p_owner_id: ownerId,
    p_api_key: apiKey,
  });
  if (error) throw new Error(error.message);
}

export async function getByokKey(
  ownerId: string,
  client: ServiceClient = createServiceClient(),
): Promise<string | null> {
  const { data, error } = await client.rpc("get_byok_key", {
    p_owner_id: ownerId,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function hasByokKey(
  ownerId: string,
  client: ServiceClient = createServiceClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("byok_keys")
    .select("owner_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

export async function deleteByokKey(
  ownerId: string,
  client: ServiceClient = createServiceClient(),
): Promise<void> {
  const { error } = await client.rpc("delete_byok_key", {
    p_owner_id: ownerId,
  });
  if (error) throw new Error(error.message);
}
