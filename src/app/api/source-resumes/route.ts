import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";

function asRows<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
}

export interface SourceResumeRow {
  id: string;
  display_name: string | null;
  created_at: string;
}

// Backs the home page's "Bank" static page (Desktop) — a plain list of what
// you've uploaded, not the extracted entries themselves (see GET /api/entries
// for that). Only successful imports; a rejected/mismatched upload was never
// persisted (see POST /api/imports), so there's nothing to list for those.
export async function GET() {
  const { data, error } = asRows<SourceResumeRow>(
    await ownerScopedTable("source_resume")
      .select("id, display_name, created_at")
      .eq("import_status", "success")
      .order("created_at", { ascending: true }),
  );
  if (error) throw new Error(error.message);
  return NextResponse.json({ sourceResumes: data ?? [] });
}
