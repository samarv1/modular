import { afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";
import { ownerScopedTable } from "@/lib/db";

vi.mock("@/lib/storage", () => ({
  uploadArchive: vi.fn().mockResolvedValue(undefined),
  deleteArchive: vi.fn().mockResolvedValue(undefined),
}));

// Import after the mock above is registered so the route picks it up.
const { POST } = await import("./route");

const fixture = readFileSync(
  join(__dirname, "../../../../fixtures/jakes-resume/resume.tex"),
  "utf8",
);

function requestWithFile(file: File) {
  const form = new FormData();
  form.set("file", file);
  return new Request("http://localhost/api/imports", { method: "POST", body: form });
}

async function zipFileOf(tex: string, name: string) {
  const zip = new JSZip();
  zip.file("resume.tex", tex);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], name);
}

describe("POST /api/imports — pre-DB rejections", () => {
  it("rejects a file over MAX_ARCHIVE_BYTES with 413, without touching storage or the DB", async () => {
    const oversized = new File([new Uint8Array(MAX_ARCHIVE_BYTES + 1)], "resume.zip");
    const res = await POST(requestWithFile(oversized));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`${MAX_ARCHIVE_BYTES} byte limit`));
  });

  it("rejects a request with no file", async () => {
    const res = await POST(
      new Request("http://localhost/api/imports", { method: "POST", body: new FormData() }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-multipart body", async () => {
    const res = await POST(new Request("http://localhost/api/imports", { method: "POST", body: "not form data" }));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed ZIP with a 422 mismatch, before any storage upload", async () => {
    const badZip = new File([new TextEncoder().encode("not a zip")], "resume.zip");
    const res = await POST(requestWithFile(badZip));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid ZIP archive");
  });

  it("rejects a ZIP whose root file depends on \\input, before any storage upload", async () => {
    const zip = new JSZip();
    zip.file(
      "resume.tex",
      "\\documentclass{article}\\begin{document}\\input{other}\\end{document}",
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "resume.zip");
    const res = await POST(requestWithFile(file));
    expect(res.status).toBe(422);
  });
});

describe("POST /api/imports — duplicate entry detection", () => {
  const sourceResumeIds: string[] = [];
  let templateShellId: string | undefined;

  afterAll(async () => {
    for (const id of sourceResumeIds) {
      await ownerScopedTable("bank_entry").delete().eq("source_resume_id", id);
      await ownerScopedTable("source_resume").delete().eq("id", id);
    }
    if (templateShellId) {
      await ownerScopedTable("template_shell").delete().eq("id", templateShellId);
    }
  });

  it("imports every entry on the first upload of a resume", async () => {
    const res = await POST(requestWithFile(await zipFileOf(fixture, "resume.zip")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    expect(body.entryCount).toBeGreaterThan(0);
    sourceResumeIds.push(body.sourceResumeId);
    templateShellId = body.templateShellId;
  });

  it("imports zero new entries when the identical resume is uploaded again", async () => {
    const res = await POST(requestWithFile(await zipFileOf(fixture, "resume-copy.zip")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    expect(body.entryCount).toBe(0);
    expect(body.entries).toEqual([]);
    sourceResumeIds.push(body.sourceResumeId);

    // Confirm no duplicate rows actually landed in bank_entry.
    const { data: allEntries, error } = await ownerScopedTable("bank_entry")
      .select("raw_latex")
      .in("source_resume_id", sourceResumeIds);
    if (error) throw new Error(error.message);
    const rawLatexValues = (allEntries ?? []).map((row) => (row as { raw_latex: string }).raw_latex);
    expect(new Set(rawLatexValues).size).toBe(rawLatexValues.length);
  });

  it("only inserts the entries that actually differ, when a resume is partly new", async () => {
    // Changes exactly one project entry's raw_latex; every other entry
    // (header, education, experience, the other project, skills) is still
    // an exact match against what's already in the bank.
    const modifiedFixture = fixture.replace("Gitlytics", "Gitlytics2");
    const res = await POST(requestWithFile(await zipFileOf(modifiedFixture, "resume-modified.zip")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    expect(body.entryCount).toBe(1);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].raw_latex).toContain("Gitlytics2");
    sourceResumeIds.push(body.sourceResumeId);
  });
});
