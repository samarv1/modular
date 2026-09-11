// Distinguishes a first-time visitor from a returning user whose session
// died, for src/proxy.ts's two public paths ("/" and "/resume/<demo>", see
// its comment for why that distinction matters).
//
// supabase-js derives the cookie name as
// `sb-${hostname.split(".")[0]}-auth-token`, and @supabase/ssr may chunk it
// into "...-auth-token.0" / ".1". Matched on prefix/suffix, not the literal
// name, since the middle segment is the project ref and varies per
// environment (e.g. "sb-127-auth-token" for local Supabase). If a future
// supabase-js major renames the scheme, this just stops matching: worst
// case an expired session sees the playground instead of /login, never a
// security issue (see proxy.ts).
export function hasStaleSupabaseSessionCookie(
  cookies: { name: string }[],
): boolean {
  return cookies.some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
  );
}
