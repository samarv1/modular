import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runCommand = vi.fn();
const writeFiles = vi.fn();
const readFileToBuffer = vi.fn();
const stop = vi.fn();
const create = vi.fn();

vi.mock("@vercel/sandbox", () => ({
  Sandbox: { create: (...args: unknown[]) => create(...args) },
}));

async function importSubject() {
  return import("./sandbox-compile");
}

describe("compileLatexInSandbox", () => {
  const originalSnapshotId = process.env.TEXLIVE_SNAPSHOT_ID;

  beforeEach(() => {
    vi.resetModules();
    runCommand.mockReset();
    writeFiles.mockReset();
    readFileToBuffer.mockReset();
    stop.mockReset();
    create.mockReset();
    process.env.TEXLIVE_SNAPSHOT_ID = "snap_test";
    create.mockResolvedValue({
      writeFiles,
      runCommand,
      readFileToBuffer,
      stop,
    });
  });

  afterEach(() => {
    if (originalSnapshotId === undefined)
      delete process.env.TEXLIVE_SNAPSHOT_ID;
    else process.env.TEXLIVE_SNAPSHOT_ID = originalSnapshotId;
  });

  it("throws before touching the sandbox if TEXLIVE_SNAPSHOT_ID is unset", async () => {
    delete process.env.TEXLIVE_SNAPSHOT_ID;
    const { compileLatexInSandbox } = await importSubject();
    await expect(
      compileLatexInSandbox("\\documentclass{article}"),
    ).rejects.toThrow("TEXLIVE_SNAPSHOT_ID is not set");
    expect(create).not.toHaveBeenCalled();
  });

  it("never enables shell-escape and only ever writes the single resume source file", async () => {
    runCommand.mockResolvedValue({
      exitCode: 0,
      stdout: async () => "Output written on resume.pdf (1 page, 1234 bytes).",
    });
    readFileToBuffer.mockResolvedValue(Buffer.from("%PDF-fake"));
    const { compileLatexInSandbox } = await importSubject();

    const source =
      "\\documentclass{article}\\begin{document}\\write18{echo pwned}\\end{document}";
    await compileLatexInSandbox(source);

    expect(writeFiles).toHaveBeenCalledTimes(1);
    expect(writeFiles).toHaveBeenCalledWith([
      { path: "resume.tex", content: source },
    ]);

    expect(runCommand).toHaveBeenCalledTimes(2); // two-pass compile
    for (const call of runCommand.mock.calls) {
      const [command, args, options] = call as [
        string,
        string[],
        { timeoutMs: number },
      ];
      expect(command).toBe("pdflatex");
      expect(args).toContain("-no-shell-escape");
      expect(args).not.toContain("-shell-escape");
      expect(args).toContain("-halt-on-error");
      expect(options.timeoutMs).toBeGreaterThan(0);
    }
  });

  it("propagates a timed-out runCommand as a rejection and still stops the sandbox", async () => {
    runCommand.mockRejectedValue(new Error("command timed out"));
    const { compileLatexInSandbox } = await importSubject();

    await expect(
      compileLatexInSandbox("\\documentclass{article}"),
    ).rejects.toThrow("command timed out");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("treats a non-zero pdflatex exit as a failed compile rather than throwing", async () => {
    runCommand.mockResolvedValue({
      exitCode: 1,
      stdout: async () => "! Undefined control sequence.",
    });
    const { compileLatexInSandbox } = await importSubject();

    const result = await compileLatexInSandbox(
      "\\documentclass{article}\\bogus",
    );
    expect(result.success).toBe(false);
    expect(result.pdf).toBeNull();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
