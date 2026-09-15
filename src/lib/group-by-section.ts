export function groupBySectionId<T extends { resume_section_id: string }>(
  entries: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.resume_section_id);
    if (group) group.push(entry);
    else grouped.set(entry.resume_section_id, [entry]);
  }
  return grouped;
}

export interface StableSectionGroup<Key, Item> {
  key: Key;
  entries: Item[];
}

// Stable grouping preserves both section appearance and entry order.
export function groupEntriesBySection<Item, Key>(
  entries: readonly Item[],
  getKey: (entry: Item) => Key,
): StableSectionGroup<Key, Item>[] {
  const groups = new Map<Key, Item[]>();
  for (const entry of entries) {
    const key = getKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return Array.from(groups, ([key, groupedEntries]) => ({
    key,
    entries: groupedEntries,
  }));
}
