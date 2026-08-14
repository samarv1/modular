// Filesystem-safe download filename for a compiled resume artifact (PDF or
// export ZIP), derived from its title — used for the signed download URL's
// Content-Disposition, not for the inline preview URL (which stays
// untitled/anonymous).
export function resumeDownloadFilename(title: string, ext = "pdf"): string {
  const cleaned = title
    .trim()
    .replace(/[/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${cleaned || "resume"}.${ext}`;
}
