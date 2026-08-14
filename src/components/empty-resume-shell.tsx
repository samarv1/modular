"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, pointerWithin } from "@dnd-kit/core";
import { BackToDesktopLink } from "@/components/back-to-desktop";
import { BankPane } from "@/components/bank/bank-pane";
import { OutlinePane } from "@/components/outline/outline-pane";
import { PreviewPane } from "@/components/preview/preview-pane";
import type { BankEntryRow, ResumeFolderRow, ResumeRow } from "@/lib/rows";
import { nextFreePlacement } from "@/lib/desktop-placement";
import { readStaticPagePositions } from "@/lib/static-page-position";

const EMPTY_ENTRY_MAP = new Map<string, BankEntryRow>();
const EMPTY_USED_IDS = new Set<string>();

// Reached when "New resume" is clicked with an empty bank — there's no
// resume row yet (template_shell_id is NOT NULL, and a shell only exists
// once an import has succeeded), so this renders the same three-pane shape
// with everything but the bank pane inert. Once the bank pane's own upload
// finishes its first import, a blank resume finally has something to build
// from — this creates it the same way the desktop's "New resume" does, then
// hands off to the real editor.
export function EmptyResumeShell({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const [entries, setEntries] = useState<BankEntryRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed fresh here rather than passed in from Desktop at click time —
  // this can run long after the user landed on this page (they're picking a
  // bank file to upload in between), so a position captured up front would
  // be stale against whatever else got created/moved/deleted meanwhile.
  async function nextPosition(): Promise<{ x: number; y: number }> {
    const [resumesRes, foldersRes] = await Promise.all([fetch("/api/resumes"), fetch("/api/folders")]);
    const { resumes } = (await resumesRes.json()) as { resumes: ResumeRow[] };
    const { folders } = (await foldersRes.json()) as { folders: ResumeFolderRow[] };
    const occupied =
      folderId === null
        ? [
            ...readStaticPagePositions(),
            ...folders.map((f) => ({ x: f.position_x, y: f.position_y })),
            ...resumes.filter((r) => r.folder_id === null).map((r) => ({ x: r.position_x, y: r.position_y })),
          ]
        : resumes.filter((r) => r.folder_id === folderId).map((r) => ({ x: r.position_x, y: r.position_y }));
    return nextFreePlacement(occupied);
  }

  async function onFirstImport(imported: BankEntryRow[]) {
    setEntries((cur) => [...imported, ...cur]);
    if (imported.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const pos = await nextPosition();
      const res = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled resume", folderId, positionX: pos.x, positionY: pos.y }),
      });
      if (!res.ok) throw new Error("resume create failed");
      const { resume } = await res.json();
      router.push(`/resume/${resume.id}?new=1`);
      router.refresh();
    } catch {
      setError("Resume could not be created.");
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 pt-4 pb-1">
        <BackToDesktopLink />
        <span className="px-1 py-1 text-[13px] font-semibold text-faint">Untitled resume</span>
        {creating && <span className="px-2 text-[11.5px] text-faint">Setting up your resume…</span>}
        {error && <span className="px-2 text-[11.5px] text-danger">{error}</span>}
      </div>

      <DndContext id="empty-resume-dnd" collisionDetection={pointerWithin}>
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 w-[38%]">
            <BankPane entries={entries} usedEntryIds={EMPTY_USED_IDS} onEntriesImported={onFirstImport} />
          </div>
          <div className="w-px shrink-0 bg-line" />
          <div className="min-h-0 min-w-[15%] flex-1">
            <OutlinePane sections={[]} entryById={EMPTY_ENTRY_MAP} onChange={() => {}} />
          </div>
          <div className="w-px shrink-0 bg-line" />
          <div className="min-h-0 w-[30%]">
            <PreviewPane
              compileStatus="unbuilt"
              compileError={null}
              pageCount={null}
              pdfUrl={null}
              pdfDownloadUrl={null}
              compiling={false}
              onCompile={() => {}}
              exporting={false}
              onExport={() => {}}
            />
          </div>
        </div>
      </DndContext>
    </div>
  );
}
