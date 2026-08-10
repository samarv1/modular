import JSZip from "jszip";

// Rebuilds the shell's original upload ZIP with the assembled resume source
// swapped in at the root .tex path — every other file (assets, styles)
// passes through untouched, so the export keeps the uploaded template's
// packaging exactly as-is.
export async function buildExportArchive(
  originalZipBytes: Uint8Array,
  rootFile: string,
  assembledSource: string,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(originalZipBytes);
  zip.file(rootFile, assembledSource);
  return zip.generateAsync({ type: "uint8array" });
}
