import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the session cookie on every request (Supabase's documented
// Next.js pattern — the access token is short-lived, this is what keeps it
// current) and gates access: unauthenticated page requests redirect to
// /login, unauthenticated /api/* requests get a 401 JSON body instead of a
// redirect (a redirect doesn't mean anything to a fetch() call). By the time
// a route handler runs, a session is guaranteed — see src/lib/owner.ts.
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
