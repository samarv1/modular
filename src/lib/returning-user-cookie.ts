// Supabase auth cookies keep the same prefix across hosted and local projects.
export function hasStaleSupabaseSessionCookie(
  cookies: { name: string }[],
): boolean {
  return cookies.some(
    (cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"),
  );
}
