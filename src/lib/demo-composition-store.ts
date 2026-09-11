import type { EditorSection } from "@/components/outline/outline-pane";

// Carries the anonymous playground's outline across the desktop <-> editor
// route boundary (/ and /resume/demo are separate pages, so React state
// alone doesn't survive the navigation). sessionStorage, not localStorage:
// the arrangement is disposable by design and shouldn't outlive the tab.
// Every access is wrapped, since a private window or blocked site data
// throws rather than returning null.

const STORAGE_KEY = "modular-demo-composition";

export function loadDemoComposition(): EditorSection[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as EditorSection[];
  } catch {
    return null;
  }
}

export function saveDemoComposition(sections: EditorSection[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  } catch {
    // Best-effort only. The arrangement just won't survive navigation.
  }
}
