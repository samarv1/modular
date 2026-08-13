import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

// PKCE code-exchange landing page for Supabase Auth's Google OAuth flow
// (see src/app/login/page.tsx's signInWithOAuth redirectTo). Swaps the
// one-time ?code= for a session and sets the session cookie, then sends the
// user back into the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("exchangeCodeForSession failed:", error.message);
  } else {
    console.error(
      "auth callback missing code:",
      searchParams.get("error"),
      searchParams.get("error_description"),
    );
  }

  return NextResponse.redirect(`${origin}/login`);
}
