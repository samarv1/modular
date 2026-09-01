import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { throwDbError } from "@/lib/api-request";

// Vercel Cron auto-sends this header on scheduled invocations when
// CRON_SECRET is set — rejects any other caller. Real DB traffic (not just
// an HTTP ping) is what resets Supabase's free-tier 7-day pause timer.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await createServiceClient()
    .from("resume_folder")
    .select("id")
    .limit(1);
  if (error) throwDbError(error as { message: string });

  return NextResponse.json({ ok: true });
}
