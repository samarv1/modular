import { ownerScopedTable } from "@/lib/db";

function asRow<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T | null; error: { message: string } | null };
}
function asRows<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
}

export interface ResumeMetaRow {
  id: string;
  title: string;
  template_shell_id: string;
  compile_status: string;
  compile_error: string | null;
  pdf_artifact_path: string | null;
  page_count: number | null;
  updated_at: string;
}

export interface ResumeSectionRow {
  id: string;
  title: string;
  position: number;
  entries: { id: string; bankEntryId: string; position: number }[];
}

// Shared by GET /api/resumes/:id and page.tsx's initial server-rendered
// load, so the two don't drift on what "a resume's composition" means.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadResumeComposition(
  resumeId: string,
): Promise<{ resume: ResumeMetaRow; sections: ResumeSectionRow[] } | null> {
  // A malformed id (not even UUID-shaped) should 404 like any other
  // nonexistent resume, not surface Postgres's "invalid input syntax for
  // type uuid" as a raw 500 — /resume/[id] can be hit with any route param.
  if (!UUID_RE.test(resumeId)) return null;

  const { data: resume, error: resumeError } = asRow<ResumeMetaRow>(
    await ownerScopedTable("resume")
      .select(
        "id, title, template_shell_id, compile_status, compile_error, pdf_artifact_path, page_count, updated_at",
      )
      .eq("id", resumeId)
      .maybeSingle(),
  );
  if (resumeError) throw new Error(resumeError.message);
  if (!resume) return null;

  const { data: sections, error: sectionsError } = asRows<{ id: string; title: string; position: number }>(
    await ownerScopedTable("resume_section")
      .select("id, title, position")
      .eq("resume_id", resumeId)
      .order("position", { ascending: true }),
  );
  if (sectionsError) throw new Error(sectionsError.message);

  const { data: entries, error: entriesError } = asRows<{
    id: string;
    resume_section_id: string;
    bank_entry_id: string;
    position: number;
  }>(
    await ownerScopedTable("resume_section_entry")
      .select("id, resume_section_id, bank_entry_id, position")
      .eq("resume_id", resumeId)
      .order("position", { ascending: true }),
  );
  if (entriesError) throw new Error(entriesError.message);

  const sectionRows: ResumeSectionRow[] = (sections ?? []).map((section) => ({
    id: section.id,
    title: section.title,
    position: section.position,
    entries: (entries ?? [])
      .filter((e) => e.resume_section_id === section.id)
      .map((e) => ({ id: e.id, bankEntryId: e.bank_entry_id, position: e.position })),
  }));

  return { resume, sections: sectionRows };
}
