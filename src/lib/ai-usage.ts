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

// Reserves a slot against the monthly cap atomically (increment-and-check
// in one statement), so concurrent callers can't all read the same
// under-cap count and collectively burst past it. Call this before the AI
// call it guards, and releaseSharedKeyUsage if that call ends up failing.
export async function reserveSharedKeyUsage(ownerId: string): Promise<void> {
  const client = createServiceClient();
  const { data, error } = await client.rpc("try_reserve_ai_usage", {
    p_owner_id: ownerId,
    p_period: currentPeriod(),
    p_cap: SHARED_KEY_MONTHLY_CAP,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new SharedKeyCapExceededError();
}

export async function releaseSharedKeyUsage(ownerId: string): Promise<void> {
  const client = createServiceClient();
  const { error } = await client.rpc("release_ai_usage", {
    p_owner_id: ownerId,
    p_period: currentPeriod(),
  });
  // A lost release just leaves the user a slot short for the month; not
  // worth failing an already-failed import over.
  if (error) console.error("releaseSharedKeyUsage failed:", error.message);
}
