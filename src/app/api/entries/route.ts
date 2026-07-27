import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";

function asRow<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
}

export interface BankEntryRow {
  id: string;
  kind: string;
  source_section: string;
  display_name: string;
  raw_latex: string;
  tags: string[];
  required_packages: string[];
  source_resume_id: string | null;
  // Embedded via the source_resume_id FK — null for orphaned entries (see
  // resumeSourceLabel in bank-pane.tsx) or for entries imported before
  // source_resume.display_name existed.
  source_resume: { display_name: string | null } | null;
  created_at: string;
}

export async function GET() {
  const { data, error } = asRow<BankEntryRow>(
    await ownerScopedTable("bank_entry")
      .select(
        "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
      )
      // created_at only — not source_section — so entries come back in
      // upload/original-resume order for the bank pane's section grouping,
      // not alphabetical.
      .order("created_at", { ascending: true }),
  );
  if (error) throw new Error(error.message);

  return NextResponse.json({ entries: data ?? [] });
}
