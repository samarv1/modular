import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { asRows } from "@/lib/supabase-result";
import type { BankEntryRow } from "@/lib/rows";

// ?sourceResumeId= scopes to one upload's entries — used by the import
// review modal's "edit an already-imported resume" mode (see
// import-review-modal.tsx) so it can show exactly what that upload
// contributed, not the whole bank.
export async function GET(request: Request) {
  const sourceResumeId = new URL(request.url).searchParams.get("sourceResumeId");

  let query = ownerScopedTable("bank_entry").select(
    "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
  );
  if (sourceResumeId) query = query.eq("source_resume_id", sourceResumeId);

  const { data, error } = asRows<BankEntryRow>(
    await query
      // created_at only, not source_section, so entries come back in
      // upload/original-resume order for the bank pane's section grouping,
      // not alphabetical.
      .order("created_at", { ascending: true }),
  );
  if (error) throw new Error(error.message);

  return NextResponse.json({ entries: data ?? [] });
}
