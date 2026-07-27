import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { CompositionError, compositionErrorStatus, setResumeComposition } from "@/lib/composition";

function asRow<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T | null; error: { message: string } | null };
}
function asRows<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
}

export interface ResumeRow {
  id: string;
  title: string;
  template_shell_id: string;
  compile_status: string;
  updated_at: string;
  created_at: string;
}

// Ordered by creation, not last-edited — tabs stay put as you work instead
// of reshuffling every time an autosave lands, the same way browser tabs do.
export async function GET() {
  const { data, error } = asRows<ResumeRow>(
    await ownerScopedTable("resume")
      .select("id, title, template_shell_id, compile_status, updated_at, created_at")
      .order("created_at", { ascending: true }),
  );
  if (error) throw new Error(error.message);
  return NextResponse.json({ resumes: data ?? [] });
}

// Create blank or duplicate (PLAN.md: "users can also start blank or
// duplicate a build"). Blank picks the caller's templateShellId, or falls
// back to the owner's most recently created shell if omitted — there's no
// shell picker UI yet, and in practice one owner has had one shell so far.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled resume";

  if (typeof body.duplicateFromResumeId === "string") {
    return duplicateResume(body.duplicateFromResumeId, title);
  }
  return createBlankResume(typeof body.templateShellId === "string" ? body.templateShellId : undefined, title);
}

async function createBlankResume(templateShellId: string | undefined, title: string) {
  let shellId = templateShellId;
  if (!shellId) {
    const { data: shell, error: shellError } = asRow<{ id: string }>(
      await ownerScopedTable("template_shell")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (shellError) throw new Error(shellError.message);
    if (!shell) {
      return NextResponse.json(
        { error: "no template shell available yet — import a resume first" },
        { status: 422 },
      );
    }
    shellId = shell.id;
  }

  const { data, error } = asRow<ResumeRow>(
    await ownerScopedTable("resume")
      .insert({ title, template_shell_id: shellId })
      .select("id, title, template_shell_id, compile_status, updated_at, created_at")
      .single(),
  );
  if (error) throw new Error(error.message);
  return NextResponse.json({ resume: data }, { status: 201 });
}

async function duplicateResume(sourceResumeId: string, title: string) {
  const { data: source, error: sourceError } = asRow<{ id: string; template_shell_id: string }>(
    await ownerScopedTable("resume").select("id, template_shell_id").eq("id", sourceResumeId).maybeSingle(),
  );
  if (sourceError) throw new Error(sourceError.message);
  if (!source) {
    return NextResponse.json({ error: "resume to duplicate not found" }, { status: 404 });
  }

  const { data: sections, error: sectionsError } = asRows<{ id: string; title: string; position: number }>(
    await ownerScopedTable("resume_section")
      .select("id, title, position")
      .eq("resume_id", sourceResumeId)
      .order("position", { ascending: true }),
  );
  if (sectionsError) throw new Error(sectionsError.message);

  const { data: sectionEntries, error: entriesError } = asRows<{
    resume_section_id: string;
    bank_entry_id: string;
    position: number;
  }>(
    await ownerScopedTable("resume_section_entry")
      .select("resume_section_id, bank_entry_id, position")
      .eq("resume_id", sourceResumeId)
      .order("position", { ascending: true }),
  );
  if (entriesError) throw new Error(entriesError.message);

  const { data: newResume, error: createError } = asRow<ResumeRow>(
    await ownerScopedTable("resume")
      .insert({ title, template_shell_id: source.template_shell_id })
      .select("id, title, template_shell_id, compile_status, updated_at, created_at")
      .single(),
  );
  if (createError) throw new Error(createError.message);

  const compositionSections = (sections ?? []).map((section) => ({
    title: section.title,
    entries: (sectionEntries ?? [])
      .filter((e) => e.resume_section_id === section.id)
      .map((e) => e.bank_entry_id),
  }));

  try {
    await setResumeComposition(newResume!.id, compositionSections);
  } catch (err) {
    if (err instanceof CompositionError) {
      return NextResponse.json({ error: err.message }, { status: compositionErrorStatus(err.code) });
    }
    throw err;
  }

  return NextResponse.json({ resume: newResume }, { status: 201 });
}
