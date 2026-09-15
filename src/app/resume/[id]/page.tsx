import { notFound } from "next/navigation";
import { getOwnerContextOrNull } from "@/lib/request-context";
import { loadResumeComposition } from "@/lib/resume-composition-query";
import { getSignedUrl } from "@/lib/storage";
import { resumeDownloadFilename } from "@/lib/resume-filename";
import { ResumeEditor } from "@/components/resume-editor";
import type { BankEntryRow } from "@/lib/rows";
import {
  DEMO_RESUME_ID,
  getDemoWorkspace,
} from "@/lib/sample-resume/demo-workspace";

export default async function ResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;

  const context = await getOwnerContextOrNull();
  if (id === DEMO_RESUME_ID && !context) {
    const { entries, editorResume } = getDemoWorkspace();
    return (
      <main className="flex min-h-0 flex-1 flex-col">
        <ResumeEditor
          demo
          initialEntries={entries}
          initialResume={editorResume}
          initialSections={[]}
          initialPdfUrl={null}
          initialPdfDownloadUrl={null}
        />
      </main>
    );
  }
  if (!context) notFound();
  const composition = await loadResumeComposition(id, context);
  if (!composition) notFound();

  const entryPromise = context
    .table("bank_entry")
    .select(
      "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
    )
    .order("created_at", { ascending: true });

  const pdfPath = composition.resume.pdf_artifact_path;
  const pdfPromise = pdfPath
    ? Promise.all([
        getSignedUrl(pdfPath, 3600, undefined, context.client),
        getSignedUrl(
          pdfPath,
          3600,
          {
            download: resumeDownloadFilename(composition.resume.title),
          },
          context.client,
        ),
      ])
    : Promise.resolve<[null, null]>([null, null]);
  const [{ data: entryData, error: entryError }, [pdfUrl, pdfDownloadUrl]] =
    await Promise.all([entryPromise, pdfPromise]);
  if (entryError) throw new Error((entryError as { message: string }).message);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ResumeEditor
        initialEntries={(entryData ?? []) as unknown as BankEntryRow[]}
        initialResume={composition.resume}
        initialSections={composition.sections}
        initialPdfUrl={pdfUrl}
        initialPdfDownloadUrl={pdfDownloadUrl}
        initialRenaming={isNew === "1"}
      />
    </main>
  );
}
