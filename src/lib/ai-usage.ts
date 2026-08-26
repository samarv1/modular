import { createServiceClient } from "@/lib/supabase/server";

// Monthly cap on the shared Gemini key, per user. BYOK calls never touch
// this (it's the user's own key/bill, not ours to meter). Overridable via
// env for local testing without editing this file.
export const SHARED_KEY_MONTHLY_CAP = process.env.AI_USAGE_MONTHLY_CAP
  ? Number(process.env.AI_USAGE_MONTHLY_CAP)
  : 20;

export class SharedKeyCapExceededError extends Error {}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // UTC 'YYYY-MM'
}

export async function assertUnderSharedKeyCap(ownerId: string): Promise<void> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("ai_usage")
    .select("count")
    .eq("owner_id", ownerId)
    .eq("period", currentPeriod())
    .maybeSingle();
  if (error) throw new Error(error.message);
  const count = (data as { count: number } | null)?.count ?? 0;
  if (count >= SHARED_KEY_MONTHLY_CAP) {
    throw new SharedKeyCapExceededError();
  }
}

export async function recordSharedKeyUsage(ownerId: string): Promise<void> {
  const client = createServiceClient();
  const { error } = await client.rpc("increment_ai_usage", {
    p_owner_id: ownerId,
    p_period: currentPeriod(),
  });
  // A lost usage-count write shouldn't fail an otherwise-successful import.
  if (error) console.error("recordSharedKeyUsage failed:", error.message);
}
