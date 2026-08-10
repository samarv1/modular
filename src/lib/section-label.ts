// Shared by the bank pane and the outline pane so both panes group/label
// sections identically — a raw section title only ever displays as itself
// when it's one of the known four; everything else (Skills, Certifications,
// Languages, Hobbies, ...) displays as "Other" in both places. The
// underlying title is never touched — section titles must stay exact for
// the composition merge-by-title rule (see PLAN.md).
const KNOWN_SECTIONS = new Set([
  "name & contact",
  "education",
  "experience",
  "projects",
  "leadership",
]);

export function sectionGroupLabel(sectionTitle: string): string {
  return KNOWN_SECTIONS.has(sectionTitle.trim().toLowerCase()) ? sectionTitle : "Other";
}
