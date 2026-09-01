import { NextResponse } from "next/server";
import { asRows, ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { throwDbError } from "@/lib/api-request";
import type { SourceResumeRow } from "@/lib/rows";

// Backs the home page's "Bank" static page (Desktop) — a plain list of what
// you've uploaded, not the extracted entries themselves (see GET /api/entries
// for that). Only successful imports; a rejected/mismatched upload was never
// persisted (see POST /api/imports), so there's nothing to list for those.
export async function GET() {
  const ownerId = await getOwnerId();
  const { data, error } = asRows<SourceResumeRow>(
    await ownerScopedTable("source_resume", ownerId)
      .select("id, display_name, created_at")
      .eq("import_status", "success")
      .order("created_at", { ascending: true }),
  );
  if (error) throwDbError(error);
  return NextResponse.json({ sourceResumes: data ?? [] });
}
