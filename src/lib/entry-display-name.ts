// The single "how do we name an entry" rule, shared by extract.ts (parsing a
// freshly-uploaded resume's LaTeX AST) and import-commit.ts (regenerating a
// display name after a structured-field edit) so the two can't drift.
export function entryDisplayName(
  kind: "project_entry" | "subheading_entry" | "section_chunk",
  title: string | undefined,
  organization: string | undefined,
  sourceSection: string,
): string {
  if (kind === "project_entry") return title ?? "";
  if (kind === "subheading_entry")
    return [title, organization].filter(Boolean).join(" — ");
  return sourceSection;
}
