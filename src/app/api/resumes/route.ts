import { NextResponse } from "next/server";
import { asRow, asRows } from "@/lib/db";
import { dedupedName } from "@/lib/unique-db-name";
import { isUuid, readJsonObject, throwDbError } from "@/lib/api-request";
import {
  integerFieldError,
  nullableStringFieldError,
} from "@/lib/field-validation";
import type { ResumeRow } from "@/lib/rows";
import { getOwnerContext, type OwnerContext } from "@/lib/request-context";

async function ownerHasFolder(
  context: OwnerContext,
  folderId: string | null | undefined,
): Promise<boolean> {
  if (folderId === null || folderId === undefined) return true;
  const { data, error } = asRow<{ id: string }>(
    await context
      .table("resume_folder")
      .select("id")
      .eq("id", folderId)
      .maybeSingle(),
  );
  if (error) throwDbError(error);
  return data !== null;
}

export async function GET() {
  const context = await getOwnerContext();
  const { data, error } = asRows<ResumeRow>(
    await context
      .table("resume")
      .select(
        "id, title, template_shell_id, compile_status, folder_id, position_x, position_y, updated_at, created_at",
      )
      .order("created_at", { ascending: true }),
  );
  if (error) throwDbError(error);
  return NextResponse.json({ resumes: data ?? [] });
}

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
  const fieldError =
    integerFieldError(body, ["positionX", "positionY"]) ??
    nullableStringFieldError(body, "folderId");
  if (fieldError) return fieldError;
  if (
    typeof body.positionX !== "number" ||
    typeof body.positionY !== "number"
  ) {
    // Defaulting to (0,0) would overlap the first desktop icon.
    return NextResponse.json(
      { error: "positionX and positionY are required" },
      { status: 400 },
    );
  }
  if (typeof body.folderId === "string" && !isUuid(body.folderId)) {
    return NextResponse.json({ error: "folder not found" }, { status: 422 });
  }
  if (
    typeof body.duplicateFromResumeId === "string" &&
    !isUuid(body.duplicateFromResumeId)
  ) {
    return NextResponse.json(
      { error: "resume to duplicate not found" },
      { status: 404 },
    );
  }
  if (
    typeof body.templateShellId === "string" &&
    !isUuid(body.templateShellId)
  ) {
    return NextResponse.json(
      { error: "template shell not found" },
      { status: 422 },
    );
  }

  const position = {
    positionX: body.positionX,
    positionY: body.positionY,
    folderId:
      body.folderId === null || typeof body.folderId === "string"
        ? body.folderId
        : undefined,
  };

  const context = await getOwnerContext();
  const title = await dedupedName("resume", "title", desiredTitle, {
    ownerId: context.ownerId,
    client: context.client,
  });
  if (typeof body.duplicateFromResumeId === "string") {
    return duplicateResume(
      context,
      body.duplicateFromResumeId,
      title,
      position,
    );
  }
  return createBlankResume(
    context,
    typeof body.templateShellId === "string" ? body.templateShellId : undefined,
    title,
    position,
  );
}

async function createBlankResume(
  context: OwnerContext,
  templateShellId: string | undefined,
  title: string,
  position: {
    positionX?: number;
    positionY?: number;
    folderId?: string | null;
  },
) {
  if (!(await ownerHasFolder(context, position.folderId))) {
    return NextResponse.json({ error: "folder not found" }, { status: 422 });
  }

  // Shells can outlive their source resumes, so a shell alone does not make
  // the bank usable.
  const { data: sourceResume, error: sourceResumeError } = asRow<{
    id: string;
  }>(
    await context
      .table("source_resume")
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
      await context
        .table("template_shell")
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
      await context
        .table("template_shell")
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
    await context
      .table("resume")
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
  context: OwnerContext,
  sourceResumeId: string,
  title: string,
  position: {
    positionX?: number;
    positionY?: number;
    folderId?: string | null;
  },
) {
  const { data, error } = asRow<ResumeRow>(
    await context.client
      .rpc("duplicate_resume", {
        p_owner_id: context.ownerId,
        p_source_resume_id: sourceResumeId,
        p_title: title,
        p_folder_id: position.folderId ?? null,
        p_position_x: position.positionX ?? 0,
        p_position_y: position.positionY ?? 0,
      })
      .single(),
  );
  if (error) {
    if (error.code === "P0002") {
      return NextResponse.json(
        { error: "resume to duplicate not found" },
        { status: 404 },
      );
    }
    if (error.code === "P0001") {
      return NextResponse.json({ error: "folder not found" }, { status: 422 });
    }
    throwDbError(error);
  }
  return NextResponse.json({ resume: data }, { status: 201 });
}
