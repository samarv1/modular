import Link from "next/link";

// Shared between import-review-modal.tsx and pdf-import-review-modal.tsx:
// the shared-key-cap and bad-BYOK-key errors both point the user at
// /settings, so render that word as a real link instead of plain text.
export function ImportErrorMessage({
  message,
  code,
}: {
  message: string;
  code?: string;
}) {
  if (code === "shared_key_cap_reached") {
    return (
      <span className="text-[11.5px] text-danger">
        Hit AI usage cap. Please add your own API key in{" "}
        <Link href="/settings" className="underline hover:text-brand">
          Settings
        </Link>{" "}
        to keep importing.
      </span>
    );
  }
  if (code === "byok_key_rejected") {
    return (
      <span className="text-[11.5px] text-danger">
        Your Gemini API key was rejected. Check it in{" "}
        <Link href="/settings" className="underline hover:text-brand">
          Settings
        </Link>{" "}
        and try again.
      </span>
    );
  }
  return <span className="text-[11.5px] text-danger">{message}</span>;
}
