import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ownerScopedTable } from "@/lib/db";
import { setResumeComposition } from "@/lib/composition";

const compileLatexInSandbox = vi.fn();
const uploadArchive = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/sandbox-compile", () => ({ compileLatexInSandbox: (...args: unknown[]) => compileLatexInSandbox(...args) }));
vi.mock("@/lib/storage", () => ({
  uploadArchive: (...args: unknown[]) => uploadArchive(...args),
  getSignedUrl: vi.fn().mockResolvedValue("https://example.com/signed"),
}));

// Import after the mocks above are registered so the route picks them up.
const { POST } = await import("./route");

function fakePdf(tag: string) {
  return { success: true, pdf: Buffer.from(`%PDF-${tag}`), log: "ok", pageCount: 1 };
}

async function callCompile(resumeId: string) {
  return POST(new Request("http://localhost"), { params: Promise.resolve({ id: resumeId }) });
}

describe("POST /api/resumes/:id/compile — compile races", () => {
  let shellId: string;
  let resumeId: string;
  let bankEntryId: string;

  beforeAll(async () => {
    const { data: shell, error: shellError } = await ownerScopedTable("template_shell")
      .insert({
        archive_path: "test/compile-race-shell.zip",
        root_file: "resume.tex",
        adapter_id: "jakes-resume-v1",
        fingerprint: `test-compile-race-${crypto.randomUUID()}`,
        preamble: "\\documentclass{article}",
      })
      .select("id")
      .single();
    if (shellError) throw new Error(shellError.message);
    shellId = (shell as { id: string }).id;

    const { data: bankEntry, error: bankEntryError } = await ownerScopedTable("bank_entry")
      .insert({
        kind: "section_chunk",
        source_section: "Summary",
        raw_latex: "\\resumeItem{test entry}",
        source_offset_start: 0,
        source_offset_end: 1,
        required_packages: [],
        display_name: "Test entry",
        tags: [],
      })
      .select("id")
      .single();
    if (bankEntryError) throw new Error(bankEntryError.message);
    bankEntryId = (bankEntry as { id: string }).id;

    const { data: resume, error: resumeError } = await ownerScopedTable("resume")
      .insert({ title: `Compile race test ${crypto.randomUUID()}`, template_shell_id: shellId })
      .select("id")
      .single();
    if (resumeError) throw new Error(resumeError.message);
    resumeId = (resume as { id: string }).id;

    await setResumeComposition(resumeId, [{ title: "Summary", entries: [bankEntryId] }]);
  });

  afterAll(async () => {
    if (resumeId) await ownerScopedTable("resume").delete().eq("id", resumeId);
    if (bankEntryId) await ownerScopedTable("bank_entry").delete().eq("id", bankEntryId);
    if (shellId) await ownerScopedTable("template_shell").delete().eq("id", shellId);
  });

  it("keeps only the newest compile's result when an older one finishes last", async () => {
    let resolveOlder!: (value: unknown) => void;
    const olderStarted = new Promise<void>((resolve) => {
      compileLatexInSandbox.mockImplementationOnce(() => {
        resolve();
        return new Promise((res) => {
          resolveOlder = res;
        });
      });
    });
    compileLatexInSandbox.mockImplementationOnce(() => Promise.resolve(fakePdf("newer")));

    const olderCall = callCompile(resumeId);
    await olderStarted; // older request's "compiling" write has landed, it's now blocked inside compileLatexInSandbox

    const newerCall = callCompile(resumeId);
    const newerResponse = await newerCall;
    expect(newerResponse.status).toBe(200);

    // Let the older, now-stale request finish after the newer one already won.
    resolveOlder(fakePdf("older"));
    await olderCall;

    const { data: finalRow, error } = await ownerScopedTable("resume")
      .select("compile_status, pdf_artifact_path, last_compile_request_id")
      .eq("id", resumeId)
      .single();
    if (error) throw new Error(error.message);
    const row = finalRow as unknown as {
      compile_status: string;
      pdf_artifact_path: string;
      last_compile_request_id: string;
    };

    // uploadArchive is called once per compile (newer resolves first, older
    // second) — the newer request's path is the first call, and the row
    // must still reflect that one, not whichever wrote last.
    expect(uploadArchive).toHaveBeenCalledTimes(2);
    const newerPath = uploadArchive.mock.calls[0][0] as string;
    const olderPath = uploadArchive.mock.calls[1][0] as string;
    expect(newerPath).not.toBe(olderPath);
    expect(row.compile_status).toBe("success");
    expect(row.pdf_artifact_path).toBe(newerPath);
    expect(row.last_compile_request_id).toBe(newerPath.split("/").pop()!.replace(/\.pdf$/, ""));
  });
});
