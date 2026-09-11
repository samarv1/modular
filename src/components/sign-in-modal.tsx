"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGoogleSignIn } from "@/lib/use-google-sign-in";

// The standard four-color Google "G" mark, matching every other
// Sign in with Google button on the web. Google's branding guidelines
// (developers.google.com/identity/branding-guidelines) require the logo
// verbatim, not restyled, so this SVG is fixed and shouldn't be recolored
// or resized independently of the button around it.
function GoogleGIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-6" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12
        c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24
        c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039
        l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36
        c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571
        c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}

// Google's "Neutral" theme (same source as the icon note above): #F2F2F2
// fill, no stroke, #1F1F1F medium-weight text. Not built on the shared
// Button primitive, since that spec is fixed regardless of this app's own
// button variants.
function GoogleSignInButton({
  onClick,
  pending,
}: {
  onClick: () => void;
  pending: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#F2F2F2] px-4 text-base font-medium text-[#1F1F1F] transition-colors hover:bg-[#E8E8E8] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleGIcon />
      {pending ? "Redirecting…" : "Sign in with Google"}
    </button>
  );
}

// Shown wherever the anonymous playground gates an action that needs an
// account (see src/lib/sample-resume/demo-workspace.ts). A modal instead of
// navigating to /login, so quitting just closes it instead of leaving the
// page, and opening it costs nothing (no route change, no server fetch).
export function SignInModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { signIn, pending, error } = useGoogleSignIn();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5 p-6">
        <DialogTitle className="pr-6 text-2xl font-bold">Sign in</DialogTitle>
        <DialogDescription className="sr-only">
          Sign in with Google to edit and create your own resumes.
        </DialogDescription>
        {error && <p className="text-[11.5px] text-danger">{error}</p>}
        <GoogleSignInButton onClick={signIn} pending={pending} />
      </DialogContent>
    </Dialog>
  );
}
