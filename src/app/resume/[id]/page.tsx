import { notFound } from "next/navigation";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId, getOwnerIdOrNull } from "@/lib/owner";
import { loadResumeComposition } from "@/lib/resume-composition-query";
import { getSignedUrl } from "@/lib/storage";
import { resumeDownloadFilename } from "@/lib/resume-filename";
import { ResumeEditor } from "@/components/resume-editor";
import {
  DEMO_RESUME_ID,
  getDemoWorkspace,
} from "@/lib/sample-resume/demo-workspace";
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

  // Anonymous visitor opening the one demo resume: src/proxy.ts let this
  // through with no session. loadResumeComposition's isUuid guard below
  // already 404s any other id with no session, but "demo" isn't a UUID
  // either, so it needs its own branch here that never touches the database.
  if (id === DEMO_RESUME_ID && (await getOwnerIdOrNull()) === null) {
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

  // loadResumeComposition() returns null only when the resume row itself
  // doesn't exist (owner-scoped, so another owner's resume 404s the same
  // way) — a real resume with zero sections still returns { resume, sections: [] },
  // never null. That single call is both the existence check and the load.
  const composition = await loadResumeComposition(id);
  if (!composition) notFound();

  const ownerId = await getOwnerId();
  const { data: entryData, error: entryError } = await ownerScopedTable(
    "bank_entry",
    ownerId,
  )
    .select(
      "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, source_resume(display_name), created_at",
    )
    .order("created_at", { ascending: true });
  if (entryError) throw new Error((entryError as { message: string }).message);

  const pdfPath = composition.resume.pdf_artifact_path;
  const [pdfUrl, pdfDownloadUrl] = pdfPath
    ? await Promise.all([
        getSignedUrl(pdfPath),
        getSignedUrl(pdfPath, 3600, {
          download: resumeDownloadFilename(composition.resume.title),
        }),
      ])
    : [null, null];

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
