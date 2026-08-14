import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildExportArchive } from "./latex-export";

async function zipOf(files: Record<string, string>) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "uint8array" });
}

describe("buildExportArchive", () => {
  it("swaps the assembled source in at rootFile and leaves other assets untouched", async () => {
    const original = await zipOf({ "resume.tex": "old", "logo.png": "binary" });
    const rebuilt = await buildExportArchive(
      original,
      "resume.tex",
      "new source",
    );
    const zip = await JSZip.loadAsync(rebuilt);
    await expect(zip.file("resume.tex")!.async("string")).resolves.toBe(
      "new source",
    );
    await expect(zip.file("logo.png")!.async("string")).resolves.toBe("binary");
  });

  it("stays contained to the in-memory archive even with a path-traversal-style root file name", async () => {
    // parseLatexArchive/JSZip never write to a real filesystem path — the
    // "root file" is just a key in an in-memory entry map, and JSZip itself
    // clamps ".." segments to the archive root rather than resolving them
    // upward — so a traversal name can't escape the archive on export. Pin
    // that down explicitly so a future change (e.g. extracting to disk
    // before compiling) doesn't silently reintroduce a real zip-slip vector.
    const original = await zipOf({ "../../etc/resume.tex": "old" });
    const rebuilt = await buildExportArchive(
      original,
      "../../etc/resume.tex",
      "new source",
    );
    const zip = await JSZip.loadAsync(rebuilt);
    expect(Object.keys(zip.files).some((name) => name.includes(".."))).toBe(
      false,
    );
    await expect(zip.file("etc/resume.tex")!.async("string")).resolves.toBe(
      "new source",
    );
  });
});
