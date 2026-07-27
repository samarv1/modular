import { notFound } from "next/navigation";
import { ownerScopedTable } from "@/lib/db";
import { loadResumeComposition } from "@/lib/resume-composition-query";
import { ResumeEditor } from "@/components/resume-editor";
import type { BankEntryRow } from "@/lib/rows";

export default async function ResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;

  // loadResumeComposition() returns null only when the resume row itself
  // doesn't exist (owner-scoped, so another owner's resume 404s the same
  // way) — a real resume with zero sections still returns { resume, sections: [] },
  // never null. That single call is both the existence check and the load.
  const composition = await loadResumeComposition(id);
  if (!composition) notFound();

  const { data: entryData, error: entryError } = await ownerScopedTable("bank_entry")
    .select(
      "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
    )
    .order("created_at", { ascending: true });
  if (entryError) throw new Error((entryError as { message: string }).message);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ResumeEditor
        initialEntries={(entryData ?? []) as unknown as BankEntryRow[]}
        initialResume={composition.resume}
        initialSections={composition.sections}
        initialRenaming={isNew === "1"}
      />
    </main>
  );
}
