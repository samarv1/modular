// Static page positions stay client-side because these are not owner data.
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
