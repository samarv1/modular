import { asRow, asRows, ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import type { BankEntryKind, ResumeComposition } from "@/lib/adapters/types";

// Compile-specific composition load: unlike loadResumeComposition (the
// outline pane's shape, which cross-references bank entries already held
// client-side), this joins straight through to bank_entry and template_shell
// so assemble() gets everything the preamble-union rule needs in one call.
export async function loadCompileComposition(
  resumeId: string,
): Promise<{ adapterId: string; title: string; composition: ResumeComposition } | null> {
  const ownerId = await getOwnerId();

  const { data: resume, error: resumeError } = asRow<{ template_shell_id: string; title: string }>(
    await ownerScopedTable("resume", ownerId).select("template_shell_id, title").eq("id", resumeId).maybeSingle(),
  );
  if (resumeError) throw new Error(resumeError.message);
  if (!resume) return null;

  const { data: shell, error: shellError } = asRow<{ adapter_id: string; preamble: string }>(
    await ownerScopedTable("template_shell", ownerId)
      .select("adapter_id, preamble")
      .eq("id", resume.template_shell_id)
      .maybeSingle(),
  );
  if (shellError) throw new Error(shellError.message);
  if (!shell) return null;

  const { data: sections, error: sectionsError } = asRows<{ id: string; title: string; position: number }>(
    await ownerScopedTable("resume_section", ownerId)
      .select("id, title, position")
      .eq("resume_id", resumeId)
      .order("position", { ascending: true }),
  );
  if (sectionsError) throw new Error(sectionsError.message);

  const { data: entries, error: entriesError } = asRows<{
    resume_section_id: string;
    position: number;
    bank_entry: { kind: BankEntryKind; raw_latex: string; required_packages: string[] } | null;
  }>(
    await ownerScopedTable("resume_section_entry", ownerId)
      .select("resume_section_id, position, bank_entry(kind, raw_latex, required_packages)")
      .eq("resume_id", resumeId)
      .order("position", { ascending: true }),
  );
  if (entriesError) throw new Error(entriesError.message);

  const composition: ResumeComposition = {
    shellPreamble: shell.preamble,
    sections: (sections ?? []).map((section) => ({
      title: section.title,
      entries: (entries ?? [])
        .filter((e) => e.resume_section_id === section.id && e.bank_entry)
        .map((e) => ({
          rawLatex: e.bank_entry!.raw_latex,
          kind: e.bank_entry!.kind,
          requiredPackages: e.bank_entry!.required_packages,
        })),
    })),
  };

  return { adapterId: shell.adapter_id, title: resume.title, composition };
}
