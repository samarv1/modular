import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_RESUME_ID } from "@/lib/demo-resume-id";
import { hasStaleSupabaseSessionCookie } from "@/lib/returning-user-cookie";

// Refreshes the session cookie on every request (Supabase's documented
// Next.js pattern — the access token is short-lived, this is what keeps it
// current) and gates access: unauthenticated page requests redirect to
// /login, unauthenticated /api/* requests get a 401 JSON body instead of a
// redirect (a redirect doesn't mean anything to a fetch() call).
//
// Two paths are let through without a session instead: "/" and
// "/resume/${DEMO_RESUME_ID}" render an anonymous playground (a copy of
// Jake's Resume held in memory, see demo-workspace.ts) rather than
// redirecting. Everywhere else, a route handler can still assume a session
// is guaranteed by the time it runs, see src/lib/owner.ts.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // A returning user whose session died still carries a stale Supabase
    // auth cookie. Send them to /login instead of the playground, or a
    // desktop holding one unfamiliar resume reads as their data having
    // vanished. See returning-user-cookie.ts for what this actually keys on.
    const isPublicPath =
      request.nextUrl.pathname === "/" ||
      request.nextUrl.pathname === `/resume/${DEMO_RESUME_ID}`;
    if (
      isPublicPath &&
      !hasStaleSupabaseSessionCookie(request.cookies.getAll())
    )
      return response;

    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // api/pdf-to-markdown is excluded: it's a root-level Python Vercel
  // Function, not a Next.js route, but this middleware still runs in front
  // of it. It's called only server-to-server from src/lib/pdf-to-markdown.ts
  // — that call has no browser session cookie to carry, so a Supabase-
  // session gate here would 401 it unconditionally. It does no database
  // access; src/lib/pdf-to-markdown.ts authenticates the call with its own
  // shared secret instead (see PDF_TO_MARKDOWN_SECRET).
  // api/cron/keepalive is excluded for the same reason: Vercel Cron has no
  // session cookie to carry, and the route authenticates itself with
  // CRON_SECRET instead. api/admin/seed-backfill is excluded on the same
  // grounds: it's run by hand with curl, acts on every user rather than the
  // caller, and checks CRON_SECRET itself.
  matcher: [
    "/((?!login|auth/callback|api/pdf-to-markdown|api/cron/keepalive|api/admin/seed-backfill|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image).*)",
  ],
};
