import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { seedSampleResume } from "@/lib/sample-resume/seed-sample-resume";

// One-off backfill: gives the sample resume to accounts that predate the
// first-login seed in src/app/auth/callback/route.ts. Safe to re-run: every
// already-seeded user short-circuits on seedSampleResume's marker row.
//
// Authenticated by CRON_SECRET rather than a session, same as
// api/cron/keepalive, because it acts on every user rather than the caller.
// src/proxy.ts excludes it from the session gate for the same reason.

export const maxDuration = 300;

const PAGE_SIZE = 200;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const client = createServiceClient();

  let total = 0;
  let seeded = 0;
  let skipped = 0;
  const failed: { userId: string; error: string }[] = [];

  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const users = data.users;
    if (users.length === 0) break;

    for (const user of users) {
      total++;
      if (dryRun) continue;
      try {
        // Sequential, not Promise.all: seeding writes to Storage and inserts
        // across five tables per user, and this runs at most once per
        // deployment. Concurrency would only add ways for it to fail.
        const result = await seedSampleResume(user.id);
        if (result.seeded) seeded++;
        else skipped++;
      } catch (err) {
        // One bad account must not abort the run, collect and keep going.
        failed.push({
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (users.length < PAGE_SIZE) break;
  }

  return NextResponse.json({
    dryRun,
    total,
    seeded,
    skipped,
    failed: failed.length,
    failures: failed,
  });
}
