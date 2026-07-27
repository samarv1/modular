// Top bar for the home/desktop page (its only caller). "Modular" is static
// text, not a link — navigation back to the desktop elsewhere in the app is
// the explicit "← Desktop" button (back-to-desktop.tsx), not the wordmark.
export function AppHeader() {
  return (
    <div className="flex items-center border-b border-line px-4 py-2.5">
      <span className="font-mono text-lg font-semibold uppercase tracking-tight">Modular</span>
    </div>
  );
}
