import { createBrowserClient } from "@supabase/ssr";

// Client-side only — used by the sign-in page to kick off the Google OAuth
// redirect. Uses the anon key, safe to expose to the browser.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
  }
  return createBrowserClient(url, anonKey);
}
