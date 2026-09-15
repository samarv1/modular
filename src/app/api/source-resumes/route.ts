import { NextResponse } from "next/server";
import { asRows } from "@/lib/db";
import { throwDbError } from "@/lib/api-request";
import type { SourceResumeRow } from "@/lib/rows";
import { getOwnerContext } from "@/lib/request-context";

export async function GET() {
  const context = await getOwnerContext();
  const { data, error } = asRows<SourceResumeRow>(
    await context
      .table("source_resume")
      .select("id, display_name, created_at")
      .eq("import_status", "success")
      .order("created_at", { ascending: true }),
  );
  if (error) throwDbError(error);
  return NextResponse.json({ sourceResumes: data ?? [] });
}
