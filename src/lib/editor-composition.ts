import type { BankEntryRow } from "@/lib/rows";

export interface EditorSection {
  title: string;
  entries: string[];
}

export type CompositionChangeError = "source_mismatch" | "exclusive_entry";

export interface CompositionChange {
  sections: EditorSection[];
  changed: boolean;
  error?: CompositionChangeError;
}

function sameSection(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function isExclusive(entry: Pick<BankEntryRow, "kind"> | undefined) {
  return entry?.kind === "section_chunk" || entry?.kind === "header_chunk";
}

function cloneSections(sections: EditorSection[]) {
  return sections.map((section) => ({
    ...section,
    entries: [...section.entries],
  }));
}

export function addCompositionEntry(
  sections: EditorSection[],
  entry: Pick<BankEntryRow, "id" | "kind" | "source_section">,
  entryById: ReadonlyMap<string, Pick<BankEntryRow, "kind">>,
  targetSectionTitle: string,
  insertBeforeId?: string,
): CompositionChange {
  if (sections.some((section) => section.entries.includes(entry.id))) {
    return { sections, changed: false };
  }
  if (!sameSection(targetSectionTitle, entry.source_section)) {
    return { sections, changed: false, error: "source_mismatch" };
  }

  const targetIndex = sections.findIndex(
    (section) => section.title === targetSectionTitle,
  );
  if (targetIndex === -1) {
    return {
      sections: [
        ...sections,
        { title: targetSectionTitle, entries: [entry.id] },
      ],
      changed: true,
    };
  }

  const target = sections[targetIndex];
  if (
    isExclusive(entry) ||
    target.entries.some((id) => isExclusive(entryById.get(id)))
  ) {
    return { sections, changed: false, error: "exclusive_entry" };
  }

  const next = cloneSections(sections);
  const insertAt = insertBeforeId
    ? next[targetIndex].entries.indexOf(insertBeforeId)
    : -1;
  if (insertAt === -1) next[targetIndex].entries.push(entry.id);
  else next[targetIndex].entries.splice(insertAt, 0, entry.id);
  return { sections: next, changed: true };
}

export function moveCompositionEntry(
  sections: EditorSection[],
  entryId: string,
  targetSectionTitle: string,
  entryById: ReadonlyMap<string, Pick<BankEntryRow, "kind" | "source_section">>,
  insertBeforeId?: string,
): CompositionChange {
  const fromIndex = sections.findIndex((section) =>
    section.entries.includes(entryId),
  );
  const toIndex = sections.findIndex(
    (section) => section.title === targetSectionTitle,
  );
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return { sections, changed: false };
  }

  const entry = entryById.get(entryId);
  const target = sections[toIndex];
  if (!entry || !sameSection(entry.source_section, target.title)) {
    return { sections, changed: false, error: "source_mismatch" };
  }
  if (
    isExclusive(entry) ||
    target.entries.some((id) => isExclusive(entryById.get(id)))
  ) {
    return { sections, changed: false, error: "exclusive_entry" };
  }

  const next = cloneSections(sections);
  next[fromIndex].entries = next[fromIndex].entries.filter(
    (id) => id !== entryId,
  );
  const insertAt = insertBeforeId
    ? next[toIndex].entries.indexOf(insertBeforeId)
    : -1;
  if (insertAt === -1) next[toIndex].entries.push(entryId);
  else next[toIndex].entries.splice(insertAt, 0, entryId);

  return {
    sections: next.filter((section) => section.entries.length > 0),
    changed: true,
  };
}

export function reorderCompositionEntry(
  sections: EditorSection[],
  entryId: string,
  beforeEntryId: string,
): CompositionChange {
  const sectionIndex = sections.findIndex((section) =>
    section.entries.includes(entryId),
  );
  if (sectionIndex === -1) return { sections, changed: false };
  const from = sections[sectionIndex].entries.indexOf(entryId);
  const to = sections[sectionIndex].entries.indexOf(beforeEntryId);
  if (to === -1 || from === to) return { sections, changed: false };

  const next = cloneSections(sections);
  const [moved] = next[sectionIndex].entries.splice(from, 1);
  next[sectionIndex].entries.splice(to, 0, moved);
  return { sections: next, changed: true };
}

export function removeCompositionEntry(
  sections: EditorSection[],
  sectionTitle: string,
  entryId: string,
): EditorSection[] {
  return sections
    .map((section) =>
      section.title === sectionTitle
        ? {
            ...section,
            entries: section.entries.filter((id) => id !== entryId),
          }
        : section,
    )
    .filter((section) => section.entries.length > 0);
}

export function moveCompositionSection(
  sections: EditorSection[],
  sectionTitle: string,
  direction: "up" | "down",
): EditorSection[] {
  const index = sections.findIndex((section) => section.title === sectionTitle);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= sections.length) {
    return sections;
  }
  const next = sections.slice();
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}
