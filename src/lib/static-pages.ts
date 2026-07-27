// Permanent, code-defined desktop items — not owner data, not seeded into
// the DB. Each one opens as a page (see Desktop's openPageId) instead of a
// folder/resume. "text" pages just show `content`; "bank" lists what
// you've uploaded (one icon per source_resume, not clickable yet — see
// PLAN.md Phase 7 note for the real per-upload preview this'll grow into).
// Add more by appending to this list.
export type StaticPageKind = "text" | "bank";

export interface StaticPage {
  id: string;
  title: string;
  kind: StaticPageKind;
  content?: string; // only meaningful for kind "text"
}

export const STATIC_PAGES: StaticPage[] = [
  { id: "about", title: "About", kind: "text", content: "" },
  { id: "bank", title: "Bank", kind: "bank" },
];
