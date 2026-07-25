import JSZip from "jszip";

export interface LatexArchive {
  /** Path of the root .tex file within the archive. */
  rootFile: string;
  /** Full text source of the root file. */
  source: string;
  /** Every other file in the archive (images, .cls, .sty, etc.), for round-trip export. */
  assets: Map<string, Uint8Array>;
}

export class ArchiveRejectedError extends Error {
  constructor(
    public reason: string,
    public details: string[] = [],
  ) {
    super(reason);
    this.name = "ArchiveRejectedError";
  }
}

const INPUT_INCLUDE_RE = /\\(input|include)\s*\{/;

/**
 * Unzips an uploaded resume archive and locates its single root .tex file.
 * MVP restriction (PLAN.md): one root file, no \input/\include — anything
 * else is rejected rather than partially supported.
 */
export async function parseLatexArchive(zipBytes: Uint8Array): Promise<LatexArchive> {
  const zip = await JSZip.loadAsync(zipBytes);
  const texFiles = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.toLowerCase().endsWith(".tex"),
  );

  if (texFiles.length === 0) {
    throw new ArchiveRejectedError("no .tex file found in archive");
  }

  let rootEntry = texFiles[0];
  if (texFiles.length > 1) {
    const withDocumentclass: typeof texFiles = [];
    for (const f of texFiles) {
      const text = await f.async("string");
      if (/\\documentclass/.test(text)) withDocumentclass.push(f);
    }
    if (withDocumentclass.length !== 1) {
      throw new ArchiveRejectedError(
        "ambiguous root file",
        texFiles.map((f) => f.name),
      );
    }
    rootEntry = withDocumentclass[0];
  }

  const source = await rootEntry.async("string");
  // Only the document *body* matters here — preamble \input (e.g. Jake's own
  // canonical \input{glyphtounicode} for ATS readability) is normal and fine;
  // it's a body dependency on another file that MVP composition can't handle.
  const bodyMatch = source.match(/\\begin\{document\}([\s\S]*)\\end\{document\}/);
  const body = bodyMatch ? bodyMatch[1] : source;
  if (INPUT_INCLUDE_RE.test(body)) {
    throw new ArchiveRejectedError(
      "document body depends on \\input or \\include, which MVP composition parsing does not support",
    );
  }

  const assets = new Map<string, Uint8Array>();
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || path === rootEntry.name) continue;
    assets.set(path, await file.async("uint8array"));
  }

  return { rootFile: rootEntry.name, source, assets };
}
