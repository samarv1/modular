import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  deleteByokKey,
  getByokKey,
  hasByokKey,
  saveByokKey,
} from "@/lib/byok-store";

// Hits the live Supabase project (same convention as src/lib/ai-usage.test.ts):
// TEST_OWNER_ID must be a real signed-in user's id. Vault-backed, so this
// can't be mocked away, since it's the real round-trip through pgsodium.
//
// There's no fabricated-period column to isolate onto here like ai-usage.test.ts
// uses, so instead capture whatever key TEST_OWNER_ID had before this file ran
// and restore it afterward, rather than unconditionally deleting a key that
// may be a real one saved through the app.
const testOwnerId = process.env.TEST_OWNER_ID!;
let originalKey: string | null = null;

beforeAll(async () => {
  originalKey = await getByokKey(testOwnerId);
});

afterEach(async () => {
  await deleteByokKey(testOwnerId);
});

afterAll(async () => {
  if (originalKey !== null) await saveByokKey(testOwnerId, originalKey);
});

describe("saveByokKey / getByokKey / hasByokKey / deleteByokKey", () => {
  it("round-trips a saved key", async () => {
    expect(await hasByokKey(testOwnerId)).toBe(false);
    expect(await getByokKey(testOwnerId)).toBeNull();

    await saveByokKey(testOwnerId, "test-key-v1");
    expect(await hasByokKey(testOwnerId)).toBe(true);
    expect(await getByokKey(testOwnerId)).toBe("test-key-v1");
  });

  it("overwrites in place rather than creating a second row", async () => {
    await saveByokKey(testOwnerId, "test-key-v1");
    await saveByokKey(testOwnerId, "test-key-v2");
    expect(await getByokKey(testOwnerId)).toBe("test-key-v2");
  });

  it("deleting removes the key", async () => {
    await saveByokKey(testOwnerId, "test-key-v1");
    await deleteByokKey(testOwnerId);
    expect(await hasByokKey(testOwnerId)).toBe(false);
    expect(await getByokKey(testOwnerId)).toBeNull();
  });
});
