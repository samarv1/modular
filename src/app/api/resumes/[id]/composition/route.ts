import { NextResponse } from "next/server";
import {
  CompositionError,
  compositionErrorStatus,
  setResumeComposition,
  validateCompositionSections,
} from "@/lib/composition";
import { isUuid, readJsonObject } from "@/lib/api-request";
import { getOwnerContext } from "@/lib/request-context";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "resume not found" }, { status: 404 });
  }
  const body = await readJsonObject(request);

  if (!body) {
    return NextResponse.json(
      { error: "sections must be an array" },
      { status: 400 },
    );
  }

  try {
    const sections = validateCompositionSections(body.sections);
    const context = await getOwnerContext();
    await setResumeComposition(id, sections, context.ownerId, context.client);
  } catch (err) {
    if (err instanceof CompositionError) {
      return NextResponse.json(
        { error: err.message },
        { status: compositionErrorStatus(err.code) },
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
