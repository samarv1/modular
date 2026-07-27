import { NextResponse } from "next/server";
import {
  CompositionError,
  compositionErrorStatus,
  setResumeComposition,
  type CompositionSectionInput,
} from "@/lib/composition";

// Full-replace autosave (PLAN.md: last-write-wins, no version/conflict
// field). The client sends the whole ordered section/entry tree on every
// change; the RPC in 0002_composition_rpc.sql does the delete+reinsert as
// one transaction rather than the API layer doing it as two calls.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body || !Array.isArray(body.sections)) {
    return NextResponse.json({ error: "sections must be an array" }, { status: 400 });
  }

  const sections: CompositionSectionInput[] = [];
  for (const raw of body.sections) {
    if (typeof raw?.title !== "string" || !raw.title.trim()) {
      return NextResponse.json({ error: "each section needs a title" }, { status: 400 });
    }
    if (!Array.isArray(raw.entries) || !raw.entries.every((e: unknown) => typeof e === "string")) {
      return NextResponse.json({ error: "section entries must be an array of ids" }, { status: 400 });
    }
    sections.push({ title: raw.title, entries: raw.entries });
  }

  try {
    await setResumeComposition(id, sections);
  } catch (err) {
    if (err instanceof CompositionError) {
      return NextResponse.json({ error: err.message }, { status: compositionErrorStatus(err.code) });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
