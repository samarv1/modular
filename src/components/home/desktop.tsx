"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { FolderPlus, Plus } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { backToDesktopButtonClass } from "@/components/back-to-desktop";
import { FolderIcon } from "@/components/home/folder-icon";
import { ResumeIcon } from "@/components/home/resume-icon";
import { UploadZone } from "@/components/home/upload-zone";
import {
  DESKTOP_BACK_DROP_ID,
  FOLDER_DRAG_PREFIX,
  FOLDER_DROP_PREFIX,
  RESUME_DRAG_PREFIX,
} from "@/components/home/desktop-dnd-ids";
import type { ResumeFolderRow } from "@/app/api/folders/route";
import type { ResumeRow } from "@/app/api/resumes/route";
import { nextPlacement } from "@/lib/desktop-placement";

function BackDrop({ onClick }: { onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: DESKTOP_BACK_DROP_ID });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={
        isOver
          ? "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors border-brand bg-brand-wash text-brand"
          : backToDesktopButtonClass
      }
    >
      ← Desktop
    </button>
  );
}

export function Desktop({
  initialFolders,
  initialResumes,
  hasTemplateShell,
}: {
  initialFolders: ResumeFolderRow[];
  initialResumes: ResumeRow[];
  hasTemplateShell: boolean;
}) {
  const router = useRouter();
  const [folders, setFolders] = useState(initialFolders);
  const [resumes, setResumes] = useState(initialResumes);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  // Finder-style selection: one item at a time, first click highlights and
  // the second (double) click opens.
  const [selected, setSelected] = useState<{ kind: "folder" | "resume"; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const visibleFolders = currentFolderId === null ? folders : [];
  const visibleResumes = useMemo(
    () => resumes.filter((r) => (r.folder_id ?? null) === currentFolderId),
    [resumes, currentFolderId],
  );
  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;

  // Persisted immediately on drop, not debounced — unlike the editor's
  // composition autosave (which coalesces many rapid edits), a drag-end
  // here is already one discrete commit. Debouncing it only risked losing
  // the write if the user navigated away (e.g. double-clicked a resume open)
  // before the delay elapsed.
  function patchResume(id: string, values: Record<string, unknown>) {
    fetch(`/api/resumes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => {
      // Last-write-wins, same as autosave elsewhere — a transient failure
      // here just means the position/folder move didn't stick; the next
      // drag on this item will retry with a fresh value.
    });
  }

  function patchFolder(id: string, values: Record<string, unknown>) {
    fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => {});
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over, delta } = e;
    const activeId = String(active.id);

    if (activeId.startsWith(RESUME_DRAG_PREFIX)) {
      const resumeId = activeId.slice(RESUME_DRAG_PREFIX.length);
      const resume = resumes.find((r) => r.id === resumeId);
      if (!resume) return;
      const overId = over ? String(over.id) : null;

      if (overId?.startsWith(FOLDER_DROP_PREFIX)) {
        const folderId = overId.slice(FOLDER_DROP_PREFIX.length);
        const contents = resumes.filter((r) => (r.folder_id ?? null) === folderId);
        const pos = nextPlacement(contents.length);
        setResumes((cur) =>
          cur.map((r) => (r.id === resumeId ? { ...r, folder_id: folderId, position_x: pos.x, position_y: pos.y } : r)),
        );
        patchResume(resumeId, { folderId, positionX: pos.x, positionY: pos.y });
        return;
      }
      if (overId === DESKTOP_BACK_DROP_ID) {
        const topLevel = resumes.filter((r) => r.folder_id === null);
        const pos = nextPlacement(topLevel.length);
        setResumes((cur) =>
          cur.map((r) => (r.id === resumeId ? { ...r, folder_id: null, position_x: pos.x, position_y: pos.y } : r)),
        );
        patchResume(resumeId, { folderId: null, positionX: pos.x, positionY: pos.y });
        return;
      }
      // Dropped in open canvas — just reposition within the current container.
      // Rounded because delta.x/y are fractional (subpixel drag deltas), and
      // position_x/position_y are integer columns — an unrounded value failed
      // the PATCH with a Postgres 22P02 error that got silently swallowed.
      const nextX = Math.round(resume.position_x + delta.x);
      const nextY = Math.round(resume.position_y + delta.y);
      setResumes((cur) => cur.map((r) => (r.id === resumeId ? { ...r, position_x: nextX, position_y: nextY } : r)));
      patchResume(resumeId, { positionX: nextX, positionY: nextY });
      return;
    }

    if (activeId.startsWith(FOLDER_DRAG_PREFIX)) {
      const folderId = activeId.slice(FOLDER_DRAG_PREFIX.length);
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;
      const nextX = Math.round(folder.position_x + delta.x);
      const nextY = Math.round(folder.position_y + delta.y);
      setFolders((cur) => cur.map((f) => (f.id === folderId ? { ...f, position_x: nextX, position_y: nextY } : f)));
      patchFolder(folderId, { positionX: nextX, positionY: nextY });
    }
  }

  async function createFolder() {
    const topLevel = resumes.filter((r) => r.folder_id === null);
    const pos = nextPlacement(folders.length + topLevel.length);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionX: pos.x, positionY: pos.y }),
    });
    if (!res.ok) return;
    const { folder } = await res.json();
    setFolders((cur) => [...cur, folder]);
    setRenamingFolderId(folder.id);
  }

  async function renameFolder(id: string, name: string) {
    const trimmed = name.trim();
    setRenamingFolderId(null);
    if (!trimmed) return;
    setFolders((cur) => cur.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
    patchFolder(id, { name: trimmed });
  }

  // Available both at the top level and inside a folder — creating from
  // inside a folder drops the new resume straight into it, not onto the
  // desktop underneath.
  async function createResume() {
    if (!hasTemplateShell) {
      setError("Import a resume ZIP first — a blank build needs a template shell.");
      setTimeout(() => setError(null), 3500);
      return;
    }
    const containerCount =
      currentFolderId === null
        ? resumes.filter((r) => r.folder_id === null).length + folders.length
        : resumes.filter((r) => r.folder_id === currentFolderId).length;
    const pos = nextPlacement(containerCount);
    const res = await fetch("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Untitled resume",
        positionX: pos.x,
        positionY: pos.y,
        folderId: currentFolderId,
      }),
    });
    if (!res.ok) return;
    const { resume } = await res.json();
    router.push(`/resume/${resume.id}?new=1`);
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader />
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        {currentFolder ? (
          <>
            <BackDrop
              onClick={() => {
                setSelected(null);
                setCurrentFolderId(null);
              }}
            />
            <span className="font-mono text-[11px] uppercase tracking-wide text-faint">{currentFolder.name}</span>
            {/* Uploading only happens inside a folder — it's how new source
                material gets added to your bank, not a top-level desktop
                action (see the "Create" cluster below for why). */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-faint">Create</span>
              <button
                onClick={createResume}
                className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
              >
                <Plus className="size-3" />
                New resume
              </button>
            </div>
            <div className="h-6 w-px bg-line" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-faint">Import</span>
              <div className="min-w-[220px] flex-1">
                <UploadZone
                  folderId={currentFolder.id}
                  onUploaded={(resume) => setResumes((cur) => [...cur, resume])}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={createFolder}
              className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
            >
              <FolderPlus className="size-3" />
              New folder
            </button>
            <button
              onClick={createResume}
              className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
            >
              <Plus className="size-3" />
              New resume
            </button>
          </div>
        )}
        {error && <span className="px-2 text-[11.5px] text-danger">{error}</span>}
      </div>

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
        {/* Bounded workspace panel, not an edge-to-edge desktop — a handful
            of icons on a full-viewport canvas read as mostly empty space, so
            this centers a fixed-size "desk" instead of filling the pane. No
            background here — the page body's own dot-grid (globals.css)
            shows through, so the paper texture reads as one continuous
            surface rather than stopping at the panel's edge. */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          <div
            // Clicking bare canvas deselects — the target check keeps clicks
            // that bubbled up from an icon from immediately clearing it.
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
            className="relative h-full w-full max-w-[960px] max-h-[720px] shrink-0 overflow-hidden rounded-lg border border-line-strong"
            style={{
              background:
                "radial-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 20px 20px, var(--surface)",
              boxShadow: "0 4px 16px -4px rgba(18,24,28,0.18)",
            }}
          >
            {visibleFolders.length === 0 && visibleResumes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                {currentFolder ? (
                  <button
                    onClick={createResume}
                    className="flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
                  >
                    <Plus className="size-3" />
                    New resume
                  </button>
                ) : (
                  <span className="text-[12.5px] text-faint">
                    Create a folder or a resume to get started — uploads happen from inside a folder.
                  </span>
                )}
              </div>
            )}
            {visibleFolders.map((folder) => (
              <FolderIcon
                key={folder.id}
                id={folder.id}
                name={folder.name}
                x={folder.position_x}
                y={folder.position_y}
                hasContents={resumes.some((r) => r.folder_id === folder.id)}
                renaming={renamingFolderId === folder.id}
                selected={selected?.kind === "folder" && selected.id === folder.id}
                onSelect={() => setSelected({ kind: "folder", id: folder.id })}
                onStartRename={() => setRenamingFolderId(folder.id)}
                onCommitRename={(name) => renameFolder(folder.id, name)}
                onOpen={() => {
                  setSelected(null);
                  setCurrentFolderId(folder.id);
                }}
              />
            ))}
            {visibleResumes.map((resume) => (
              <ResumeIcon
                key={resume.id}
                id={resume.id}
                title={resume.title}
                x={resume.position_x}
                y={resume.position_y}
                selected={selected?.kind === "resume" && selected.id === resume.id}
                onSelect={() => setSelected({ kind: "resume", id: resume.id })}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}
