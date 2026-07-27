import { ownerScopedTable } from "@/lib/db";
import { Desktop } from "@/components/home/desktop";
import type { ResumeFolderRow } from "@/app/api/folders/route";
import type { ResumeRow } from "@/app/api/resumes/route";

export default async function Home() {
  const { data: folderData, error: folderError } = await ownerScopedTable("resume_folder")
    .select("id, name, position_x, position_y, created_at")
    .order("created_at", { ascending: true });
  if (folderError) throw new Error((folderError as { message: string }).message);

  const { data: resumeData, error: resumeError } = await ownerScopedTable("resume")
    .select("id, title, template_shell_id, compile_status, folder_id, position_x, position_y, updated_at, created_at")
    .order("created_at", { ascending: true });
  if (resumeError) throw new Error((resumeError as { message: string }).message);

  // Gates the "New resume" (blank) affordance — POST /api/resumes 422s with
  // no template shell yet, which only happens before the first ZIP import.
  const { data: shellData, error: shellError } = await ownerScopedTable("template_shell")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (shellError) throw new Error((shellError as { message: string }).message);

  const folders = (folderData ?? []) as unknown as ResumeFolderRow[];
  const resumes = (resumeData ?? []) as unknown as ResumeRow[];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Desktop
        initialFolders={folders}
        initialResumes={resumes}
        hasTemplateShell={!!shellData}
      />
    </main>
  );
}
