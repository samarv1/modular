import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { mutationErrorStatus, readJsonObject } from "@/lib/api-request";
import { deleteOwnedRow } from "@/lib/delete-owned-row";

// Bank entries are immutable raw LaTeX (PLAN.md) — display name and tags
// are the only editable fields, so this is the only write path onto bank_entry.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }

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
    values.tags = [...new Set(body.tags.map((t: string) => t.trim()).filter(Boolean))];
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
    return NextResponse.json(
      { error: error.message },
      { status: mutationErrorStatus(error) },
    );
  }
  return NextResponse.json({ entry: data });
}

// resume_section_entry.bank_entry_id is ON DELETE RESTRICT (0001_init.sql:
// "entries in use can't be hard-deleted") — removing an entry still placed
// in a resume fails with a 23503 here, so the caller has to remove it from
// the resume first.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return deleteOwnedRow("bank_entry", id, "entry not found", (status, message) =>
    status === 422
      ? "This entry is used in a resume and can't be removed until it's taken out there first."
      : message,
  );
}
