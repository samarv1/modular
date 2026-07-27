import Link from "next/link";

// Styling shared with Desktop's own BackDrop (home/desktop.tsx) — that one
// composes a drop target onto these same classes (dragging a resume/folder
// onto it moves it out of the current folder), which this plain Link
// doesn't need since every other page is a real route change, not a
// client-side view state.
export const backToDesktopButtonClass =
  "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors border-line-strong text-muted-fg hover:border-brand hover:text-brand";

export function BackToDesktopLink() {
  return (
    <Link href="/" className={backToDesktopButtonClass}>
      ← Desktop
    </Link>
  );
}
