"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DocumentGlyph } from "@/components/home/resume-icon";
import { FolderIcon } from "@/components/home/folder-icon";
import { ResumeIcon } from "@/components/home/resume-icon";
import { StaticPageIcon } from "@/components/home/static-page-icon";
import { UploadZone, type UploadStatus } from "@/components/home/upload-zone";
import {
  DESKTOP_BACK_DROP_ID,
  FOLDER_DRAG_PREFIX,
  FOLDER_DROP_PREFIX,
  RESUME_DRAG_PREFIX,
  STATIC_PAGE_DRAG_PREFIX,
} from "@/components/home/desktop-dnd-ids";
import type { ResumeFolderRow, ResumeRow, SourceResumeRow } from "@/lib/rows";
import { nextPlacement } from "@/lib/desktop-placement";
import { STATIC_PAGES } from "@/lib/static-pages";

function pagePositionKey(id: string) {
  return `desktop-page-position:${id}`;
}

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
  const [templateShellAvailable, setTemplateShellAvailable] = useState(hasTemplateShell);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  // Finder-style selection: one item at a time, first click highlights and
  // the second (double) click opens.
  const [selected, setSelected] = useState<{ kind: "folder" | "resume" | "page"; id: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const resumePatchVersions = useRef(new Map<string, number>());
  const folderPatchVersions = useRef(new Map<string, number>());

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 3500);
  }, []);

  useEffect(
    () => () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    },
    [],
  );

  // Which permanent static page (e.g. About) is open, if any — mutually
  // exclusive with currentFolderId, its own view rather than a folder.
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  const openPage = STATIC_PAGES.find((p) => p.id === openPageId) ?? null;

  // The "Bank" static page just lists what you've uploaded (one icon per
  // source_resume, not clickable yet — see PLAN.md Phase 7 note for the
  // real per-upload preview this'll grow into). Not owner data Desktop
  // already has, so it's fetched client-side — but eagerly (not only once
  // the page is opened), since the closed folder icon also needs to know
  // whether there's anything inside to show the non-empty "peek" glyph.
  const [bankFiles, setBankFiles] = useState<SourceResumeRow[] | null>(null);
  const refreshBankFiles = useCallback(() => {
    fetch("/api/source-resumes")
      .then((res) => {
        if (!res.ok) throw new Error("bank refresh failed");
        return res.json();
      })
      .then((body) => setBankFiles(body.sourceResumes ?? []))
      .catch(() => showError("Bank files could not be loaded."));
  }, [showError]);
  useEffect(() => {
    refreshBankFiles();
  }, [refreshBankFiles]);

  // Static pages aren't owner data, so their desktop position lives in
  // localStorage, not the DB. Seeded with a grid default here (SSR-safe —
  // no localStorage access during render) and overwritten client-side once
  // mounted, if a saved position exists.
  const [pagePositions, setPagePositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const initial: Record<string, { x: number; y: number }> = {};
    STATIC_PAGES.forEach((page, i) => {
      const pos = nextPlacement(i);
      initial[page.id] = { x: pos.x, y: pos.y };
    });
    return initial;
  });
  useEffect(() => {
    // One-time read-through from localStorage on mount, not a subscription —
    // window/localStorage don't exist during SSR, so this can't happen
    // during render without a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPagePositions((cur) => {
      const next = { ...cur };
      for (const page of STATIC_PAGES) {
        const raw = window.localStorage.getItem(pagePositionKey(page.id));
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
          if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            next[page.id] = { x: Number(parsed.x), y: Number(parsed.y) };
          }
        } catch {
          // ignore malformed/stale localStorage value, keep the grid default
        }
      }
      return next;
    });
  }, []);
  function patchPagePosition(id: string, x: number, y: number) {
    setPagePositions((cur) => ({ ...cur, [id]: { x, y } }));
    window.localStorage.setItem(pagePositionKey(id), JSON.stringify({ x, y }));
  }

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
  function patchResume(
    id: string,
    values: Record<string, unknown>,
    previous: ResumeRow,
  ) {
    const version = (resumePatchVersions.current.get(id) ?? 0) + 1;
    resumePatchVersions.current.set(id, version);
    void fetch(`/api/resumes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("resume update failed");
        const body = (await res.json()) as { resume?: Partial<ResumeRow> };
        if (resumePatchVersions.current.get(id) === version && body.resume) {
          setResumes((cur) =>
            cur.map((resume) =>
              resume.id === id ? { ...resume, ...body.resume } : resume,
            ),
          );
        }
      })
      .catch(() => {
        if (resumePatchVersions.current.get(id) !== version) return;
        setResumes((cur) => cur.map((resume) => (resume.id === id ? previous : resume)));
        showError("Resume changes could not be saved.");
      });
  }

  function patchFolder(
    id: string,
    values: Record<string, unknown>,
    previous: ResumeFolderRow,
  ) {
    const version = (folderPatchVersions.current.get(id) ?? 0) + 1;
    folderPatchVersions.current.set(id, version);
    void fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("folder update failed");
        const body = (await res.json()) as { folder?: Partial<ResumeFolderRow> };
        if (folderPatchVersions.current.get(id) === version && body.folder) {
          setFolders((cur) =>
            cur.map((folder) =>
              folder.id === id ? { ...folder, ...body.folder } : folder,
            ),
          );
        }
      })
      .catch(() => {
        if (folderPatchVersions.current.get(id) !== version) return;
        setFolders((cur) => cur.map((folder) => (folder.id === id ? previous : folder)));
        showError("Folder changes could not be saved.");
      });
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
        patchResume(
          resumeId,
          { folderId, positionX: pos.x, positionY: pos.y },
          resume,
        );
        return;
      }
      if (overId === DESKTOP_BACK_DROP_ID) {
        const topLevel = resumes.filter((r) => r.folder_id === null);
        const pos = nextPlacement(STATIC_PAGES.length + folders.length + topLevel.length);
        setResumes((cur) =>
          cur.map((r) => (r.id === resumeId ? { ...r, folder_id: null, position_x: pos.x, position_y: pos.y } : r)),
        );
        patchResume(
          resumeId,
          { folderId: null, positionX: pos.x, positionY: pos.y },
          resume,
        );
        return;
      }
      // Dropped in open canvas — just reposition within the current container.
      // Rounded because delta.x/y are fractional (subpixel drag deltas), and
      // position_x/position_y are integer columns — an unrounded value failed
      // the PATCH with a Postgres 22P02 error that got silently swallowed.
      const nextX = Math.round(resume.position_x + delta.x);
      const nextY = Math.round(resume.position_y + delta.y);
      setResumes((cur) => cur.map((r) => (r.id === resumeId ? { ...r, position_x: nextX, position_y: nextY } : r)));
      patchResume(resumeId, { positionX: nextX, positionY: nextY }, resume);
      return;
    }

    if (activeId.startsWith(FOLDER_DRAG_PREFIX)) {
      const folderId = activeId.slice(FOLDER_DRAG_PREFIX.length);
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;
      const nextX = Math.round(folder.position_x + delta.x);
      const nextY = Math.round(folder.position_y + delta.y);
      setFolders((cur) => cur.map((f) => (f.id === folderId ? { ...f, position_x: nextX, position_y: nextY } : f)));
      patchFolder(folderId, { positionX: nextX, positionY: nextY }, folder);
      return;
    }

    if (activeId.startsWith(STATIC_PAGE_DRAG_PREFIX)) {
      const pageId = activeId.slice(STATIC_PAGE_DRAG_PREFIX.length);
      const pos = pagePositions[pageId];
      if (!pos) return;
      const nextX = Math.round(pos.x + delta.x);
      const nextY = Math.round(pos.y + delta.y);
      patchPagePosition(pageId, nextX, nextY);
    }
  }

  async function createFolder() {
    const topLevel = resumes.filter((r) => r.folder_id === null);
    const pos = nextPlacement(STATIC_PAGES.length + folders.length + topLevel.length);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionX: pos.x, positionY: pos.y }),
      });
      if (!res.ok) throw new Error("folder create failed");
      const { folder } = await res.json();
      setFolders((cur) => [...cur, folder]);
      setRenamingFolderId(folder.id);
    } catch {
      showError("Folder could not be created.");
    }
  }

  async function renameFolder(id: string, name: string) {
    const trimmed = name.trim();
    setRenamingFolderId(null);
    if (!trimmed) return;
    const previous = folders.find((folder) => folder.id === id);
    if (!previous || trimmed === previous.name) return;
    setFolders((cur) => cur.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
    patchFolder(id, { name: trimmed }, previous);
  }

  // Available both at the top level and inside a folder — creating from
  // inside a folder drops the new resume straight into it, not onto the
  // desktop underneath.
  async function createResume() {
    if (!templateShellAvailable) {
      showError("Import one of your resume ZIPs first");
      return;
    }
    const containerCount =
      currentFolderId === null
        ? STATIC_PAGES.length + resumes.filter((r) => r.folder_id === null).length + folders.length
        : resumes.filter((r) => r.folder_id === currentFolderId).length;
    const pos = nextPlacement(containerCount);
    try {
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
      if (!res.ok) throw new Error("resume create failed");
      const { resume } = await res.json();
      router.push(`/resume/${resume.id}?new=1`);
      router.refresh();
    } catch {
      showError("Resume could not be created.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader />
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        {openPage ? (
          <button onClick={() => setOpenPageId(null)} className={backToDesktopButtonClass}>
            ← Desktop
          </button>
        ) : (
          <>
            {currentFolder && (
              <>
                <BackDrop
                  onClick={() => {
                    setSelected(null);
                    setCurrentFolderId(null);
                  }}
                />
                <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                  {currentFolder.name}
                </span>
              </>
            )}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-faint">Create</span>
              {!currentFolder && (
                <button
                  onClick={createFolder}
                  className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
                >
                  <FolderPlus className="size-3" />
                  New folder
                </button>
              )}
              <button
                onClick={createResume}
                className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
              >
                <Plus className="size-3" />
                New resume
              </button>
            </div>
            <div className="h-6 w-px bg-line" />
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-faint">Import</span>
              <div className="w-[260px]">
                <UploadZone
                  onImported={() => {
                    setTemplateShellAvailable(true);
                    refreshBankFiles();
                  }}
                  onStatus={setUploadStatus}
                />
              </div>
              {uploadStatus && (
                <span
                  className={`px-2 text-[11.5px] ${uploadStatus.kind === "success" ? "text-ok" : "text-danger"}`}
                >
                  {uploadStatus.message}
                </span>
              )}
            </div>
          </>
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
            {openPage?.kind === "bank" ? (
              <div className="absolute inset-0 overflow-auto p-8">
                {bankFiles === null ? (
                  <div className="flex h-full items-center justify-center text-[12.5px] text-faint">
                    Loading…
                  </div>
                ) : bankFiles.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[12.5px] text-faint">
                    Nothing uploaded yet.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {bankFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex w-32 select-none flex-col items-center gap-1"
                      >
                        <DocumentGlyph />
                        <span className="inline-block max-w-full whitespace-normal break-words px-1 text-center text-[11px] font-medium leading-tight text-ink">
                          {file.display_name ?? file.id.slice(0, 6)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : openPage ? (
              <div className="absolute inset-0 overflow-auto p-8">
                {openPage.content ? (
                  <div className="whitespace-pre-wrap text-[13px] text-ink">{openPage.content}</div>
                ) : (
                  <div className="flex h-full items-center justify-center text-[12.5px] text-faint">
                    Nothing here yet.
                  </div>
                )}
              </div>
            ) : (
              <>
                {currentFolder && visibleResumes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      onClick={createResume}
                      className="flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
                    >
                      <Plus className="size-3" />
                      New resume
                    </button>
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
                {currentFolderId === null &&
                  STATIC_PAGES.map((page) => (
                    <StaticPageIcon
                      key={page.id}
                      id={page.id}
                      title={page.title}
                      x={pagePositions[page.id]?.x ?? 24}
                      y={pagePositions[page.id]?.y ?? 24}
                      glyph={page.kind === "bank" ? "folder" : "document"}
                      hasContents={page.kind === "bank" ? (bankFiles?.length ?? 0) > 0 : undefined}
                      selected={selected?.kind === "page" && selected.id === page.id}
                      onSelect={() => setSelected({ kind: "page", id: page.id })}
                      onOpen={() => {
                        setSelected(null);
                        setOpenPageId(page.id);
                      }}
                    />
                  ))}
              </>
            )}
          </div>
        </div>
      </DndContext>
    </div>
  );
}
