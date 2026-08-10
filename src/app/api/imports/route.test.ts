import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";
import { POST } from "./route";

function requestWithFile(file: File) {
  const form = new FormData();
  form.set("file", file);
  return new Request("http://localhost/api/imports", { method: "POST", body: form });
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
