import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";
import { ownerScopedTable } from "@/lib/db";
import { SharedKeyCapExceededError } from "@/lib/ai-usage";
import { ResumeExtractionAuthError } from "@/lib/resume-extraction";

// Route handlers now resolve ownerId from a real Supabase Auth session
// (src/lib/owner.ts), which isn't available in this test environment. These
// tests hit the live Supabase project directly (owner_id has an auth.users
// FK, see 0007_auth_owner_fk.sql), so TEST_OWNER_ID must be a real signed-in
// user's id, not an arbitrary UUID — set it in .env to run this file.
const testOwnerId = process.env.TEST_OWNER_ID!;
vi.mock("@/lib/owner", () => ({ getOwnerId: async () => testOwnerId }));

vi.mock("@/lib/storage", () => ({
  uploadArchive: vi.fn().mockResolvedValue(undefined),
  deleteArchive: vi.fn().mockResolvedValue(undefined),
}));

// The AI fallback for non-Jake zips hits a real model call, which is both
// slow and non-deterministic here — mock it out. Defaults to "can't make
// sense of this", matching the old pre-AI-fallback 422 behavior; individual
// tests override this to exercise the successful-conversion path.
vi.mock("@/lib/resume-extraction", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/resume-extraction")
  >("@/lib/resume-extraction");
  return {
    ...actual,
    extractResumeStructure: vi
      .fn()
      .mockRejectedValue(
        new actual.ResumeExtractionError("mock: not a resume"),
      ),
  };
});

// Wraps the real implementations as spies (rather than replacing them) so
// existing tests still hit the real ai_usage table by default; individual
// cap/BYOK tests override the behavior with mockImplementationOnce.
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

// Import after the mocks above are registered so the route picks them up.
const { POST } = await import("./route");
const { uploadArchive } = await import("@/lib/storage");
const { extractResumeStructure } = await import("@/lib/resume-extraction");
const { assertUnderSharedKeyCap, recordSharedKeyUsage } =
  await import("@/lib/ai-usage");
const { getByokKey, hasByokKey } = await import("@/lib/byok-store");

const fixture = readFileSync(
  join(__dirname, "../../../fixtures/jakes-resume/resume.tex"),
  "utf8",
);

function requestWithFile(file: File, fields?: Record<string, string>) {
  const form = new FormData();
  form.set("file", file);
  for (const [key, value] of Object.entries(fields ?? {})) form.set(key, value);
  return new Request("http://localhost/api/imports", {
    method: "POST",
    body: form,
  });
}

async function zipFileOf(tex: string, name: string) {
  const zip = new JSZip();
  zip.file("resume.tex", tex);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], name);
}

describe("POST /api/imports — pre-DB rejections", () => {
  it("rejects a file over MAX_ARCHIVE_BYTES with 413, without touching storage or the DB", async () => {
    const oversized = new File(
      [new Uint8Array(MAX_ARCHIVE_BYTES + 1)],
      "resume.zip",
    );
    const res = await POST(requestWithFile(oversized));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`${MAX_ARCHIVE_BYTES} byte limit`));
  });

  it("rejects a request with no file", async () => {
    const res = await POST(
      new Request("http://localhost/api/imports", {
        method: "POST",
        body: new FormData(),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-multipart body", async () => {
    const res = await POST(
      new Request("http://localhost/api/imports", {
        method: "POST",
        body: "not form data",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a malformed ZIP with a 422 mismatch, before any storage upload", async () => {
    const badZip = new File(
      [new TextEncoder().encode("not a zip")],
      "resume.zip",
    );
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
      await ownerScopedTable("bank_entry", testOwnerId)
        .delete()
        .eq("source_resume_id", id);
      await ownerScopedTable("source_resume", testOwnerId)
        .delete()
        .eq("id", id);
    }
    if (templateShellId) {
      await ownerScopedTable("template_shell", testOwnerId)
        .delete()
        .eq("id", templateShellId);
    }
  });

  it("imports every entry on the first upload of a resume", async () => {
    const res = await POST(
      requestWithFile(await zipFileOf(fixture, "resume.zip")),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    expect(body.entryCount).toBeGreaterThan(0);
    sourceResumeIds.push(body.sourceResumeId);
    templateShellId = body.templateShellId;
  });

  it("imports zero new entries when the identical resume is uploaded again", async () => {
    const res = await POST(
      requestWithFile(await zipFileOf(fixture, "resume-copy.zip")),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    expect(body.entryCount).toBe(0);
    expect(body.entries).toEqual([]);
    sourceResumeIds.push(body.sourceResumeId);

    // Confirm no duplicate rows actually landed in bank_entry.
    const { data: allEntries, error } = await ownerScopedTable(
      "bank_entry",
      testOwnerId,
    )
      .select("raw_latex")
      .in("source_resume_id", sourceResumeIds);
    if (error) throw new Error(error.message);
    const rawLatexValues = (allEntries ?? []).map(
      (row) => (row as unknown as { raw_latex: string }).raw_latex,
    );
    expect(new Set(rawLatexValues).size).toBe(rawLatexValues.length);
  });

  it("only inserts the entries that actually differ, when a resume is partly new", async () => {
    // Changes exactly one project entry's raw_latex; every other entry
    // (header, education, experience, the other project, skills) is still
    // an exact match against what's already in the bank.
    const modifiedFixture = fixture.replace("Gitlytics", "Gitlytics2");
    const res = await POST(
      requestWithFile(await zipFileOf(modifiedFixture, "resume-modified.zip")),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    expect(body.entryCount).toBe(1);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].raw_latex).toContain("Gitlytics2");
    sourceResumeIds.push(body.sourceResumeId);
  });
});

describe("POST /api/imports — preview mode", () => {
  beforeEach(() => {
    vi.mocked(uploadArchive).mockClear();
  });

  it("parses and returns entries without touching storage or the DB", async () => {
    const res = await POST(
      requestWithFile(await zipFileOf(fixture, "preview.zip"), {
        mode: "preview",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    expect(body.sourceResumeId).toBeUndefined();
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries[0]).toMatchObject({ index: 0 });
    expect(uploadArchive).not.toHaveBeenCalled();

    // Nothing was persisted — a fresh preview of the same file reports the
    // same entries as new (not flagged as duplicates of themselves).
    expect(
      body.entries.every(
        (e: { isDuplicate: boolean }) => e.isDuplicate === false,
      ),
    ).toBe(true);
  });

  it("still reports a structural mismatch as 422 with no DB writes", async () => {
    const zip = new JSZip();
    zip.file(
      "resume.tex",
      "\\documentclass{article}\\begin{document}not jake\\end{document}",
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "mismatch.zip");
    const res = await POST(requestWithFile(file, { mode: "preview" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.compatible).toBe(false);
    expect(body.mismatchReport).toBeDefined();
    expect(uploadArchive).not.toHaveBeenCalled();
  });
});

describe("POST /api/imports — AI fallback for non-Jake zips", () => {
  const sourceResumeIds: string[] = [];
  let templateShellId: string | undefined;
  // The successful-conversion test below hits the real shared-key cap
  // counter (assertUnderSharedKeyCap/recordSharedKeyUsage aren't mocked for
  // it). Pin the clock to a period fabricated for this describe block so it
  // owns its row outright, rather than racing other test files that also
  // touch the real current-month row concurrently.
  const usagePeriod = "2097-04";

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${usagePeriod}-15T00:00:00Z`));
  });

  afterAll(async () => {
    vi.useRealTimers();
    for (const id of sourceResumeIds) {
      await ownerScopedTable("bank_entry", testOwnerId)
        .delete()
        .eq("source_resume_id", id);
      await ownerScopedTable("source_resume", testOwnerId)
        .delete()
        .eq("id", id);
    }
    if (templateShellId) {
      await ownerScopedTable("template_shell", testOwnerId)
        .delete()
        .eq("id", templateShellId);
    }
    await ownerScopedTable("ai_usage", testOwnerId)
      .delete()
      .eq("period", usagePeriod);
  });

  it("silently converts a non-Jake zip via AI and commits it like a native upload", async () => {
    vi.mocked(extractResumeStructure).mockResolvedValueOnce({
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
    });

    const zip = new JSZip();
    zip.file(
      "resume.tex",
      "\\documentclass{article}\\begin{document}not jake\\end{document}",
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "not-jake.zip");

    const res = await POST(requestWithFile(file));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    expect(body.entryCount).toBeGreaterThan(0);
    sourceResumeIds.push(body.sourceResumeId);
    templateShellId = body.templateShellId;
  });

  it("still 422s with the original mismatch report when AI conversion also fails", async () => {
    vi.mocked(uploadArchive).mockClear();
    const zip = new JSZip();
    zip.file(
      "resume.tex",
      "\\documentclass{article}\\begin{document}not jake\\end{document}",
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "not-jake-2.zip");

    const res = await POST(requestWithFile(file));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.compatible).toBe(false);
    expect(body.mismatchReport).toBeDefined();
    expect(uploadArchive).not.toHaveBeenCalled();
  });
});

describe("POST /api/imports — commit mode with overrides", () => {
  const sourceResumeIds: string[] = [];
  let templateShellId: string | undefined;

  afterAll(async () => {
    for (const id of sourceResumeIds) {
      await ownerScopedTable("bank_entry", testOwnerId)
        .delete()
        .eq("source_resume_id", id);
      await ownerScopedTable("source_resume", testOwnerId)
        .delete()
        .eq("id", id);
    }
    if (templateShellId) {
      await ownerScopedTable("template_shell", testOwnerId)
        .delete()
        .eq("id", templateShellId);
    }
  });

  async function preview(tex: string, name: string) {
    const res = await POST(
      requestWithFile(await zipFileOf(tex, name), { mode: "preview" }),
    );
    expect(res.status).toBe(200);
    return res.json();
  }

  it("excludes and renames entries by index, leaving the rest untouched", async () => {
    const previewBody = await preview(fixture, "overrides-a.zip");
    const entries: { index: number; kind: string }[] = previewBody.entries;
    const headerIndex = entries.find((e) => e.kind === "header_chunk")!.index;
    const renameTarget = entries.find((e) => e.index !== headerIndex)!.index;

    const overrides = [
      { index: headerIndex, excluded: true },
      { index: renameTarget, displayName: "Renamed via override" },
    ];
    const res = await POST(
      requestWithFile(await zipFileOf(fixture, "overrides-a.zip"), {
        mode: "commit",
        overrides: JSON.stringify(overrides),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    sourceResumeIds.push(body.sourceResumeId);
    templateShellId = body.templateShellId;

    expect(
      body.entries.some((e: { kind: string }) => e.kind === "header_chunk"),
    ).toBe(false);
    expect(
      body.entries.some(
        (e: { display_name: string }) =>
          e.display_name === "Renamed via override",
      ),
    ).toBe(true);
  });

  it("422s when overrides exclude every entry", async () => {
    const previewBody = await preview(fixture, "overrides-b.zip");
    const overrides = (previewBody.entries as { index: number }[]).map((e) => ({
      index: e.index,
      excluded: true,
    }));
    const res = await POST(
      requestWithFile(await zipFileOf(fixture, "overrides-b.zip"), {
        mode: "commit",
        overrides: JSON.stringify(overrides),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("includeDuplicate bypasses the exact-duplicate filter for that entry only", async () => {
    // The first test in this describe already committed `fixture` once, but
    // excluded its header_chunk — so everything except the header previews
    // as a duplicate here.
    const previewBody = await preview(fixture, "overrides-c.zip");
    const entries: { index: number; isDuplicate: boolean }[] =
      previewBody.entries;
    const keepIndex = entries.find((e) => e.isDuplicate)!.index;

    const overrides: {
      index: number;
      excluded: boolean;
      includeDuplicate?: boolean;
    }[] = entries
      .filter((e) => e.index !== keepIndex)
      .map((e) => ({ index: e.index, excluded: true }));
    overrides.push({
      index: keepIndex,
      excluded: false,
      includeDuplicate: true,
    });

    const res = await POST(
      requestWithFile(await zipFileOf(fixture, "overrides-c.zip"), {
        mode: "commit",
        overrides: JSON.stringify(overrides),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compatible).toBe(true);
    sourceResumeIds.push(body.sourceResumeId);

    // Only the force-included duplicate landed — everything else was
    // excluded (and would've been deduped away regardless).
    expect(body.entryCount).toBe(1);
  });
});

describe("POST /api/imports: shared-key cap and BYOK", () => {
  function nonJakeZipFile(name: string) {
    return zipFileOf(
      "\\documentclass{article}\\begin{document}not jake\\end{document}",
      name,
    );
  }

  it("returns 429 with shared_key_cap_reached when the shared key is at its cap, without calling the model", async () => {
    vi.mocked(extractResumeStructure).mockClear();
    vi.mocked(assertUnderSharedKeyCap).mockRejectedValueOnce(
      new SharedKeyCapExceededError(),
    );
    const res = await POST(
      requestWithFile(await nonJakeZipFile("cap-hit.zip"), {
        mode: "preview",
      }),
    );
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
    vi.mocked(extractResumeStructure).mockResolvedValueOnce({
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
    });
    const res = await POST(
      requestWithFile(await nonJakeZipFile("byok.zip"), {
        mode: "preview",
      }),
    );
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
    const res = await POST(
      requestWithFile(await nonJakeZipFile("byok-bad-key.zip"), {
        mode: "preview",
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("byok_key_rejected");
    expect(assertUnderSharedKeyCap).not.toHaveBeenCalled();
    expect(recordSharedKeyUsage).not.toHaveBeenCalled();
  });
});

describe("POST /api/imports: preview->commit round-trip converts a non-Jake zip only once", () => {
  const sourceResumeIds: string[] = [];
  let templateShellId: string | undefined;
  // The successful conversion below hits the real shared-key cap counter,
  // so pin the clock to a period fabricated for this describe block: it
  // doesn't race other test files' real-current-period writes that way.
  const usagePeriod = "2097-06";

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${usagePeriod}-15T00:00:00Z`));
  });

  afterAll(async () => {
    vi.useRealTimers();
    for (const id of sourceResumeIds) {
      await ownerScopedTable("bank_entry", testOwnerId)
        .delete()
        .eq("source_resume_id", id);
      await ownerScopedTable("source_resume", testOwnerId)
        .delete()
        .eq("id", id);
    }
    if (templateShellId) {
      await ownerScopedTable("template_shell", testOwnerId)
        .delete()
        .eq("id", templateShellId);
    }
    await ownerScopedTable("ai_usage", testOwnerId)
      .delete()
      .eq("period", usagePeriod);
  });

  it("converts once at preview, then commits the converted archive without converting again", async () => {
    vi.mocked(extractResumeStructure).mockClear();
    vi.mocked(extractResumeStructure).mockResolvedValueOnce({
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
    });

    const originalFile = await zipFileOf(
      "\\documentclass{article}\\begin{document}not jake\\end{document}",
      "not-jake-roundtrip.zip",
    );

    const previewRes = await POST(
      requestWithFile(originalFile, { mode: "preview" }),
    );
    expect(previewRes.status).toBe(200);
    const previewBody = await previewRes.json();
    expect(previewBody.compatible).toBe(true);
    expect(typeof previewBody.convertedArchive).toBe("string");
    expect(extractResumeStructure).toHaveBeenCalledTimes(1);

    // The client re-uploads exactly these bytes, under the original
    // filename, for the commit request.
    const convertedBytes = Uint8Array.from(
      Buffer.from(previewBody.convertedArchive, "base64"),
    );
    const convertedFile = new File([convertedBytes], originalFile.name);

    vi.mocked(extractResumeStructure).mockClear();
    const commitRes = await POST(
      requestWithFile(convertedFile, { mode: "commit" }),
    );
    expect(commitRes.status).toBe(200);
    const commitBody = await commitRes.json();
    expect(commitBody.compatible).toBe(true);
    expect(commitBody.entryCount).toBeGreaterThan(0);
    // The commit request never had to convert again, since detectAdapter
    // already recognized the re-uploaded converted archive.
    expect(extractResumeStructure).not.toHaveBeenCalled();
    sourceResumeIds.push(commitBody.sourceResumeId);
    templateShellId = commitBody.templateShellId;

    const { data: sourceResume, error } = await ownerScopedTable(
      "source_resume",
      testOwnerId,
    )
      .select("display_name")
      .eq("id", commitBody.sourceResumeId)
      .single();
    if (error) throw new Error(error.message);
    expect(
      (sourceResume as unknown as { display_name: string }).display_name,
    ).toBe("not-jake-roundtrip");
  });
});
