import { NextResponse } from "next/server";
import { asRow } from "@/lib/db";
import {
  mutationErrorMessage,
  mutationErrorStatus,
  readJsonObject,
  isUuid,
} from "@/lib/api-request";
import { deleteOwnedRow } from "@/lib/delete-owned-row";
import {
  EntryMaterializationError,
  materializeStructuredFields,
} from "@/lib/entry-materialization";
import { getOwnerContext } from "@/lib/request-context";
import type { BankEntryKind } from "@/lib/adapters/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }
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
  const hasStructuredFields =
    body.entry !== undefined || body.header !== undefined;
  if (Object.keys(values).length === 0 && !hasStructuredFields) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const context = await getOwnerContext();
  let expectedKind: BankEntryKind | undefined;
  let currentDisplayName = "";
  if (hasStructuredFields) {
    const { data: current, error: currentError } = asRow<{
      kind: BankEntryKind;
      display_name: string;
    }>(
      await context
        .table("bank_entry")
        .select("kind, display_name")
        .eq("id", id)
        .maybeSingle(),
    );
    if (currentError) throw new Error(currentError.message);
    if (!current) {
      return NextResponse.json({ error: "entry not found" }, { status: 404 });
    }
    expectedKind = current.kind;
    currentDisplayName = current.display_name;
  }
  try {
    const materialized = materializeStructuredFields({
      entry: body.entry,
      header: body.header,
      currentDisplayName:
        typeof values.display_name === "string"
          ? values.display_name
          : currentDisplayName,
      expectedKind,
    });
    if (materialized) {
      values.raw_latex = materialized.rawLatex;
      values.source_offset_start = materialized.sourceOffsetStart;
      values.source_offset_end = materialized.sourceOffsetEnd;
      if (body.entry !== undefined && values.display_name === undefined) {
        values.display_name = materialized.displayName;
      }
    }
  } catch (error) {
    if (error instanceof EntryMaterializationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await context
    .table("bank_entry")
    .update(values)
    .eq("id", id)
    .select("id, display_name, tags, raw_latex")
    .single();

  if (error) {
    return NextResponse.json(
      { error: mutationErrorMessage(error) },
      { status: mutationErrorStatus(error) },
    );
  }
  return NextResponse.json({ entry: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }
  const context = await getOwnerContext();
  return deleteOwnedRow(
    "bank_entry",
    id,
    "entry not found",
    (status, message) =>
      status === 422
        ? "This entry is used in a resume and can't be removed until it's taken out there first."
        : message,
    context,
  );
}
