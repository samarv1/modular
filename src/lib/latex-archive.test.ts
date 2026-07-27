import { readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { ArchiveRejectedError, parseLatexArchive } from "./latex-archive";

const fixture = readFileSync(join(__dirname, "../../fixtures/jakes-resume/resume.tex"), "utf8");

async function zipOf(files: Record<string, string>) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseLatexArchive", () => {
  it("accepts the canonical fixture despite its preamble \\input{glyphtounicode}", async () => {
    const bytes = await zipOf({ "resume.tex": fixture });
    const result = await parseLatexArchive(bytes);
    expect(result.rootFile).toBe("resume.tex");
    expect(result.source).toBe(fixture);
  });

  it("rejects a body that depends on \\input", async () => {
    const source =
      "\\documentclass{article}\\begin{document}\\input{other}\\end{document}";
    const bytes = await zipOf({ "resume.tex": source });
    await expect(parseLatexArchive(bytes)).rejects.toThrow(ArchiveRejectedError);
  });

  it("rejects an archive with no .tex file", async () => {
    const bytes = await zipOf({ "readme.md": "hi" });
    await expect(parseLatexArchive(bytes)).rejects.toThrow(ArchiveRejectedError);
  });

  it("rejects an archive with an ambiguous root file", async () => {
    const bytes = await zipOf({
      "a.tex": "\\documentclass{article}\\begin{document}a\\end{document}",
      "b.tex": "\\documentclass{article}\\begin{document}b\\end{document}",
    });
    await expect(parseLatexArchive(bytes)).rejects.toThrow(ArchiveRejectedError);
  });

  it("turns malformed ZIP data into an actionable rejection", async () => {
    await expect(
      parseLatexArchive(new TextEncoder().encode("not a zip")),
    ).rejects.toThrow("invalid ZIP archive");
  });

  it("ignores commented-out body includes", async () => {
    const source =
      "\\documentclass{article}\\begin{document}\n% \\input{other}\nhello\\end{document}";
    const bytes = await zipOf({ "resume.tex": source });
    await expect(parseLatexArchive(bytes)).resolves.toMatchObject({ source });
  });

  it("rejects an unbraced body include", async () => {
    const source =
      "\\documentclass{article}\\begin{document}\\input other.tex\\end{document}";
    const bytes = await zipOf({ "resume.tex": source });
    await expect(parseLatexArchive(bytes)).rejects.toThrow(ArchiveRejectedError);
  });

  it("rejects a root file without a document environment", async () => {
    const bytes = await zipOf({ "resume.tex": "\\documentclass{article}" });
    await expect(parseLatexArchive(bytes)).rejects.toThrow(
      "root file is missing a document environment",
    );
  });
});
