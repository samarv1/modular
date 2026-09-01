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
  reserveSharedKeyUsage,
  releaseSharedKeyUsage,
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

describe("reserveSharedKeyUsage / releaseSharedKeyUsage", () => {
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

  it("reserves a slot and increments the count", async () => {
    await expect(reserveSharedKeyUsage(testOwnerId)).resolves.toBeUndefined();
    expect(await readCount(period)).toBe(1);
  });

  it("releasing a reservation decrements the count", async () => {
    await reserveSharedKeyUsage(testOwnerId);
    await releaseSharedKeyUsage(testOwnerId);
    expect(await readCount(period)).toBe(0);
  });

  it("throws SharedKeyCapExceededError once reserving would exceed the cap, without incrementing", async () => {
    await client
      .from("ai_usage")
      .upsert(
        { owner_id: testOwnerId, period, count: SHARED_KEY_MONTHLY_CAP },
        { onConflict: "owner_id,period" },
      );
    await expect(reserveSharedKeyUsage(testOwnerId)).rejects.toBeInstanceOf(
      SharedKeyCapExceededError,
    );
    expect(await readCount(period)).toBe(SHARED_KEY_MONTHLY_CAP);
  });

  it("reserving concurrently never lets the count exceed the cap", async () => {
    await client
      .from("ai_usage")
      .upsert(
        { owner_id: testOwnerId, period, count: SHARED_KEY_MONTHLY_CAP - 2 },
        { onConflict: "owner_id,period" },
      );

    const results = await Promise.allSettled([
      reserveSharedKeyUsage(testOwnerId),
      reserveSharedKeyUsage(testOwnerId),
      reserveSharedKeyUsage(testOwnerId),
      reserveSharedKeyUsage(testOwnerId),
      reserveSharedKeyUsage(testOwnerId),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(2);
    expect(await readCount(period)).toBe(SHARED_KEY_MONTHLY_CAP);
  });
});

describe("a new month starts at 0", () => {
  // Both periods are fabricated (this describe block owns them outright),
  // never the real current period, since reserving always writes.
  const pastPeriod = "2099-01";
  const currentPeriod = "2099-02";

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${currentPeriod}-15T00:00:00Z`));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await client
      .from("ai_usage")
      .delete()
      .eq("owner_id", testOwnerId)
      .in("period", [pastPeriod, currentPeriod]);
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
    await expect(reserveSharedKeyUsage(testOwnerId)).resolves.toBeUndefined();
  });
});
