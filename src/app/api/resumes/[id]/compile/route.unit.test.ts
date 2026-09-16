import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compileLatexInSandbox: vi.fn(),
  deleteArtifactSafely: vi.fn(),
  getOwnerContext: vi.fn(),
  getSignedUrl: vi.fn(),
  loadCompileComposition: vi.fn(),
  uploadArchive: vi.fn(),
}));

vi.mock("@/lib/compile-composition-query", () => ({
  loadCompileComposition: mocks.loadCompileComposition,
}));
vi.mock("@/lib/sandbox-compile", () => ({
  compileLatexInSandbox: mocks.compileLatexInSandbox,
}));
vi.mock("@/lib/request-context", () => ({
  getOwnerContext: mocks.getOwnerContext,
}));
vi.mock("@/lib/artifact-lifecycle", () => ({
  deleteArtifactSafely: mocks.deleteArtifactSafely,
}));
vi.mock("@/lib/storage", () => ({
  uploadArchive: mocks.uploadArchive,
  getSignedUrl: mocks.getSignedUrl,
}));
vi.mock("@/lib/get-adapter-or-throw", () => ({
  getAdapterOrThrow: () => ({ assemble: () => ({ source: "latex" }) }),
}));

const { POST } = await import("./route");
const resumeId = "00000000-0000-4000-8000-000000000001";

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "select"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
  ) => Promise.resolve(result).then(resolve);
  return builder;
}

describe("compile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCompileComposition.mockResolvedValue({
      adapterId: "test",
      composition: {
        headerLatex: "",
        sections: [{ title: "Experience", entries: [{ rawLatex: "entry" }] }],
      },
      title: "Resume",
      pdfArtifactPath: null,
    });
    mocks.compileLatexInSandbox.mockResolvedValue({
      success: true,
      pdf: new Uint8Array([1]),
      log: "ok",
      pageCount: 1,
    });
    mocks.getSignedUrl.mockResolvedValue("https://example.test/file");

    let updateCount = 0;
    const client = {};
    mocks.getOwnerContext.mockResolvedValue({
      ownerId: "00000000-0000-4000-8000-000000000002",
      client,
      table: () => ({
        update: () => {
          updateCount += 1;
          return chain(
            updateCount === 1
              ? { data: null, error: null }
              : { data: { id: resumeId }, error: null },
          );
        },
        select: () => chain({ data: null, error: null }),
      }),
    });
  });

  it("removes an uploaded PDF when the compile becomes stale before response", async () => {
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: resumeId }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Compile failed." });
    expect(mocks.uploadArchive).toHaveBeenCalledOnce();
    const uploadedPath = mocks.uploadArchive.mock.calls[0][0];
    expect(mocks.deleteArtifactSafely).toHaveBeenCalledWith(
      uploadedPath,
      expect.anything(),
    );
  });
});
