import { createServiceClient } from "@/lib/supabase/server";
import type { ServiceClient } from "@/lib/db";

// The hourly cap prevents the validation endpoint from becoming a key oracle.
export const VALIDATE_HOURLY_LIMIT = process.env.BYOK_VALIDATE_HOURLY_LIMIT
  ? Number(process.env.BYOK_VALIDATE_HOURLY_LIMIT)
  : 10;

export class ValidateRateLimitExceededError extends Error {}

function currentHourBucket(): string {
  return new Date().toISOString().slice(0, 13); // UTC 'YYYY-MM-DDTHH'
}

export async function reserveValidateAttempt(
  ownerId: string,
  client: ServiceClient = createServiceClient(),
): Promise<void> {
  const { data, error } = await client.rpc("try_reserve_byok_validate_usage", {
    p_owner_id: ownerId,
    p_hour_bucket: currentHourBucket(),
    p_cap: VALIDATE_HOURLY_LIMIT,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new ValidateRateLimitExceededError();
}
