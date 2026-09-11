import { connection } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerIdOrNull } from "@/lib/owner";
import { Desktop } from "@/components/home/desktop";
import { getDemoWorkspace } from "@/lib/sample-resume/demo-workspace";
import type { ResumeFolderRow, ResumeRow } from "@/lib/rows";

export default async function Home() {
  // Supabase's client fetch is not enough for Next to classify this page as
  // request-time data. Without an explicit connection boundary, production
  // builds prerender the owner's desktop and freeze it at deploy time.
  await connection();

  const ownerId = await getOwnerIdOrNull();

  // Anonymous visitor: src/proxy.ts already let this request through with
  // no session (see its comment) rather than redirecting to /login. Render
  // the same desktop shape a freshly seeded account gets, one "Jake's
  // Resume" and no folders, built from the in-memory fixture instead of a
  // database read.
  if (ownerId === null) {
    const { resume, sourceResume } = getDemoWorkspace();
    return (
      <main className="flex min-h-0 flex-1 flex-col">
        <Desktop
          initialFolders={[]}
          initialResumes={[resume]}
          hasTemplateShell
          demo
          demoSourceResume={sourceResume}
        />
      </main>
    );
  }
  const [
    { data: folderData, error: folderError },
    { data: resumeData, error: resumeError },
    { data: shellData, error: shellError },
  ] = await Promise.all([
    ownerScopedTable("resume_folder", ownerId)
      .select("id, name, position_x, position_y, created_at")
      .order("created_at", { ascending: true }),
    ownerScopedTable("resume", ownerId)
      .select(
        "id, title, template_shell_id, compile_status, folder_id, position_x, position_y, updated_at, created_at",
      )
      .order("created_at", { ascending: true }),
    ownerScopedTable("template_shell", ownerId)
      .select("id")
      .limit(1)
      .maybeSingle(),
  ]);
  if (folderError)
    throw new Error((folderError as { message: string }).message);
  if (resumeError)
    throw new Error((resumeError as { message: string }).message);

  // Gates the "New resume" (blank) affordance — POST /api/resumes 422s with
  // no template shell yet, which only happens before the first ZIP import.
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
