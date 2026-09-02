import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { seedSampleResume } from "@/lib/sample-resume/seed-sample-resume";

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
      // Every account passes through here, so it's the one place a first-login
      // seed can run without a separate "have we seen this user" check of its
      // own. Repeat logins cost one primary-key lookup (seedSampleResume's own
      // marker-row guard) and nothing else. A seeding failure must never keep
      // someone out of the app, hence the swallow.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        try {
          await seedSampleResume(user.id);
        } catch (seedError) {
          console.error("sample resume seed failed:", seedError);
        }
      }
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
