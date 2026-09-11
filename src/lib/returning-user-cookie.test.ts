import { describe, expect, it } from "vitest";
import { hasStaleSupabaseSessionCookie } from "./returning-user-cookie";

// This is what src/proxy.ts's public-path branch (see its comment) keys on
// to tell a first-time visitor from a returning user whose session died.
// See the module comment for why the match is prefix/suffix, not exact.
describe("hasStaleSupabaseSessionCookie", () => {
  it("is false for a first-time visitor with no cookies", () => {
    expect(hasStaleSupabaseSessionCookie([])).toBe(false);
  });

  it("is false when only unrelated cookies are present", () => {
    expect(hasStaleSupabaseSessionCookie([{ name: "vercel-analytics" }])).toBe(
      false,
    );
  });

  it("is true for a hosted-project auth cookie", () => {
    expect(
      hasStaleSupabaseSessionCookie([{ name: "sb-abcd1234-auth-token" }]),
    ).toBe(true);
  });

  it("is true for local Supabase's cookie name", () => {
    expect(hasStaleSupabaseSessionCookie([{ name: "sb-127-auth-token" }])).toBe(
      true,
    );
  });

  it("is true when @supabase/ssr chunks the cookie", () => {
    expect(
      hasStaleSupabaseSessionCookie([{ name: "sb-abcd1234-auth-token.0" }]),
    ).toBe(true);
  });
});
