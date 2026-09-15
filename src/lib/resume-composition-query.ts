import { asRow, asRows } from "@/lib/db";
import { groupBySectionId } from "@/lib/group-by-section";
import { isUuid } from "@/lib/api-request";
import { getOwnerContext, type OwnerContext } from "@/lib/request-context";

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

export async function loadResumeComposition(
  resumeId: string,
  providedContext?: OwnerContext,
): Promise<{ resume: ResumeMetaRow; sections: ResumeSectionRow[] } | null> {
  // Route parameters must not reach Postgres as malformed UUIDs.
  if (!isUuid(resumeId)) return null;
  const context = providedContext ?? (await getOwnerContext());

  const { data: resume, error: resumeError } = asRow<ResumeMetaRow>(
    await context
      .table("resume")
      .select(
        "id, title, template_shell_id, compile_status, compile_error, pdf_artifact_path, page_count, updated_at",
      )
      .eq("id", resumeId)
      .maybeSingle(),
  );
  if (resumeError) throw new Error(resumeError.message);
  if (!resume) return null;

  const [sectionsResult, entriesResult] = await Promise.all([
    context
      .table("resume_section")
      .select("id, title, position")
      .eq("resume_id", resumeId)
      .order("position", { ascending: true }),
    context
      .table("resume_section_entry")
      .select("id, resume_section_id, bank_entry_id, position")
      .eq("resume_id", resumeId)
      .order("position", { ascending: true }),
  ]);
  const { data: sections, error: sectionsError } = asRows<{
    id: string;
    title: string;
    position: number;
  }>(sectionsResult);
  if (sectionsError) throw new Error(sectionsError.message);
  const { data: entries, error: entriesError } = asRows<{
    id: string;
    resume_section_id: string;
    bank_entry_id: string;
    position: number;
  }>(entriesResult);
  if (entriesError) throw new Error(entriesError.message);

  const entriesBySection = groupBySectionId(entries ?? []);

  const sectionRows: ResumeSectionRow[] = (sections ?? []).map((section) => ({
    id: section.id,
    title: section.title,
    position: section.position,
    entries: (entriesBySection.get(section.id) ?? []).map((e) => ({
      id: e.id,
      bankEntryId: e.bank_entry_id,
      position: e.position,
    })),
  }));

  return { resume, sections: sectionRows };
}
