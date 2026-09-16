import { beforeEach, describe, expect, it, vi } from "vitest";

const getByokKey = vi.fn();
const reserveSharedKeyUsage = vi.fn();
const releaseSharedKeyUsage = vi.fn();
const extractResumeStructure = vi.fn();

vi.mock("@/lib/byok-store", () => ({ getByokKey }));
vi.mock("@/lib/ai-usage", () => ({
  reserveSharedKeyUsage,
  releaseSharedKeyUsage,
}));
vi.mock("@/lib/resume-extraction", () => ({ extractResumeStructure }));

const { extractResumeForOwner } = await import("@/lib/extract-for-owner");

describe("extractResumeForOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getByokKey.mockResolvedValue(null);
    reserveSharedKeyUsage.mockResolvedValue(undefined);
    releaseSharedKeyUsage.mockResolvedValue(undefined);
    extractResumeStructure.mockResolvedValue({ sections: [] });
  });

  it("reserves shared quota and retains it after a successful extraction", async () => {
    await extractResumeForOwner("resume", "owner");
    expect(reserveSharedKeyUsage).toHaveBeenCalledOnce();
    expect(releaseSharedKeyUsage).not.toHaveBeenCalled();
    expect(extractResumeStructure).toHaveBeenCalledWith("resume", undefined);
  });

  it("releases shared quota when extraction fails", async () => {
    extractResumeStructure.mockRejectedValueOnce(new Error("failed"));
    await expect(extractResumeForOwner("resume", "owner")).rejects.toThrow(
      "failed",
    );
    expect(releaseSharedKeyUsage).toHaveBeenCalledOnce();
  });

  it("uses a stored key without touching shared quota", async () => {
    getByokKey.mockResolvedValueOnce("secret");
    await extractResumeForOwner("resume", "owner");
    expect(reserveSharedKeyUsage).not.toHaveBeenCalled();
    expect(extractResumeStructure).toHaveBeenCalledWith("resume", {
      apiKey: "secret",
    });
  });
});
