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
  reserveValidateAttempt,
  VALIDATE_HOURLY_LIMIT,
  ValidateRateLimitExceededError,
} from "@/lib/byok-rate-limit";

// Runs only through `npm run test:integration`. TEST_OWNER_ID must belong to
// the dedicated Supabase test project configured through TEST_SUPABASE_*.
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

describe("reserveValidateAttempt", () => {
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

  it("reserves a slot when under the limit", async () => {
    await expect(reserveValidateAttempt(testOwnerId)).resolves.toBeUndefined();
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
    await expect(reserveValidateAttempt(testOwnerId)).rejects.toBeInstanceOf(
      ValidateRateLimitExceededError,
    );
  });

  it("never lets concurrent reservations exceed the limit", async () => {
    await client.from("byok_validate_usage").upsert(
      {
        owner_id: testOwnerId,
        hour_bucket: hourBucket,
        count: VALIDATE_HOURLY_LIMIT - 2,
      },
      { onConflict: "owner_id,hour_bucket" },
    );
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => reserveValidateAttempt(testOwnerId)),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(2);
    expect(await readCount(hourBucket)).toBe(VALIDATE_HOURLY_LIMIT);
  });
});
