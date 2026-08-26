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
  assertUnderSharedKeyCap,
  recordSharedKeyUsage,
  SHARED_KEY_MONTHLY_CAP,
  SharedKeyCapExceededError,
} from "@/lib/ai-usage";

// Hits the live Supabase project (same convention as src/app/api/imports/
// route.test.ts): TEST_OWNER_ID must be a real signed-in user's id.
const testOwnerId = process.env.TEST_OWNER_ID!;
const client = createServiceClient();

async function readCount(period: string): Promise<number> {
  const { data, error } = await client
    .from("ai_usage")
    .select("count")
    .eq("owner_id", testOwnerId)
    .eq("period", period)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { count: number } | null)?.count ?? 0;
}

describe("assertUnderSharedKeyCap / recordSharedKeyUsage", () => {
  // ai-usage.ts computes "now" as the real current period, and vitest runs
  // test files in parallel, so sharing that row with other files' tests
  // would race. Pin the clock to a period fabricated for this file alone
  // so these tests own their row outright, never touching real usage data.
  const period = "2097-03";

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${period}-15T00:00:00Z`));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await client
      .from("ai_usage")
      .delete()
      .eq("owner_id", testOwnerId)
      .eq("period", period);
  });

  afterEach(async () => {
    await client
      .from("ai_usage")
      .upsert(
        { owner_id: testOwnerId, period, count: 0 },
        { onConflict: "owner_id,period" },
      );
  });

  it("passes when under the cap and increments on record", async () => {
    await expect(assertUnderSharedKeyCap(testOwnerId)).resolves.toBeUndefined();
    await recordSharedKeyUsage(testOwnerId);
    expect(await readCount(period)).toBe(1);
  });

  it("throws SharedKeyCapExceededError once the count reaches the cap", async () => {
    await client
      .from("ai_usage")
      .upsert(
        { owner_id: testOwnerId, period, count: SHARED_KEY_MONTHLY_CAP },
        { onConflict: "owner_id,period" },
      );
    await expect(assertUnderSharedKeyCap(testOwnerId)).rejects.toBeInstanceOf(
      SharedKeyCapExceededError,
    );
  });

  it("increments concurrently without losing a count", async () => {
    await Promise.all([
      recordSharedKeyUsage(testOwnerId),
      recordSharedKeyUsage(testOwnerId),
      recordSharedKeyUsage(testOwnerId),
    ]);
    expect(await readCount(period)).toBe(3);
  });
});

describe("a new month starts at 0", () => {
  // Uses a fabricated past period rather than the current one, so cleanup
  // is a plain delete instead of restoring live data.
  const pastPeriod = "2099-01";

  afterAll(async () => {
    await client
      .from("ai_usage")
      .delete()
      .eq("owner_id", testOwnerId)
      .eq("period", pastPeriod);
  });

  it("a row in a different period does not affect the current period's count", async () => {
    await client.from("ai_usage").upsert(
      {
        owner_id: testOwnerId,
        period: pastPeriod,
        count: SHARED_KEY_MONTHLY_CAP,
      },
      { onConflict: "owner_id,period" },
    );
    // Current period is untouched by the row above regardless of its count.
    await expect(assertUnderSharedKeyCap(testOwnerId)).resolves.toBeUndefined();
  });
});
