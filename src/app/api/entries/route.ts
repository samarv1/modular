import { NextResponse } from "next/server";
import { asRows } from "@/lib/db";
import { isUuid, throwDbError } from "@/lib/api-request";
import type { BankEntryRow } from "@/lib/rows";
import { getOwnerContext } from "@/lib/request-context";

export async function GET(request: Request) {
  const sourceResumeId = new URL(request.url).searchParams.get(
    "sourceResumeId",
  );
  if (sourceResumeId && !isUuid(sourceResumeId)) {
    return NextResponse.json(
      { error: "invalid source resume id" },
      { status: 400 },
    );
  }
  const context = await getOwnerContext();

  let query = context
    .table("bank_entry")
    .select(
      "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
    );
  if (sourceResumeId) query = query.eq("source_resume_id", sourceResumeId);

  const { data, error } = asRows<BankEntryRow>(
    await query.order("created_at", { ascending: true }),
  );
  if (error) throwDbError(error);

  return NextResponse.json({ entries: data ?? [] });
}
