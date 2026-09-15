import { connection } from "next/server";
import { getOwnerContextOrNull } from "@/lib/request-context";
import { Desktop } from "@/components/home/desktop";
import type { ResumeFolderRow, ResumeRow, SourceResumeRow } from "@/lib/rows";
import { getDemoWorkspace } from "@/lib/sample-resume/demo-workspace";

export default async function Home() {
  // Next needs an explicit request boundary to avoid prerendering owner data.
  await connection();

  const context = await getOwnerContextOrNull();
  if (!context) {
    const { resume, sourceResume } = getDemoWorkspace();
    return (
      <main className="flex min-h-0 flex-1 flex-col">
        <Desktop
          demo
          initialFolders={[]}
          initialResumes={[resume]}
          initialBankFiles={[sourceResume]}
        />
      </main>
    );
  }
  const [
    { data: folderData, error: folderError },
    { data: resumeData, error: resumeError },
    { data: sourceResumeData, error: sourceResumeError },
  ] = await Promise.all([
    context
      .table("resume_folder")
      .select("id, name, position_x, position_y, created_at")
      .order("created_at", { ascending: true }),
    context
      .table("resume")
      .select(
        "id, title, template_shell_id, compile_status, folder_id, position_x, position_y, updated_at, created_at",
      )
      .order("created_at", { ascending: true }),
    context
      .table("source_resume")
      .select("id, display_name, created_at")
      .eq("import_status", "success")
      .order("created_at", { ascending: true }),
  ]);
  if (folderError)
    throw new Error((folderError as { message: string }).message);
  if (resumeError)
    throw new Error((resumeError as { message: string }).message);

  if (sourceResumeError)
    throw new Error((sourceResumeError as { message: string }).message);

  const folders = (folderData ?? []) as unknown as ResumeFolderRow[];
  const resumes = (resumeData ?? []) as unknown as ResumeRow[];
  const sourceResumes = (sourceResumeData ??
    []) as unknown as SourceResumeRow[];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Desktop
        initialFolders={folders}
        initialResumes={resumes}
        initialBankFiles={sourceResumes}
      />
    </main>
  );
}
