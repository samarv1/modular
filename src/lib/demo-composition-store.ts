import type { EditorSection } from "@/lib/editor-composition";
import type { BankEntryRow } from "@/lib/rows";

// The demo outline crosses page navigation but remains disposable per tab.
const STORAGE_KEY = "modular-demo-composition";

function isValidSection(
  section: unknown,
  entryById: Map<string, BankEntryRow>,
  seenTitles: Set<string>,
  seenEntryIds: Set<string>,
): section is EditorSection {
  if (typeof section !== "object" || section === null) return false;
  const { title, entries } = section as Record<string, unknown>;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    !Array.isArray(entries) ||
    entries.length === 0
  ) {
    return false;
  }
  const normalizedTitle = title.trim().toLowerCase();
  if (seenTitles.has(normalizedTitle)) return false;
  seenTitles.add(normalizedTitle);

  for (const id of entries) {
    if (typeof id !== "string" || seenEntryIds.has(id)) return false;
    const entry = entryById.get(id);
    if (!entry) return false;
    if (entry.source_section.trim().toLowerCase() !== normalizedTitle) {
      return false;
    }
    if (
      (entry.kind === "header_chunk" || entry.kind === "section_chunk") &&
      entries.length > 1
    ) {
      return false;
    }
    seenEntryIds.add(id);
  }
  return true;
}

export function loadDemoComposition(
  entries: BankEntryRow[],
): EditorSection[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const entryById = new Map(entries.map((entry) => [entry.id, entry]));
    const seenTitles = new Set<string>();
    const seenEntryIds = new Set<string>();
    if (
      !parsed.every((section) =>
        isValidSection(section, entryById, seenTitles, seenEntryIds),
      )
    ) {
      return null;
    }
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDemoComposition(sections: EditorSection[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}
