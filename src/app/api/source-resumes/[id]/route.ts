import { NextResponse } from "next/server";
import { z } from "zod";
import type { BankEntryKind } from "@/lib/adapters/types";
import {
  isUuid,
  mutationErrorMessage,
  mutationErrorStatus,
} from "@/lib/api-request";
import { deleteArtifactSafely } from "@/lib/artifact-lifecycle";
import { asRows } from "@/lib/db";
import {
  EntryMaterializationError,
  materializeStructuredFields,
} from "@/lib/entry-materialization";
import { getOwnerContext } from "@/lib/request-context";
import type { BankEntryRow } from "@/lib/rows";

const BatchUpdateSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string().trim().min(1).optional(),
    tags: z.array(z.string()).optional(),
    entry: z.unknown().optional(),
    header: z.unknown().optional(),
  })
  .strict()
  .refine((value) => value.entry === undefined || value.header === undefined, {
    message: "entry and header fields are mutually exclusive",
  });

const BatchRequestSchema = z
  .object({
    updates: z.array(BatchUpdateSchema),
    deleteIds: z.array(z.string().uuid()),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const id of [
      ...value.updates.map((update) => update.id),
      ...value.deleteIds,
    ]) {
      if (ids.has(id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate entry id ${id}`,
        });
      }
      ids.add(id);
    }
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { error: "source resume not found" },
      { status: 404 },
    );
  }
  const parsed = BatchRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid source resume changes" },
      { status: 400 },
    );
  }

  const context = await getOwnerContext();
  const updateIds = parsed.data.updates.map((update) => update.id);
  const mutationIds = [...updateIds, ...parsed.data.deleteIds];
  const currentById = new Map<
    string,
    { kind: BankEntryKind; display_name: string }
  >();
  if (mutationIds.length > 0) {
    const { data, error } = asRows<{
      id: string;
      kind: BankEntryKind;
      display_name: string;
    }>(
      await context
        .table("bank_entry")
        .select("id, kind, display_name")
        .eq("source_resume_id", id)
        .in("id", mutationIds),
    );
    if (error) throw new Error(error.message);
    for (const entry of data ?? []) currentById.set(entry.id, entry);
    if (currentById.size !== mutationIds.length) {
      return NextResponse.json({ error: "entry not found" }, { status: 404 });
    }
  }

  let updates: Record<string, unknown>[];
  try {
    updates = parsed.data.updates.map((update) => {
      const current = currentById.get(update.id)!;
      const materialized = materializeStructuredFields({
        entry: update.entry,
        header: update.header,
        currentDisplayName: current.display_name,
        expectedKind: current.kind,
      });
      return {
        id: update.id,
        ...(update.displayName !== undefined
          ? { display_name: update.displayName }
          : materialized && update.entry !== undefined
            ? { display_name: materialized.displayName }
            : {}),
        ...(update.tags !== undefined
          ? {
              tags: [
                ...new Set(
                  update.tags.map((tag) => tag.trim()).filter(Boolean),
                ),
              ],
            }
          : {}),
        ...(materialized ? { raw_latex: materialized.rawLatex } : {}),
      };
    });
  } catch (error) {
    if (error instanceof EntryMaterializationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const { error } = await context.client.rpc("update_source_resume_entries", {
    p_owner_id: context.ownerId,
    p_source_resume_id: id,
    p_updates: updates,
    p_delete_ids: parsed.data.deleteIds,
  });
  if (error) {
    const status = mutationErrorStatus(error);
    const message =
      error.code === "23503"
        ? "This entry is used in a resume and can't be removed until it's taken out there first."
        : mutationErrorMessage(error);
    return NextResponse.json({ error: message }, { status });
  }

  const { data: entries, error: entriesError } = asRows<BankEntryRow>(
    await context
      .table("bank_entry")
      .select(
        "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
      )
      .eq("source_resume_id", id)
      .order("created_at", { ascending: true }),
  );
  if (entriesError) throw new Error(entriesError.message);
  return NextResponse.json({ entries: entries ?? [] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { error: "source resume not found" },
      { status: 404 },
    );
  }
  const context = await getOwnerContext();
  const { data, error } = await context.client.rpc("delete_source_resume", {
    p_owner_id: context.ownerId,
    p_source_resume_id: id,
  });
  if (error) throw new Error(error.message);
  const deleted = (
    data as { archive_path: string; shell_archive_path: string }[] | null
  )?.[0];
  if (!deleted) {
    return NextResponse.json(
      { error: "source resume not found" },
      { status: 404 },
    );
  }
  if (deleted.archive_path !== deleted.shell_archive_path) {
    await deleteArtifactSafely(deleted.archive_path, context.client);
  }
  return new NextResponse(null, { status: 204 });
}
