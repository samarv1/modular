import { NextResponse } from "next/server";
import { mutationErrorMessage, mutationErrorStatus } from "@/lib/api-request";
import { getOwnerContext, type OwnerContext } from "@/lib/request-context";

export async function deleteOwnedRow(
  table: string,
  id: string,
  notFoundMessage: string,
  describeError?: (status: number, message: string) => string,
  providedContext?: OwnerContext,
): Promise<NextResponse> {
  const context = providedContext ?? (await getOwnerContext());
  const { data, error } = await context
    .table(table)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    const status = mutationErrorStatus(error);
    const message = mutationErrorMessage(error);
    return NextResponse.json(
      { error: describeError ? describeError(status, message) : message },
      { status },
    );
  }
  if (!data) {
    return NextResponse.json({ error: notFoundMessage }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
