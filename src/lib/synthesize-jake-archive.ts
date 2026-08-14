import JSZip from "jszip";
import { synthesizeJakeLatex } from "@/lib/synthesize-jake-latex";
import { parseLatexArchive } from "@/lib/latex-archive";
import { detectAdapter } from "@/lib/adapters/registry";
import type { ResumeExtraction } from "@/lib/resume-extraction-schema";

const SYNTHETIC_ROOT_FILE = "resume.tex";

// Shared by /api/imports (AI fallback for a non-Jake zip) and /api/pdf-imports
// (commit mode): turns an already-extracted structured resume into a
// zipped, parsed, adapter-detected Jake archive, so both call sites run the
// exact same synthesize -> zip -> parse -> detect steps instead of two
// copies that could drift. Can throw ArchiveRejectedError (from
// parseLatexArchive) if the synthesizer produced something structurally
// broken; callers decide how to handle that per their own error shape.
export async function synthesizeJakeArchive(extraction: ResumeExtraction) {
  const source = synthesizeJakeLatex(extraction);
  const zip = new JSZip();
  zip.file(SYNTHETIC_ROOT_FILE, source);
  const zipBytes = await zip.generateAsync({ type: "uint8array" });

  const archive = await parseLatexArchive(zipBytes);
  const { adapter, result } = detectAdapter({
    rootFile: archive.rootFile,
    source: archive.source,
  });
  return { zipBytes, archive, adapter, result };
}
