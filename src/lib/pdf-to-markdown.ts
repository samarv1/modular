// Calls the root-level Python Vercel Function at api/pdf-to-markdown.py, which
// runs Microsoft's markitdown package. That function can't live under
// src/app/api (Next.js App Router routes are Node/Edge only) so it's reached
// over HTTP as a same-deployment call instead of a direct import.
function functionBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export class PdfToMarkdownError extends Error {}

export async function convertPdfToMarkdown(pdfBytes: Uint8Array): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/pdf" };
  // Two separate gates in front of this route, both need bypassing here:
  // Vercel Authentication (project-wide SSO protection, in front of
  // everything) and the app's own shared secret (api/pdf-to-markdown.py is
  // excluded from src/proxy.ts's Supabase-session check since this call has
  // no browser session to carry — see the comment there for why).
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  if (process.env.PDF_TO_MARKDOWN_SECRET) {
    headers["X-Internal-Secret"] = process.env.PDF_TO_MARKDOWN_SECRET;
  }

  const response = await fetch(`${functionBaseUrl()}/api/pdf-to-markdown`, {
    method: "POST",
    headers,
    // The extra Uint8Array wrap isn't a no-op: pdfBytes' buffer is typed
    // ArrayBufferLike (could be a SharedArrayBuffer), which Blob's BlobPart
    // doesn't accept — this narrows it to a concrete ArrayBuffer.
    body: new Blob([new Uint8Array(pdfBytes)]),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload.markdown !== "string") {
    const reason = payload?.error ?? `pdf-to-markdown function returned ${response.status}`;
    throw new PdfToMarkdownError(reason);
  }
  return payload.markdown;
}
