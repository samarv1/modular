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
import {
  FolderPlus,
  Plus,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { SignInModal } from "@/components/sign-in-modal";
import { backToDesktopButtonClass } from "@/components/back-to-desktop";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DocumentGlyph } from "@/components/home/resume-icon";
import { FolderIcon } from "@/components/home/folder-icon";
import { ResumeIcon } from "@/components/home/resume-icon";
import { StaticPageIcon } from "@/components/home/static-page-icon";
import { AboutContent } from "@/components/home/about-content";
import { IconGlyphButton, IconLabel } from "@/components/home/desktop-icon";
import { ImportReviewModal } from "@/components/home/import-review-modal";
import {
  DESKTOP_BACK_DROP_ID,
  FOLDER_DRAG_PREFIX,
  FOLDER_DROP_PREFIX,
  RESUME_DRAG_PREFIX,
  STATIC_PAGE_DRAG_PREFIX,
} from "@/components/home/desktop-dnd-ids";
import type { ResumeFolderRow, ResumeRow, SourceResumeRow } from "@/lib/rows";
import { nextPlacement, nextFreePlacement } from "@/lib/desktop-placement";
import { STATIC_PAGES } from "@/lib/static-pages";
import { pagePositionKey } from "@/lib/static-page-position";

function BankFileIcon({
  title,
  selected,
  onSelect,
  onOpen,
}: {
  title: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex w-32 select-none flex-col items-center gap-1">
      <IconGlyphButton
        onSelect={onSelect}
        onOpen={onOpen}
        ariaLabel={`Edit uploaded resume ${title}`}
        selected={selected}
      >
        <DocumentGlyph />
      </IconGlyphButton>
      <IconLabel
        title={title}
        selected={selected}
        onSelect={onSelect}
        onOpen={onOpen}
      />
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "brand",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "brand" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted-fg ${
        tone === "danger"
          ? "hover:border-danger hover:text-danger"
          : "hover:border-brand hover:text-brand"
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:text-muted-fg`}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
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
  initialBankFiles,
  demo = false,
}: {
  initialFolders: ResumeFolderRow[];
  initialResumes: ResumeRow[];
  initialBankFiles: SourceResumeRow[];
  demo?: boolean;
}) {
  const router = useRouter();
  const [folders, setFolders] = useState(initialFolders);
  const [resumes, setResumes] = useState(initialResumes);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    kind: "folder" | "resume" | "page" | "bank";
    id: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingSourceResume, setEditingSourceResume] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  const resumePatchVersions = useRef(new Map<string, number>());
  const folderPatchVersions = useRef(new Map<string, number>());
  const [signInOpen, setSignInOpen] = useState(false);
  const requireSignIn = () => setSignInOpen(true);

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

  const [openPageId, setOpenPageId] = useState<string | null>(null);
  const openPage = STATIC_PAGES.find((p) => p.id === openPageId) ?? null;

  const [bankFiles, setBankFiles] =
    useState<SourceResumeRow[]>(initialBankFiles);
  const refreshBankFiles = useCallback(() => {
    if (demo) return;
    fetch("/api/source-resumes")
      .then((res) => {
        if (!res.ok) throw new Error("bank refresh failed");
        return res.json();
      })
      .then((body) => setBankFiles(body.sourceResumes ?? []))
      .catch(() => showError("Bank files could not be loaded."));
  }, [demo, showError]);
  const templateShellAvailable = bankFiles.length > 0;

  // Static page positions stay local because they are not owner data.
  const [pagePositions, setPagePositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => {
    const initial: Record<string, { x: number; y: number }> = {};
    STATIC_PAGES.forEach((page, i) => {
      const pos = nextPlacement(i);
      initial[page.id] = { x: pos.x, y: pos.y };
    });
    return initial;
  });
  useEffect(() => {
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
          // Invalid saved positions fall back to the grid default.
        }
      }
      return next;
    });
  }, []);
  function patchPagePosition(id: string, x: number, y: number) {
    setPagePositions((cur) => ({ ...cur, [id]: { x, y } }));
    window.localStorage.setItem(pagePositionKey(id), JSON.stringify({ x, y }));
  }

  function occupiedRootPositions(): { x: number; y: number }[] {
    return [
      ...STATIC_PAGES.map((page) => pagePositions[page.id]).filter(
        (p): p is { x: number; y: number } => !!p,
      ),
      ...folders.map((f) => ({ x: f.position_x, y: f.position_y })),
      ...resumes
        .filter((r) => r.folder_id === null)
        .map((r) => ({ x: r.position_x, y: r.position_y })),
    ];
  }

  function occupiedFolderPositions(
    folderId: string,
  ): { x: number; y: number }[] {
    return resumes
      .filter((r) => r.folder_id === folderId)
      .map((r) => ({ x: r.position_x, y: r.position_y }));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const visibleFolders = currentFolderId === null ? folders : [];
  const visibleResumes = useMemo(
    () => resumes.filter((r) => (r.folder_id ?? null) === currentFolderId),
    [resumes, currentFolderId],
  );
  const nonEmptyFolderIds = useMemo(
    () =>
      new Set(
        resumes
          .map((resume) => resume.folder_id)
          .filter((id): id is string => id !== null),
      ),
    [resumes],
  );
  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;

  // Drag-end writes immediately because navigation can follow the drop.
  function patchResume(
    id: string,
    values: Record<string, unknown>,
    previous: ResumeRow,
  ) {
    if (demo) return;
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
        setResumes((cur) =>
          cur.map((resume) => (resume.id === id ? previous : resume)),
        );
        showError("Resume changes could not be saved.");
      });
  }

  function patchFolder(
    id: string,
    values: Record<string, unknown>,
    previous: ResumeFolderRow,
  ) {
    if (demo) return;
    const version = (folderPatchVersions.current.get(id) ?? 0) + 1;
    folderPatchVersions.current.set(id, version);
    void fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("folder update failed");
        const body = (await res.json()) as {
          folder?: Partial<ResumeFolderRow>;
        };
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
        setFolders((cur) =>
          cur.map((folder) => (folder.id === id ? previous : folder)),
        );
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
        const pos = nextFreePlacement(occupiedFolderPositions(folderId));
        setResumes((cur) =>
          cur.map((r) =>
            r.id === resumeId
              ? {
                  ...r,
                  folder_id: folderId,
                  position_x: pos.x,
                  position_y: pos.y,
                }
              : r,
          ),
        );
        patchResume(
          resumeId,
          { folderId, positionX: pos.x, positionY: pos.y },
          resume,
        );
        return;
      }
      if (overId === DESKTOP_BACK_DROP_ID) {
        const pos = nextFreePlacement(occupiedRootPositions());
        setResumes((cur) =>
          cur.map((r) =>
            r.id === resumeId
              ? { ...r, folder_id: null, position_x: pos.x, position_y: pos.y }
              : r,
          ),
        );
        patchResume(
          resumeId,
          { folderId: null, positionX: pos.x, positionY: pos.y },
          resume,
        );
        return;
      }
      // Postgres integer columns require rounded subpixel drag deltas.
      const nextX = Math.round(resume.position_x + delta.x);
      const nextY = Math.round(resume.position_y + delta.y);
      setResumes((cur) =>
        cur.map((r) =>
          r.id === resumeId
            ? { ...r, position_x: nextX, position_y: nextY }
            : r,
        ),
      );
      patchResume(resumeId, { positionX: nextX, positionY: nextY }, resume);
      return;
    }

    if (activeId.startsWith(FOLDER_DRAG_PREFIX)) {
      const folderId = activeId.slice(FOLDER_DRAG_PREFIX.length);
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;
      const nextX = Math.round(folder.position_x + delta.x);
      const nextY = Math.round(folder.position_y + delta.y);
      setFolders((cur) =>
        cur.map((f) =>
          f.id === folderId
            ? { ...f, position_x: nextX, position_y: nextY }
            : f,
        ),
      );
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
    if (demo) {
      requireSignIn();
      return;
    }
    const pos = nextFreePlacement(occupiedRootPositions());
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
    if (demo) {
      requireSignIn();
      return;
    }
    const trimmed = name.trim();
    setRenamingFolderId(null);
    if (!trimmed) return;
    const previous = folders.find((folder) => folder.id === id);
    if (!previous || trimmed === previous.name) return;
    setFolders((cur) =>
      cur.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
    );
    patchFolder(id, { name: trimmed }, previous);
  }

  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "folder" | "resume" | "bank";
    id: string;
  } | null>(null);

  function confirmDeleteSelected() {
    if (!selected || selected.kind === "page") return;
    if (demo) {
      requireSignIn();
      return;
    }
    setDeleteTarget({ kind: selected.kind, id: selected.id });
  }

  const DELETE_ENDPOINT: Record<"folder" | "resume" | "bank", string> = {
    folder: "folders",
    resume: "resumes",
    bank: "source-resumes",
  };

  // ON DELETE SET NULL requires folder resumes to return to local desktop state.
  async function performDelete() {
    if (!deleteTarget) return;
    const { kind, id } = deleteTarget;
    setDeleteTarget(null);
    setSelected((cur) => (cur?.kind === kind && cur.id === id ? null : cur));
    try {
      const res = await fetch(`/api/${DELETE_ENDPOINT[kind]}/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) throw new Error("delete failed");
      if (kind === "folder") {
        setFolders((cur) => cur.filter((f) => f.id !== id));
        setResumes((cur) =>
          cur.map((r) => (r.folder_id === id ? { ...r, folder_id: null } : r)),
        );
      } else if (kind === "resume") {
        setResumes((cur) => cur.filter((r) => r.id !== id));
      } else {
        setBankFiles((cur) => cur.filter((f) => f.id !== id));
      }
    } catch {
      showError(
        kind === "folder"
          ? "Folder could not be deleted."
          : kind === "resume"
            ? "Resume could not be deleted."
            : "Upload could not be deleted.",
      );
    }
  }

  const deleteTargetLabel =
    deleteTarget?.kind === "folder"
      ? folders.find((f) => f.id === deleteTarget.id)?.name
      : deleteTarget?.kind === "resume"
        ? resumes.find((r) => r.id === deleteTarget.id)?.title
        : deleteTarget?.kind === "bank"
          ? bankFiles?.find((f) => f.id === deleteTarget.id)?.display_name
          : undefined;

  async function createResume() {
    if (demo) {
      requireSignIn();
      return;
    }
    if (!templateShellAvailable) {
      const params = new URLSearchParams();
      if (currentFolderId) params.set("folderId", currentFolderId);
      const query = params.toString();
      router.push(`/resume/new${query ? `?${query}` : ""}`);
      return;
    }
    const pos = nextFreePlacement(
      currentFolderId === null
        ? occupiedRootPositions()
        : occupiedFolderPositions(currentFolderId),
    );
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
      <AppHeader demo={demo} onSignInClick={requireSignIn} />
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        {openPage ? (
          <>
            <button
              onClick={() => setOpenPageId(null)}
              className={backToDesktopButtonClass}
            >
              ← Desktop
            </button>
            {openPage.kind === "bank" && (
              <ToolbarButton
                icon={Trash2}
                label="Delete"
                tone="danger"
                onClick={confirmDeleteSelected}
                disabled={!selected || selected.kind !== "bank"}
              />
            )}
          </>
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
              <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
                Create
              </span>
              {!currentFolder && (
                <ToolbarButton
                  icon={FolderPlus}
                  label="New folder"
                  onClick={createFolder}
                />
              )}
              <ToolbarButton
                icon={Plus}
                label="New resume"
                onClick={createResume}
              />
              <ToolbarButton
                icon={Trash2}
                label="Delete"
                tone="danger"
                onClick={confirmDeleteSelected}
                disabled={!selected || selected.kind === "page"}
              />
            </div>
            <div className="h-6 w-px bg-line" />
            <ToolbarButton
              icon={Upload}
              label="Upload"
              onClick={() => {
                if (demo) {
                  requireSignIn();
                  return;
                }
                setEditingSourceResume(null);
                setImportModalOpen(true);
              }}
            />
          </>
        )}
        {error && (
          <span className="px-2 text-[11.5px] text-danger">{error}</span>
        )}
      </div>

      {!demo && (
        <ImportReviewModal
          open={importModalOpen}
          onOpenChange={(next) => {
            setImportModalOpen(next);
            if (!next) setEditingSourceResume(null);
          }}
          editSourceResume={editingSourceResume}
          onImported={() => {
            refreshBankFiles();
          }}
        />
      )}

      <DndContext
        id="desktop-dnd"
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          <div
            // Ignore bubbled icon clicks when clearing the selection.
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
                {bankFiles.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[12.5px] text-faint">
                    Nothing uploaded yet.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {bankFiles.map((file) => (
                      <BankFileIcon
                        key={file.id}
                        title={file.display_name ?? file.id.slice(0, 6)}
                        selected={
                          selected?.kind === "bank" && selected.id === file.id
                        }
                        onSelect={() =>
                          setSelected({ kind: "bank", id: file.id })
                        }
                        onOpen={() => {
                          if (demo) {
                            requireSignIn();
                            return;
                          }
                          setSelected(null);
                          setEditingSourceResume({
                            id: file.id,
                            displayName:
                              file.display_name ?? file.id.slice(0, 6),
                          });
                          setImportModalOpen(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : openPage ? (
              <div className="absolute inset-0 overflow-auto p-8">
                {openPage.id === "about" ? (
                  <AboutContent />
                ) : openPage.content ? (
                  <div className="whitespace-pre-wrap text-[13px] text-ink">
                    {openPage.content}
                  </div>
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
                    hasContents={nonEmptyFolderIds.has(folder.id)}
                    renaming={renamingFolderId === folder.id}
                    selected={
                      selected?.kind === "folder" && selected.id === folder.id
                    }
                    onSelect={() =>
                      setSelected({ kind: "folder", id: folder.id })
                    }
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
                    selected={
                      selected?.kind === "resume" && selected.id === resume.id
                    }
                    onSelect={() =>
                      setSelected({ kind: "resume", id: resume.id })
                    }
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
                      hasContents={
                        page.kind === "bank"
                          ? (bankFiles?.length ?? 0) > 0
                          : undefined
                      }
                      selected={
                        selected?.kind === "page" && selected.id === page.id
                      }
                      onSelect={() =>
                        setSelected({ kind: "page", id: page.id })
                      }
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{" "}
              {deleteTarget?.kind === "folder"
                ? "folder"
                : deleteTarget?.kind === "bank"
                  ? "upload"
                  : "resume"}
              &ldquo;{deleteTargetLabel ?? "this item"}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "folder"
                ? "Its contents will move back to the desktop."
                : deleteTarget?.kind === "bank"
                  ? "Deletes every entry pulled from this resume too."
                  : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={performDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {demo && <SignInModal open={signInOpen} onOpenChange={setSignInOpen} />}
    </div>
  );
}
