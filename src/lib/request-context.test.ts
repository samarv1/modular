import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  getOwnerId: vi.fn(),
  getOwnerIdOrNull: vi.fn(),
  ownerScopedTable: vi.fn(),
}));

vi.mock("@/lib/owner", () => ({
  getOwnerId: mocks.getOwnerId,
  getOwnerIdOrNull: mocks.getOwnerIdOrNull,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock("@/lib/db", () => ({
  ownerScopedTable: mocks.ownerScopedTable,
}));

const { getOwnerContextOrNull } = await import("./request-context");

describe("nullable owner context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not create a service client for an anonymous visitor", async () => {
    mocks.getOwnerIdOrNull.mockResolvedValue(null);

    await expect(getOwnerContextOrNull()).resolves.toBeNull();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("reuses one service client for owner-scoped tables", async () => {
    const client = { name: "service" };
    mocks.getOwnerIdOrNull.mockResolvedValue("owner-id");
    mocks.createServiceClient.mockReturnValue(client);
    mocks.ownerScopedTable.mockReturnValue({ name: "resume" });

    const context = await getOwnerContextOrNull();
    expect(context?.table("resume")).toEqual({ name: "resume" });
    expect(mocks.ownerScopedTable).toHaveBeenCalledWith(
      "resume",
      "owner-id",
      client,
    );
    expect(mocks.createServiceClient).toHaveBeenCalledOnce();
  });
});
