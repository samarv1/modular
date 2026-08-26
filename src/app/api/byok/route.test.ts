import { describe, expect, it, vi } from "vitest";

const testOwnerId = process.env.TEST_OWNER_ID!;
vi.mock("@/lib/owner", () => ({ getOwnerId: async () => testOwnerId }));

vi.mock("@/lib/resume-extraction", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/resume-extraction")
  >("@/lib/resume-extraction");
  return { ...actual, validateByokKey: vi.fn() };
});

vi.mock("@/lib/byok-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/byok-rate-limit")>(
    "@/lib/byok-rate-limit",
  );
  return {
    ...actual,
    assertUnderValidateRateLimit: vi.fn().mockResolvedValue(undefined),
    recordValidateAttempt: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/byok-store", () => ({
  hasByokKey: vi.fn().mockResolvedValue(false),
  saveByokKey: vi.fn().mockResolvedValue(undefined),
  deleteByokKey: vi.fn().mockResolvedValue(undefined),
}));

const { GET, POST, DELETE } = await import("./route");
const { validateByokKey } = await import("@/lib/resume-extraction");
const { assertUnderValidateRateLimit, ValidateRateLimitExceededError } =
  await import("@/lib/byok-rate-limit");
const { hasByokKey, saveByokKey, deleteByokKey } =
  await import("@/lib/byok-store");

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/byok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/byok", () => {
  it("reports configured:true when a key is stored", async () => {
    vi.mocked(hasByokKey).mockResolvedValueOnce(true);
    const res = await GET();
    expect(await res.json()).toEqual({ configured: true });
  });

  it("reports configured:false when no key is stored", async () => {
    vi.mocked(hasByokKey).mockResolvedValueOnce(false);
    const res = await GET();
    expect(await res.json()).toEqual({ configured: false });
  });
});

describe("POST /api/byok", () => {
  it("saves the key server-side and returns valid:true when it checks out", async () => {
    vi.mocked(saveByokKey).mockClear();
    vi.mocked(validateByokKey).mockResolvedValueOnce({ valid: true });
    const res = await POST(jsonRequest({ apiKey: "sk-good" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true });
    expect(saveByokKey).toHaveBeenCalledWith(testOwnerId, "sk-good");
  });

  it("does not save the key when it's rejected", async () => {
    vi.mocked(saveByokKey).mockClear();
    vi.mocked(validateByokKey).mockResolvedValueOnce({
      valid: false,
      reason: "invalid_key",
    });
    const res = await POST(jsonRequest({ apiKey: "sk-bad" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false, reason: "invalid_key" });
    expect(saveByokKey).not.toHaveBeenCalled();
  });

  it("rejects a missing apiKey with 400, without checking the rate limit", async () => {
    vi.mocked(assertUnderValidateRateLimit).mockClear();
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
    expect(assertUnderValidateRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 with reason rate_limited once over the limit, without validating or saving", async () => {
    vi.mocked(validateByokKey).mockClear();
    vi.mocked(saveByokKey).mockClear();
    vi.mocked(assertUnderValidateRateLimit).mockRejectedValueOnce(
      new ValidateRateLimitExceededError(),
    );
    const res = await POST(jsonRequest({ apiKey: "sk-whatever" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      valid: false,
      reason: "rate_limited",
    });
    expect(validateByokKey).not.toHaveBeenCalled();
    expect(saveByokKey).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/byok", () => {
  it("deletes the caller's stored key", async () => {
    vi.mocked(deleteByokKey).mockClear();
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteByokKey).toHaveBeenCalledWith(testOwnerId);
  });
});
