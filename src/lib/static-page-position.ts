import { nextPlacement } from "@/lib/desktop-placement";
import { STATIC_PAGES } from "@/lib/static-pages";

export function pagePositionKey(id: string) {
  return `desktop-page-position:${id}`;
}

// Static pages (About, Bank) aren't owner data, so their desktop position
// lives in localStorage rather than the DB — this reads it back, falling
// back to each page's default grid slot when nothing's saved yet. Client-only
// (touches window.localStorage), so callers must only use it post-mount.
export function readStaticPagePositions(): { x: number; y: number }[] {
  return STATIC_PAGES.map((page, i) => {
    const raw = window.localStorage.getItem(pagePositionKey(page.id));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          return { x: Number(parsed.x), y: Number(parsed.y) };
        }
      } catch {
        // ignore malformed value, fall through to default
      }
    }
    return nextPlacement(i);
  });
}
