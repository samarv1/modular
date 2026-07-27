import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import type { BankEntryRow } from "@/lib/rows";

function asRow<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
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
