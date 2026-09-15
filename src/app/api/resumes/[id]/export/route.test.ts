import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildExportArchive: vi.fn(),
  deleteArtifactSafely: vi.fn(),
  downloadArchive: vi.fn(),
  getOwnerContext: vi.fn(),
  getSignedUrl: vi.fn(),
  loadCompileComposition: vi.fn(),
  uploadArchive: vi.fn(),
}));

vi.mock("@/lib/compile-composition-query", () => ({
  loadCompileComposition: mocks.loadCompileComposition,
}));
vi.mock("@/lib/request-context", () => ({
  getOwnerContext: mocks.getOwnerContext,
}));
vi.mock("@/lib/artifact-lifecycle", () => ({
  deleteArtifactSafely: mocks.deleteArtifactSafely,
}));
vi.mock("@/lib/latex-export", () => ({
  buildExportArchive: mocks.buildExportArchive,
}));
vi.mock("@/lib/storage", () => ({
  downloadArchive: mocks.downloadArchive,
  getSignedUrl: mocks.getSignedUrl,
  uploadArchive: mocks.uploadArchive,
}));
vi.mock("@/lib/get-adapter-or-throw", () => ({
  getAdapterOrThrow: () => ({ assemble: () => ({ source: "latex" }) }),
}));

const { GET } = await import("./route");
const resumeId = "00000000-0000-4000-8000-000000000001";

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "is", "select"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  return builder;
}

describe("export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCompileComposition.mockResolvedValue({
      adapterId: "test",
      composition: { headerLatex: "", sections: [] },
      compileStatus: "success",
      latexExportPath: null,
      shellArchivePath: "shell.zip",
      shellRootFile: "resume.tex",
      title: "Resume",
    });
    mocks.downloadArchive.mockResolvedValue(new Uint8Array([1]));
    mocks.buildExportArchive.mockResolvedValue(new Uint8Array([2]));
    mocks.getSignedUrl.mockResolvedValue("https://example.test/export");

    const client = {};
    mocks.getOwnerContext.mockResolvedValue({
      ownerId: "00000000-0000-4000-8000-000000000002",
      client,
      table: () => ({
        update: () => chain({ data: { id: resumeId }, error: null }),
        select: () => chain({ data: null, error: null }),
      }),
    });
  });

  it("does not return a URL after a newer export replaces its artifact", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: resumeId }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Export failed." });
    expect(mocks.getSignedUrl).toHaveBeenCalledOnce();
    const uploadedPath = mocks.uploadArchive.mock.calls[0][0];
    expect(mocks.deleteArtifactSafely).toHaveBeenCalledWith(
      uploadedPath,
      expect.anything(),
    );
  });
});
