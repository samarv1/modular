import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import {
  assertUnderValidateRateLimit,
  recordValidateAttempt,
  VALIDATE_HOURLY_LIMIT,
  ValidateRateLimitExceededError,
} from "@/lib/byok-rate-limit";

// Hits the live Supabase project (same convention as src/lib/ai-usage.test.ts):
// TEST_OWNER_ID must be a real signed-in user's id.
const testOwnerId = process.env.TEST_OWNER_ID!;
const client = createServiceClient();

async function readCount(hourBucket: string): Promise<number> {
  const { data, error } = await client
    .from("byok_validate_usage")
    .select("count")
    .eq("owner_id", testOwnerId)
    .eq("hour_bucket", hourBucket)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { count: number } | null)?.count ?? 0;
}

describe("assertUnderValidateRateLimit / recordValidateAttempt", () => {
  // Pin the clock to an hour fabricated for this file, so it owns its row
  // outright rather than racing other test files' real-current-hour writes.
  const hourBucket = "2097-03-01T05";

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${hourBucket}:15:00Z`));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await client
      .from("byok_validate_usage")
      .delete()
      .eq("owner_id", testOwnerId)
      .eq("hour_bucket", hourBucket);
  });

  afterEach(async () => {
    await client
      .from("byok_validate_usage")
      .upsert(
        { owner_id: testOwnerId, hour_bucket: hourBucket, count: 0 },
        { onConflict: "owner_id,hour_bucket" },
      );
  });

  it("passes when under the limit and increments on record", async () => {
    await expect(
      assertUnderValidateRateLimit(testOwnerId),
    ).resolves.toBeUndefined();
    await recordValidateAttempt(testOwnerId);
    expect(await readCount(hourBucket)).toBe(1);
  });

  it("throws ValidateRateLimitExceededError once the count reaches the limit", async () => {
    await client.from("byok_validate_usage").upsert(
      {
        owner_id: testOwnerId,
        hour_bucket: hourBucket,
        count: VALIDATE_HOURLY_LIMIT,
      },
      { onConflict: "owner_id,hour_bucket" },
    );
    await expect(
      assertUnderValidateRateLimit(testOwnerId),
    ).rejects.toBeInstanceOf(ValidateRateLimitExceededError);
  });
});
