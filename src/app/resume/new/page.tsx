import { EmptyResumeShell } from "@/components/empty-resume-shell";

export default async function NewResumePage({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string; positionX?: string; positionY?: string }>;
}) {
  const { folderId, positionX, positionY } = await searchParams;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <EmptyResumeShell
        folderId={folderId ?? null}
        positionX={positionX ? Number(positionX) : undefined}
        positionY={positionY ? Number(positionY) : undefined}
      />
    </main>
  );
}
