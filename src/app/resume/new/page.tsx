import { EmptyResumeShell } from "@/components/empty-resume-shell";

export default async function NewResumePage({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string }>;
}) {
  const { folderId } = await searchParams;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <EmptyResumeShell folderId={folderId ?? null} />
    </main>
  );
}
