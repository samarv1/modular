import { createServiceClient } from "@/lib/supabase/server";

// Hourly cap per user on POST /api/byok/validate, so it can't be used as an
// unthrottled oracle to test arbitrary keys against Google's Gemini API.
// Overridable via env for local testing without editing this file.
export const VALIDATE_HOURLY_LIMIT = process.env.BYOK_VALIDATE_HOURLY_LIMIT
  ? Number(process.env.BYOK_VALIDATE_HOURLY_LIMIT)
  : 10;

export class ValidateRateLimitExceededError extends Error {}

function currentHourBucket(): string {
  return new Date().toISOString().slice(0, 13); // UTC 'YYYY-MM-DDTHH'
}

export async function assertUnderValidateRateLimit(
  ownerId: string,
): Promise<void> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("byok_validate_usage")
    .select("count")
    .eq("owner_id", ownerId)
    .eq("hour_bucket", currentHourBucket())
    .maybeSingle();
  if (error) throw new Error(error.message);
  const count = (data as { count: number } | null)?.count ?? 0;
  if (count >= VALIDATE_HOURLY_LIMIT) {
    throw new ValidateRateLimitExceededError();
  }
}

export async function recordValidateAttempt(ownerId: string): Promise<void> {
  const client = createServiceClient();
  const { error } = await client.rpc("increment_byok_validate_usage", {
    p_owner_id: ownerId,
    p_hour_bucket: currentHourBucket(),
  });
  // A lost usage-count write shouldn't fail an otherwise-successful check.
  if (error) console.error("recordValidateAttempt failed:", error.message);
}
