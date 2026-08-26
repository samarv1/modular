import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SharedKeyCapExceededError } from "@/lib/ai-usage";
import { ownerScopedTable } from "@/lib/db";
import { ResumeExtractionAuthError } from "@/lib/resume-extraction";

// Same convention as src/app/api/imports/route.test.ts: hits the live
// Supabase project, so TEST_OWNER_ID must be a real signed-in user's id.
const testOwnerId = process.env.TEST_OWNER_ID!;
vi.mock("@/lib/owner", () => ({ getOwnerId: async () => testOwnerId }));

vi.mock("@/lib/pdf-to-markdown", () => ({
  convertPdfToMarkdown: vi.fn().mockResolvedValue("# mock markdown"),
  PdfToMarkdownError: class PdfToMarkdownError extends Error {},
}));

vi.mock("@/lib/resume-extraction", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/resume-extraction")
  >("@/lib/resume-extraction");
  return {
    ...actual,
    extractResumeStructure: vi.fn().mockResolvedValue({
      header: { name: "Jane Doe", contactLine: "jane@example.com" },
      sections: [
        {
          title: "Technical Skills",
          entries: [
            {
              kind: "section_chunk",
              sourceSection: "Technical Skills",
              items: ["Languages: TypeScript"],
            },
          ],
        },
      ],
    }),
  };
});

vi.mock("@/lib/ai-usage", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/ai-usage")>("@/lib/ai-usage");
  return {
    ...actual,
    assertUnderSharedKeyCap: vi.fn(actual.assertUnderSharedKeyCap),
    recordSharedKeyUsage: vi.fn(actual.recordSharedKeyUsage),
  };
});

// Defaults to "no BYOK key configured"; individual BYOK tests override with
// mockResolvedValueOnce.
vi.mock("@/lib/byok-store", () => ({
  hasByokKey: vi.fn().mockResolvedValue(false),
  getByokKey: vi.fn().mockResolvedValue(null),
}));

const { POST } = await import("./route");
const { extractResumeStructure } = await import("@/lib/resume-extraction");
const { assertUnderSharedKeyCap, recordSharedKeyUsage } =
  await import("@/lib/ai-usage");
const { getByokKey, hasByokKey } = await import("@/lib/byok-store");

function previewRequest() {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3])], "resume.pdf"));
  form.set("mode", "preview");
  return new Request("http://localhost/api/pdf-imports", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/pdf-imports (preview): shared-key cap and BYOK", () => {
  // Pin the clock to a period fabricated for this file so it owns its
  // ai_usage row outright, rather than racing other test files that also
  // touch the real current-month row concurrently.
  const usagePeriod = "2097-05";

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${usagePeriod}-15T00:00:00Z`));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await ownerScopedTable("ai_usage", testOwnerId)
      .delete()
      .eq("period", usagePeriod);
  });

  it("increments the shared-key counter on a successful shared-key extraction", async () => {
    vi.mocked(recordSharedKeyUsage).mockClear();
    const res = await POST(previewRequest());
    expect(res.status).toBe(200);
    expect(recordSharedKeyUsage).toHaveBeenCalledWith(testOwnerId);
  });

  it("returns 429 with shared_key_cap_reached when the shared key is at its cap", async () => {
    vi.mocked(extractResumeStructure).mockClear();
    vi.mocked(assertUnderSharedKeyCap).mockRejectedValueOnce(
      new SharedKeyCapExceededError(),
    );
    const res = await POST(previewRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("shared_key_cap_reached");
    expect(extractResumeStructure).not.toHaveBeenCalled();
  });

  it("skips the cap check entirely when the caller has a stored BYOK key", async () => {
    vi.mocked(assertUnderSharedKeyCap).mockClear();
    vi.mocked(recordSharedKeyUsage).mockClear();
    vi.mocked(hasByokKey).mockResolvedValueOnce(true);
    vi.mocked(getByokKey).mockResolvedValueOnce("sk-test-key");
    const res = await POST(previewRequest());
    expect(res.status).toBe(200);
    expect(assertUnderSharedKeyCap).not.toHaveBeenCalled();
    expect(recordSharedKeyUsage).not.toHaveBeenCalled();
  });

  it("surfaces byok_key_rejected and does not fall back to the shared key", async () => {
    vi.mocked(assertUnderSharedKeyCap).mockClear();
    vi.mocked(recordSharedKeyUsage).mockClear();
    vi.mocked(hasByokKey).mockResolvedValueOnce(true);
    vi.mocked(getByokKey).mockResolvedValueOnce("sk-bad-key");
    vi.mocked(extractResumeStructure).mockRejectedValueOnce(
      new ResumeExtractionAuthError("mock: key rejected"),
    );
    const res = await POST(previewRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("byok_key_rejected");
    expect(assertUnderSharedKeyCap).not.toHaveBeenCalled();
    expect(recordSharedKeyUsage).not.toHaveBeenCalled();
  });
});
