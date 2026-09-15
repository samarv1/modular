import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOwnerContext: vi.fn(),
  deleteArtifactSafely: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  getOwnerContext: mocks.getOwnerContext,
}));
vi.mock("@/lib/artifact-lifecycle", () => ({
  deleteArtifactSafely: mocks.deleteArtifactSafely,
}));

const { DELETE, PATCH } = await import("./route");
const sourceResumeId = "00000000-0000-4000-8000-000000000001";

describe("source resume mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOwnerContext.mockResolvedValue({
      ownerId: "00000000-0000-4000-8000-000000000002",
      client: { rpc: mocks.rpc },
    });
  });

  it("rejects malformed ids before resolving auth", async () => {
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "bad-id" }),
    });
    expect(response.status).toBe(404);
    expect(mocks.getOwnerContext).not.toHaveBeenCalled();
  });

  it("rejects malformed batch bodies before resolving auth", async () => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: "bad", deleteIds: [] }),
      }),
      { params: Promise.resolve({ id: sourceResumeId }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.getOwnerContext).not.toHaveBeenCalled();
  });

  it("preserves an archive that is also the template shell", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ archive_path: "same.zip", shell_archive_path: "same.zip" }],
      error: null,
    });
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: sourceResumeId }),
    });
    expect(response.status).toBe(204);
    expect(mocks.deleteArtifactSafely).not.toHaveBeenCalled();
  });

  it("cleans up an unreferenced source archive after deletion", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ archive_path: "source.zip", shell_archive_path: "shell.zip" }],
      error: null,
    });
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: sourceResumeId }),
    });
    expect(response.status).toBe(204);
    expect(mocks.deleteArtifactSafely).toHaveBeenCalledWith(
      "source.zip",
      expect.anything(),
    );
  });
});
