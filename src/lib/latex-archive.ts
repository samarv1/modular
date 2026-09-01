import JSZip from "jszip";
import { MAX_ARCHIVE_FILES, MAX_LATEX_SOURCE_CHARS } from "./archive-limits";
import { stripLatexComments } from "./latex-comments";

export interface LatexArchive {
  /** Path of the root .tex file within the archive. */
  rootFile: string;
  /** Full text source of the root file. */
  source: string;
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

const INPUT_INCLUDE_RE = /\\(?:input|include)\s*(?:\{[^}]+\}|[^\s%]+)/;

// JSZip doesn't expose a public way to check an entry's declared
// uncompressed size before decompressing it, only this undocumented
// internal field (verified present at runtime across the pinned version).
// Without this, a small compressed entry that unpacks to something huge
// (a zip bomb) would fully inflate into memory before MAX_LATEX_SOURCE_CHARS
// ever gets checked.
function declaredUncompressedSize(file: JSZip.JSZipObject): number | null {
  const size = (file as unknown as { _data?: { uncompressedSize?: number } })
    ._data?.uncompressedSize;
  return typeof size === "number" ? size : null;
}

async function readLatexFile(file: JSZip.JSZipObject): Promise<string> {
  const declaredSize = declaredUncompressedSize(file);
  if (declaredSize !== null && declaredSize > MAX_LATEX_SOURCE_CHARS) {
    throw new ArchiveRejectedError(
      `LaTeX source exceeds the ${MAX_LATEX_SOURCE_CHARS} character limit`,
      [file.name],
    );
  }
  const source = await file.async("string");
  if (source.length > MAX_LATEX_SOURCE_CHARS) {
    throw new ArchiveRejectedError(
      `LaTeX source exceeds the ${MAX_LATEX_SOURCE_CHARS} character limit`,
      [file.name],
    );
  }
  return source;
}

/**
 * Unzips an uploaded resume archive and locates its single root .tex file.
 * MVP restriction (PLAN.md): one root file, no \input/\include — anything
 * else is rejected rather than partially supported.
 */
export async function parseLatexArchive(
  zipBytes: Uint8Array,
): Promise<LatexArchive> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch {
    throw new ArchiveRejectedError("invalid ZIP archive");
  }
  if (Object.keys(zip.files).length > MAX_ARCHIVE_FILES) {
    throw new ArchiveRejectedError(
      `archive contains more than ${MAX_ARCHIVE_FILES} files`,
    );
  }
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
      const text = stripLatexComments(await readLatexFile(f));
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

  const source = await readLatexFile(rootEntry);
  const sourceWithoutComments = stripLatexComments(source);
  if (
    !/\\begin\s*\{document\}/.test(sourceWithoutComments) ||
    !/\\end\s*\{document\}/.test(sourceWithoutComments)
  ) {
    throw new ArchiveRejectedError(
      "root file is missing a document environment",
    );
  }
  // Only the document *body* matters here — preamble \input (e.g. Jake's own
  // canonical \input{glyphtounicode} for ATS readability) is normal and fine;
  // it's a body dependency on another file that MVP composition can't handle.
  const bodyMatch = sourceWithoutComments.match(
    /\\begin\s*\{document\}([\s\S]*)\\end\s*\{document\}/,
  );
  const body = bodyMatch?.[1] ?? "";
  if (INPUT_INCLUDE_RE.test(body)) {
    throw new ArchiveRejectedError(
      "document body depends on \\input or \\include, which MVP composition parsing does not support",
    );
  }

  // Assets stay in the original ZIP uploaded to storage. Expanding every
  // image/style file here doubled memory usage without any runtime consumer.
  return { rootFile: rootEntry.name, source };
}
