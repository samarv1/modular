import { asRow, asRows } from "@/lib/db";
import { groupBySectionId } from "@/lib/group-by-section";
import { getOwnerContext, type OwnerContext } from "@/lib/request-context";
import type { BankEntryKind, ResumeComposition } from "@/lib/adapters/types";

// Compilation needs bank entries and the template shell in one consistent load.
export async function loadCompileComposition(
  resumeId: string,
  providedContext?: OwnerContext,
): Promise<{
  adapterId: string;
  title: string;
  compileStatus: string;
  pdfArtifactPath: string | null;
  latexExportPath: string | null;
  shellArchivePath: string;
  shellRootFile: string;
  composition: ResumeComposition;
} | null> {
  const context = providedContext ?? (await getOwnerContext());

  const { data: resume, error: resumeError } = asRow<{
    template_shell_id: string;
    title: string;
    compile_status: string;
    pdf_artifact_path: string | null;
    latex_export_path: string | null;
  }>(
    await context
      .table("resume")
      .select(
        "template_shell_id, title, compile_status, pdf_artifact_path, latex_export_path",
      )
      .eq("id", resumeId)
      .maybeSingle(),
  );
  if (resumeError) throw new Error(resumeError.message);
  if (!resume) return null;

  const { data: shell, error: shellError } = asRow<{
    adapter_id: string;
    preamble: string;
    archive_path: string;
    root_file: string;
  }>(
    await context
      .table("template_shell")
      .select("adapter_id, preamble, archive_path, root_file")
      .eq("id", resume.template_shell_id)
      .maybeSingle(),
  );
  if (shellError) throw new Error(shellError.message);
  if (!shell) return null;

  const [sectionsResult, entriesResult] = await Promise.all([
    context
      .table("resume_section")
      .select("id, title, position")
      .eq("resume_id", resumeId)
      .order("position", { ascending: true }),
    context
      .table("resume_section_entry")
      .select(
        "resume_section_id, position, bank_entry(kind, raw_latex, required_packages)",
      )
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
    resume_section_id: string;
    position: number;
    bank_entry: {
      kind: BankEntryKind;
      raw_latex: string;
      required_packages: string[];
    } | null;
  }>(entriesResult);
  if (entriesError) throw new Error(entriesError.message);
  const entriesBySection = groupBySectionId(entries ?? []);

  const composition: ResumeComposition = {
    shellPreamble: shell.preamble,
    sections: (sections ?? []).map((section) => ({
      title: section.title,
      entries: (entriesBySection.get(section.id) ?? [])
        .filter((e) => e.bank_entry)
        .map((e) => ({
          rawLatex: e.bank_entry!.raw_latex,
          kind: e.bank_entry!.kind,
          requiredPackages: e.bank_entry!.required_packages,
        })),
    })),
  };

  return {
    adapterId: shell.adapter_id,
    title: resume.title,
    compileStatus: resume.compile_status,
    pdfArtifactPath: resume.pdf_artifact_path,
    latexExportPath: resume.latex_export_path,
    shellArchivePath: shell.archive_path,
    shellRootFile: shell.root_file,
    composition,
  };
}
