import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";

// Bank entries are immutable raw LaTeX (PLAN.md) — display name and tags
// are the only editable fields, so this is the only write path onto bank_entry.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const values: Record<string, unknown> = {};
  if (typeof body.displayName === "string") {
    if (!body.displayName.trim()) {
      return NextResponse.json({ error: "displayName cannot be empty" }, { status: 400 });
    }
    values.display_name = body.displayName.trim();
  }
  if (Array.isArray(body.tags)) {
    if (!body.tags.every((t: unknown) => typeof t === "string")) {
      return NextResponse.json({ error: "tags must be strings" }, { status: 400 });
    }
    values.tags = body.tags.map((t: string) => t.trim()).filter(Boolean);
  }
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await ownerScopedTable("bank_entry")
    .update(values)
    .eq("id", id)
    .select("id, display_name, tags")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json({ entry: data });
}
