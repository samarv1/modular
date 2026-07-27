import { ownerScopedTable } from "@/lib/db";
import { loadResumeComposition } from "@/lib/resume-composition-query";
import { ResumeEditor } from "@/components/resume-editor";
import type { BankEntryRow } from "@/app/api/entries/route";
import type { ResumeRow } from "@/app/api/resumes/route";

export default async function Home() {
  const { data: entryData, error: entryError } = await ownerScopedTable("bank_entry")
    .select(
      "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, created_at",
    )
    // created_at only — see the matching note in api/entries/route.ts
    .order("created_at", { ascending: true });
  if (entryError) throw new Error((entryError as { message: string }).message);

  // Single-resume editor for now — switching between resumes is a future
  // home page's job (see PLAN.md). This just opens whatever was worked on
  // most recently.
  const { data: resumeData, error: resumeError } = await ownerScopedTable("resume")
    .select("id, title, template_shell_id, compile_status, updated_at, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (resumeError) throw new Error((resumeError as { message: string }).message);

  const resume = (resumeData ?? null) as unknown as ResumeRow | null;
  const composition = resume ? await loadResumeComposition(resume.id) : null;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono text-lg font-semibold uppercase tracking-tight">
          Modular
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
          phase 5 — composition
        </span>
      </div>
      <ResumeEditor
        initialEntries={(entryData ?? []) as unknown as BankEntryRow[]}
        initialResume={resume}
        initialSections={composition?.sections ?? []}
      />
    </main>
  );
}
