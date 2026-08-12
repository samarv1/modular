import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { mutationErrorStatus } from "@/lib/api-request";

/**
 * Deletes a single owner-scoped row by id and turns the result into the
 * standard REST response used by every DELETE route in src/app/api: 204 on
 * success, 404 if nothing matched, or the mapped status from
 * mutationErrorStatus on a DB error. `describeError` can override the
 * message for a given status (e.g. a friendlier message for an FK-restricted
 * delete); it falls back to the raw DB error message.
 */
export async function deleteOwnedRow(
  table: string,
  id: string,
  notFoundMessage: string,
  describeError?: (status: number, message: string) => string,
): Promise<NextResponse> {
  const ownerId = await getOwnerId();
  const { data, error } = await ownerScopedTable(table, ownerId).delete().eq("id", id).select("id").maybeSingle();
  if (error) {
    const status = mutationErrorStatus(error);
    return NextResponse.json(
      { error: describeError ? describeError(status, error.message) : error.message },
      { status },
    );
  }
  if (!data) {
    return NextResponse.json({ error: notFoundMessage }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
