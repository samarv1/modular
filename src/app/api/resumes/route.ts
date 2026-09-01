import { NextResponse } from "next/server";
import { asRow, asRows, ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import {
  CompositionError,
  compositionErrorStatus,
  setResumeComposition,
} from "@/lib/composition";
import { dedupedName } from "@/lib/unique-db-name";
import { readJsonObject, throwDbError } from "@/lib/api-request";
import {
  integerFieldError,
  nullableStringFieldError,
} from "@/lib/field-validation";
import type { ResumeRow } from "@/lib/rows";

async function ownerHasFolder(
  ownerId: string,
  folderId: string | null | undefined,
): Promise<boolean> {
  if (folderId === null || folderId === undefined) return true;
  const { data, error } = asRow<{ id: string }>(
    await ownerScopedTable("resume_folder", ownerId)
      .select("id")
      .eq("id", folderId)
      .maybeSingle(),
  );
  if (error) throwDbError(error);
  return data !== null;
}

// Ordered by creation, not last-edited — tabs stay put as you work instead
// of reshuffling every time an autosave lands, the same way browser tabs do.
export async function GET() {
  const ownerId = await getOwnerId();
  const { data, error } = asRows<ResumeRow>(
    await ownerScopedTable("resume", ownerId)
      .select(
        "id, title, template_shell_id, compile_status, folder_id, position_x, position_y, updated_at, created_at",
      )
      .order("created_at", { ascending: true }),
  );
  if (error) throwDbError(error);
  return NextResponse.json({ resumes: data ?? [] });
}

// Create blank or duplicate (PLAN.md: "users can also start blank or
// duplicate a build"). Blank picks the caller's templateShellId, or falls
// back to the owner's most recently created shell if omitted — there's no
// shell picker UI yet, and in practice one owner has had one shell so far.
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "body must be a JSON object" },
      { status: 400 },
    );
  }
  const desiredTitle =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Untitled resume";
  const title = await dedupedName("resume", "title", desiredTitle);

  const fieldError =
    integerFieldError(body, ["positionX", "positionY"]) ??
    nullableStringFieldError(body, "folderId");
  if (fieldError) return fieldError;
  if (
    typeof body.positionX !== "number" ||
    typeof body.positionY !== "number"
  ) {
    // Every caller (Desktop's "New resume", the empty-bank shell) computes an
    // occupancy-checked position before POSTing — a missing one means the
    // caller has a bug, not that (0,0) is a reasonable fallback. (0,0) sits
    // on top of the desktop's first icon, so silently defaulting to it here
    // used to produce icons stacked on top of each other.
    return NextResponse.json(
      { error: "positionX and positionY are required" },
      { status: 400 },
    );
  }

  // Desktop placement (Phase 6) — the caller (Desktop's "New resume") computes
  // where the icon should land, and which folder (if any) it should land in.
  const position = {
    positionX: body.positionX,
    positionY: body.positionY,
    folderId:
      body.folderId === null || typeof body.folderId === "string"
        ? body.folderId
        : undefined,
  };

  const ownerId = await getOwnerId();
  if (typeof body.duplicateFromResumeId === "string") {
    return duplicateResume(
      ownerId,
      body.duplicateFromResumeId,
      title,
      position,
    );
  }
  return createBlankResume(
    ownerId,
    typeof body.templateShellId === "string" ? body.templateShellId : undefined,
    title,
    position,
  );
}

async function createBlankResume(
  ownerId: string,
  templateShellId: string | undefined,
  title: string,
  position: {
    positionX?: number;
    positionY?: number;
    folderId?: string | null;
  },
) {
  if (!(await ownerHasFolder(ownerId, position.folderId))) {
    return NextResponse.json({ error: "folder not found" }, { status: 422 });
  }

  // A template shell outlives the bank resumes that created it (deleting a
  // bank resume never deletes its shell), so shell existence alone isn't
  // proof there's anything to build a blank resume from. Require at least
  // one successfully imported bank resume, same check GET /api/source-resumes
  // uses for the Bank pane's own empty state.
  const { data: sourceResume, error: sourceResumeError } = asRow<{
    id: string;
  }>(
    await ownerScopedTable("source_resume", ownerId)
      .select("id")
      .eq("import_status", "success")
      .limit(1)
      .maybeSingle(),
  );
  if (sourceResumeError) throwDbError(sourceResumeError);
  if (!sourceResume) {
    return NextResponse.json(
      { error: "no bank resume available — import a resume first" },
      { status: 422 },
    );
  }

  let shellId = templateShellId;
  if (shellId) {
    const { data: shell, error: shellError } = asRow<{ id: string }>(
      await ownerScopedTable("template_shell", ownerId)
        .select("id")
        .eq("id", shellId)
        .maybeSingle(),
    );
    if (shellError) throwDbError(shellError);
    if (!shell) {
      return NextResponse.json(
        { error: "template shell not found" },
        { status: 422 },
      );
    }
  } else {
    const { data: shell, error: shellError } = asRow<{ id: string }>(
      await ownerScopedTable("template_shell", ownerId)
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (shellError) throwDbError(shellError);
    if (!shell) {
      return NextResponse.json(
        { error: "no template shell available yet — import a resume first" },
        { status: 422 },
      );
    }
    shellId = shell.id;
  }

  const { data, error } = asRow<ResumeRow>(
    await ownerScopedTable("resume", ownerId)
      .insert({
        title,
        template_shell_id: shellId,
        ...(position.positionX !== undefined
          ? { position_x: position.positionX }
          : {}),
        ...(position.positionY !== undefined
          ? { position_y: position.positionY }
          : {}),
        ...(position.folderId !== undefined
          ? { folder_id: position.folderId }
          : {}),
      })
      .select(
        "id, title, template_shell_id, compile_status, folder_id, position_x, position_y, updated_at, created_at",
      )
      .single(),
  );
  if (error) throwDbError(error);
  return NextResponse.json({ resume: data }, { status: 201 });
}

async function duplicateResume(
  ownerId: string,
  sourceResumeId: string,
  title: string,
  position: {
    positionX?: number;
    positionY?: number;
    folderId?: string | null;
  },
) {
  if (!(await ownerHasFolder(ownerId, position.folderId))) {
    return NextResponse.json({ error: "folder not found" }, { status: 422 });
  }

  const { data: source, error: sourceError } = asRow<{
    id: string;
    template_shell_id: string;
  }>(
    await ownerScopedTable("resume", ownerId)
      .select("id, template_shell_id")
      .eq("id", sourceResumeId)
      .maybeSingle(),
  );
  if (sourceError) throwDbError(sourceError);
  if (!source) {
    return NextResponse.json(
      { error: "resume to duplicate not found" },
      { status: 404 },
    );
  }

  const { data: sections, error: sectionsError } = asRows<{
    id: string;
    title: string;
    position: number;
  }>(
    await ownerScopedTable("resume_section", ownerId)
      .select("id, title, position")
      .eq("resume_id", sourceResumeId)
      .order("position", { ascending: true }),
  );
  if (sectionsError) throwDbError(sectionsError);

  const { data: sectionEntries, error: entriesError } = asRows<{
    resume_section_id: string;
    bank_entry_id: string;
    position: number;
  }>(
    await ownerScopedTable("resume_section_entry", ownerId)
      .select("resume_section_id, bank_entry_id, position")
      .eq("resume_id", sourceResumeId)
      .order("position", { ascending: true }),
  );
  if (entriesError) throwDbError(entriesError);

  const { data: newResume, error: createError } = asRow<ResumeRow>(
    await ownerScopedTable("resume", ownerId)
      .insert({
        title,
        template_shell_id: source.template_shell_id,
        ...(position.positionX !== undefined
          ? { position_x: position.positionX }
          : {}),
        ...(position.positionY !== undefined
          ? { position_y: position.positionY }
          : {}),
        ...(position.folderId !== undefined
          ? { folder_id: position.folderId }
          : {}),
      })
      .select(
        "id, title, template_shell_id, compile_status, folder_id, position_x, position_y, updated_at, created_at",
      )
      .single(),
  );
  if (createError) throwDbError(createError);

  const compositionSections = (sections ?? []).map((section) => ({
    title: section.title,
    entries: (sectionEntries ?? [])
      .filter((e) => e.resume_section_id === section.id)
      .map((e) => e.bank_entry_id),
  }));

  try {
    await setResumeComposition(newResume!.id, compositionSections);
  } catch (err) {
    await ownerScopedTable("resume", ownerId)
      .delete()
      .eq("id", newResume!.id)
      .then(
        () => undefined,
        () => undefined,
      );
    if (err instanceof CompositionError) {
      return NextResponse.json(
        { error: err.message },
        { status: compositionErrorStatus(err.code) },
      );
    }
    throw err;
  }

  return NextResponse.json({ resume: newResume }, { status: 201 });
}
