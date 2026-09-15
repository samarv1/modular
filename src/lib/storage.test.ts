import { beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrl = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({ createSignedUrl }),
    },
  }),
}));

const { getSignedUrl } = await import("@/lib/storage");

describe("getSignedUrl", () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.test/signed" },
      error: null,
    });
  });

  it("passes a requested download filename to storage", async () => {
    await getSignedUrl("compiled/resume.pdf", 60, {
      download: "Resume.pdf",
    });
    expect(createSignedUrl).toHaveBeenCalledWith("compiled/resume.pdf", 60, {
      download: "Resume.pdf",
    });
  });

  it("omits attachment options for inline previews", async () => {
    await getSignedUrl("compiled/resume.pdf");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "compiled/resume.pdf",
      3600,
      undefined,
    );
  });
});
