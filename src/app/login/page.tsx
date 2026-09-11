"use client";

import { Button } from "@/components/ui/button";
import { useGoogleSignIn } from "@/lib/use-google-sign-in";

export default function LoginPage() {
  const { signIn, pending, error } = useGoogleSignIn();

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6">
      <span className="font-mono text-lg font-semibold uppercase tracking-tight">
        Modular
      </span>
      <Button onClick={signIn} disabled={pending}>
        {pending ? "Redirecting…" : "Sign in with Google"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </main>
  );
}
