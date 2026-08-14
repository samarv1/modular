import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { mutationErrorStatus, readJsonObject } from "@/lib/api-request";
import { deleteOwnedRow } from "@/lib/delete-owned-row";
import { renderEntry, renderHeader } from "@/lib/synthesize-jake-latex";
import {
  ExtractedEntrySchema,
  HeaderDataSchema,
} from "@/lib/resume-extraction-schema";

// Bank entries' raw LaTeX is regenerated from structured fields, not typed
// directly — display name, tags, and a structured `entry`/`header` patch
// (kind-dependent, see resume-extraction-schema.ts) are the editable
// surface, so this is the only write path onto bank_entry.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "body must be a JSON object" },
      { status: 400 },
    );
  }

  const values: Record<string, unknown> = {};
  if (typeof body.displayName === "string") {
    if (!body.displayName.trim()) {
      return NextResponse.json(
        { error: "displayName cannot be empty" },
        { status: 400 },
      );
    }
    values.display_name = body.displayName.trim();
  }
  if (Array.isArray(body.tags)) {
    if (!body.tags.every((t: unknown) => typeof t === "string")) {
      return NextResponse.json(
        { error: "tags must be strings" },
        { status: 400 },
      );
    }
    values.tags = [
      ...new Set(body.tags.map((t: string) => t.trim()).filter(Boolean)),
    ];
  }
  // `entry` (subheading_entry/project_entry/section_chunk) and `header`
  // (header_chunk) are mutually exclusive, matching the two shapes a
  // reverse-parsed bank_entry can come back as (bank-entry-fields.ts).
  if (body.entry !== undefined) {
    const parsed = ExtractedEntrySchema.safeParse(body.entry);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid entry fields" },
        { status: 400 },
      );
    }
    values.raw_latex = renderEntry(parsed.data);
  } else if (body.header !== undefined) {
    const parsed = HeaderDataSchema.safeParse(body.header);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid header fields" },
        { status: 400 },
      );
    }
    values.raw_latex = renderHeader(parsed.data);
  }
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const ownerId = await getOwnerId();
  const { data, error } = await ownerScopedTable("bank_entry", ownerId)
    .update(values)
    .eq("id", id)
    .select("id, display_name, tags, raw_latex")
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
  return deleteOwnedRow(
    "bank_entry",
    id,
    "entry not found",
    (status, message) =>
      status === 422
        ? "This entry is used in a resume and can't be removed until it's taken out there first."
        : message,
  );
}
