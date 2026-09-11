import type { EditorSection } from "@/components/outline/outline-pane";
import { getDemoWorkspace } from "@/lib/sample-resume/demo-workspace";

// Carries the anonymous playground's outline across the desktop <-> editor
// route boundary (/ and /resume/demo are separate pages, so React state
// alone doesn't survive the navigation). sessionStorage, not localStorage:
// the arrangement is disposable by design and shouldn't outlive the tab.
// Every access is wrapped, since a private window or blocked site data
// throws rather than returning null.

const STORAGE_KEY = "modular-demo-composition";

// A stale value from a previous fixture or type shape can outlive the tab
// this store was written for, so entries are checked against the current
// fixture's known ids rather than trusted as-is.
function isValidSection(
  section: unknown,
  knownEntryIds: Set<string>,
): section is EditorSection {
  if (typeof section !== "object" || section === null) return false;
  const { title, entries } = section as Record<string, unknown>;
  return (
    typeof title === "string" &&
    Array.isArray(entries) &&
    entries.every((id) => typeof id === "string" && knownEntryIds.has(id))
  );
}

export function loadDemoComposition(): EditorSection[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const knownEntryIds = new Set(
      getDemoWorkspace().entries.map((entry) => entry.id),
    );
    const sections = parsed.filter((section) =>
      isValidSection(section, knownEntryIds),
    );
    return sections.length > 0 ? sections : null;
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
