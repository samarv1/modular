"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Top bar for the home/desktop page (its only caller). "Modular" is static
// text, not a link — navigation back to the desktop elsewhere in the app is
// the explicit "← Desktop" button (back-to-desktop.tsx), not the wordmark.
export function AppHeader() {
  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    // Full navigation, not router.push()+refresh(): a client-side refresh()
    // re-fetches the still-mounted "/" page's Server Component data before
    // the navigation away completes, which now has no session and 500s
    // (getOwnerId() throws). A hard reload sidesteps that race entirely.
    window.location.href = "/login";
  }

  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
      <span className="font-mono text-lg font-semibold uppercase tracking-tight">
        Modular
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" render={<Link href="/settings" />}>
          Settings
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
