// Finder-style collision handling: "Resume" becomes "Resume (1)", a second
// collision becomes "Resume (2)", etc. `existingNames` should already
// exclude the item being renamed (if any), so renaming something to its own
// current name is a no-op, not a self-collision.
export function dedupeName(desired: string, existingNames: Iterable<string>): string {
  const taken = new Set(existingNames);
  if (!taken.has(desired)) return desired;
  let n = 1;
  while (taken.has(`${desired} (${n})`)) n++;
  return `${desired} (${n})`;
}
