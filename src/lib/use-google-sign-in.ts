"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// Shared by /login and SignInModal, so both entry points fire the same
// OAuth call and stay in sync if the redirect target or provider changes.
export function useGoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  return { signIn, pending, error };
}
