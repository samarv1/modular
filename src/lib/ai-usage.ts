import { createServiceClient } from "@/lib/supabase/server";
import type { ServiceClient } from "@/lib/db";

// BYOK calls bypass the shared-key cap because they use the owner's quota.
export const SHARED_KEY_MONTHLY_CAP = process.env.AI_USAGE_MONTHLY_CAP
  ? Number(process.env.AI_USAGE_MONTHLY_CAP)
  : 20;

export class SharedKeyCapExceededError extends Error {}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // UTC 'YYYY-MM'
}

// Atomic reservation prevents concurrent calls from exceeding the monthly cap.
export async function reserveSharedKeyUsage(
  ownerId: string,
  client: ServiceClient = createServiceClient(),
): Promise<void> {
  const { data, error } = await client.rpc("try_reserve_ai_usage", {
    p_owner_id: ownerId,
    p_period: currentPeriod(),
    p_cap: SHARED_KEY_MONTHLY_CAP,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new SharedKeyCapExceededError();
}

export async function releaseSharedKeyUsage(
  ownerId: string,
  client: ServiceClient = createServiceClient(),
): Promise<void> {
  const { error } = await client.rpc("release_ai_usage", {
    p_owner_id: ownerId,
    p_period: currentPeriod(),
  });
  // Cleanup failure must not mask the original import failure.
  if (error) console.error("releaseSharedKeyUsage failed:", error.message);
}
