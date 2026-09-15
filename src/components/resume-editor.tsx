"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Pencil } from "lucide-react";
import { BackToDesktopLink } from "@/components/back-to-desktop";
import { BankPane, BankEntryCardVisual } from "@/components/bank/bank-pane";
import { SignInModal } from "@/components/sign-in-modal";
import { OutlinePane } from "@/components/outline/outline-pane";
import { PreviewPane } from "@/components/preview/preview-pane";
import {
  BANK_DRAG_PREFIX,
  NEW_SECTION_DROP_ID,
  SECTION_APPEND_PREFIX,
} from "@/components/dnd-ids";
import type { BankEntryRow } from "@/lib/rows";
import { clearHoverCursor, setHoverCursor } from "@/lib/hover-cursor";
import { createAutosaveQueue } from "@/lib/autosave-queue";
import {
  addCompositionEntry,
  moveCompositionEntry,
  reorderCompositionEntry,
  type EditorSection,
} from "@/lib/editor-composition";
import type {
  ResumeMetaRow,
  ResumeSectionRow,
} from "@/lib/resume-composition-query";
import {
  loadDemoComposition,
  saveDemoComposition,
} from "@/lib/demo-composition-store";

function ResumeTitle({
  resume,
  renaming,
  onStartRename,
  onCommitRename,
}: {
  resume: ResumeMetaRow;
  renaming: boolean;
  onStartRename: () => void;
  onCommitRename: (title: string) => void;
}) {
  const [draft, setDraft] = useState(resume.title);
  const cancelRenameRef = useRef(false);

  if (renaming) {
    return (
      <input
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelRenameRef.current) {
            cancelRenameRef.current = false;
            onCommitRename(resume.title);
            return;
          }
          onCommitRename(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelRenameRef.current = true;
            setDraft(resume.title);
            e.currentTarget.blur();
          }
        }}
        className="border-b border-brand bg-transparent px-1 py-1 text-[13px] font-semibold text-brand outline-none"
      />
    );
  }

  return (
    <button
      onClick={onStartRename}
      title="Rename resume"
      className="group flex items-center gap-1.5 rounded-md px-1 py-1 text-[13px] font-semibold hover:text-brand"
    >
      {resume.title}
      <Pencil className="size-3 opacity-40 group-hover:opacity-100" />
    </button>
  );
}

function SplitDivider({
  label,
  active,
  hovered,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onHoverChange,
}: {
  label: string;
  active: boolean;
  hovered: boolean;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={() => {
        onHoverChange(true);
        setHoverCursor("col-resize");
      }}
      onPointerLeave={() => {
        onHoverChange(false);
        clearHoverCursor("col-resize");
      }}
      style={{
        cursor: active ? "col-resize" : hovered ? "col-resize" : undefined,
      }}
      className="group relative w-2 shrink-0 cursor-auto touch-none"
    >
      <div
        className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors ${
          active ? "bg-brand" : "group-hover:bg-brand"
        }`}
      />
    </div>
  );
}

function toEditorSections(sections: ResumeSectionRow[]): EditorSection[] {
  return sections
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      title: s.title,
      entries: s.entries
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((e) => e.bankEntryId),
    }));
}

export function ResumeEditor({
  initialEntries,
  initialResume,
  initialSections,
  initialPdfUrl = null,
  initialPdfDownloadUrl = null,
  initialRenaming = false,
  demo = false,
}: {
  initialEntries: BankEntryRow[];
  initialResume: ResumeMetaRow;
  initialSections: ResumeSectionRow[];
  initialPdfUrl?: string | null;
  initialPdfDownloadUrl?: string | null;
  initialRenaming?: boolean;
  demo?: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [resume, setResume] = useState(initialResume);
  const [sections, setSections] = useState<EditorSection[]>(
    toEditorSections(initialSections),
  );
  const [addError, setAddError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState(initialPdfDownloadUrl);
  const [compiling, setCompiling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const compileRunRef = useRef(0);
  const compilingRef = useRef(false);
  const exportRunRef = useRef(0);
  const exportingRef = useRef(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const requireSignIn = () => setSignInOpen(true);
  const [renaming, setRenaming] = useState(initialRenaming);
  const addErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!demo) return;
    const stored = loadDemoComposition(initialEntries);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setSections(stored);
  }, [demo, initialEntries]);

  useEffect(
    () => () => {
      clearHoverCursor();
      if (addErrorTimerRef.current) clearTimeout(addErrorTimerRef.current);
    },
    [],
  );

  function showAddError(message: string) {
    setAddError(message);
    if (addErrorTimerRef.current) clearTimeout(addErrorTimerRef.current);
    addErrorTimerRef.current = setTimeout(() => setAddError(null), 3500);
  }

  const entryById = useMemo(
    () => new Map(entries.map((e) => [e.id, e])),
    [entries],
  );
  const usedEntryIds = useMemo(
    () => new Set(sections.flatMap((s) => s.entries)),
    [sections],
  );

  const [saveQueue] = useState(() =>
    createAutosaveQueue(
      async (snapshot) => {
        const res = await fetch(`/api/resumes/${resume.id}/composition`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections: snapshot }),
          keepalive: true,
        });
        if (!res.ok) throw new Error("composition save failed");
      },
      (failed) => setSaveError(failed ? "Changes could not be saved." : null),
    ),
  );

  // Reloading discards queued or failed composition saves.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!saveQueue.hasUnsavedWork()) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveQueue]);

  function queueCompositionSave(next: EditorSection[]) {
    if (demo) {
      saveDemoComposition(next);
      return;
    }
    saveQueue.enqueue(
      next.map((section) => ({
        ...section,
        entries: [...section.entries],
      })),
    );
  }

  function updateSections(next: EditorSection[]) {
    setSections(next);
    queueCompositionSave(next);
  }

  async function renameResume(title: string) {
    if (demo) {
      requireSignIn();
      return;
    }
    const trimmed = title.trim();
    if (!trimmed || trimmed === resume.title) return;
    const previousTitle = resume.title;
    setResume((cur) => ({ ...cur, title: trimmed }));
    try {
      const res = await fetch(`/api/resumes/${resume.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error("resume rename failed");
      const body = (await res.json()) as { resume?: { title?: string } };
      if (body.resume?.title) {
        setResume((cur) => ({ ...cur, title: body.resume!.title! }));
      }
    } catch {
      setResume((cur) => ({ ...cur, title: previousTitle }));
      showAddError("Resume name could not be saved.");
    }
  }

  async function compileResume() {
    if (demo) {
      requireSignIn();
      return;
    }
    if (compilingRef.current) return;
    compilingRef.current = true;
    const run = ++compileRunRef.current;
    setCompiling(true);
    if (!(await saveQueue.flush())) {
      if (compileRunRef.current === run) {
        compilingRef.current = false;
        setCompiling(false);
      }
      return;
    }
    setResume((cur) => ({
      ...cur,
      compile_status: "compiling",
      compile_error: null,
    }));
    try {
      const res = await fetch(`/api/resumes/${resume.id}/compile`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        compileStatus?: string;
        compileError?: string;
        pageCount?: number | null;
        pdfUrl?: string | null;
        pdfDownloadUrl?: string | null;
        error?: string;
      };
      if (compileRunRef.current !== run) return;
      if (!res.ok) {
        setResume((cur) => ({
          ...cur,
          compile_status: "failed",
          compile_error: body.compileError ?? body.error ?? "Compile failed.",
        }));
        return;
      }
      setResume((cur) => ({
        ...cur,
        compile_status: body.compileStatus ?? "failed",
        compile_error: body.compileError ?? null,
        page_count: body.pageCount ?? null,
      }));
      setPdfUrl(body.pdfUrl ?? null);
      setPdfDownloadUrl(body.pdfDownloadUrl ?? null);
    } catch {
      if (compileRunRef.current !== run) return;
      setResume((cur) => ({
        ...cur,
        compile_status: "failed",
        compile_error: "Compile request failed.",
      }));
    } finally {
      if (compileRunRef.current === run) {
        compilingRef.current = false;
        setCompiling(false);
      }
    }
  }

  async function exportResume() {
    if (demo) {
      requireSignIn();
      return;
    }
    if (exportingRef.current) return;
    exportingRef.current = true;
    const run = ++exportRunRef.current;
    setExporting(true);
    if (!(await saveQueue.flush())) {
      if (exportRunRef.current === run) {
        exportingRef.current = false;
        setExporting(false);
      }
      return;
    }
    try {
      const res = await fetch(`/api/resumes/${resume.id}/export`);
      const body = (await res.json().catch(() => ({}))) as {
        zipDownloadUrl?: string;
        error?: string;
      };
      if (exportRunRef.current !== run) return;
      if (!res.ok || !body.zipDownloadUrl) {
        showAddError(body.error ?? "Export failed.");
        return;
      }
      window.location.href = body.zipDownloadUrl;
    } catch {
      if (exportRunRef.current !== run) return;
      showAddError("Export request failed.");
    } finally {
      if (exportRunRef.current === run) {
        exportingRef.current = false;
        setExporting(false);
      }
    }
  }

  function placeEntry(
    entry: BankEntryRow,
    targetSectionTitle: string,
    insertBeforeId?: string,
  ) {
    const change = addCompositionEntry(
      sections,
      entry,
      entryById,
      targetSectionTitle,
      insertBeforeId,
    );
    if (change.error === "exclusive_entry") {
      showAddError(
        `"${targetSectionTitle}" already holds a section that must stay by itself.`,
      );
      return;
    }
    if (change.changed) updateSections(change.sections);
  }

  function findSectionIndexByEntryId(entryId: string) {
    return sections.findIndex((s) => s.entries.includes(entryId));
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart(e: DragStartEvent) {
    clearHoverCursor();
    setActiveId(String(e.active.id));
  }

  function handleDragCancel() {
    clearHoverCursor();
    setActiveId(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    if (activeIdStr.startsWith(BANK_DRAG_PREFIX)) {
      const entry = entryById.get(activeIdStr.slice(BANK_DRAG_PREFIX.length));
      if (!entry) return;
      // Only explicit drop targets may change the composition.
      if (overIdStr.startsWith(SECTION_APPEND_PREFIX)) {
        placeEntry(entry, overIdStr.slice(SECTION_APPEND_PREFIX.length));
      } else if (overIdStr === NEW_SECTION_DROP_ID) {
        placeEntry(entry, entry.source_section);
      } else {
        const sectionIndex = findSectionIndexByEntryId(overIdStr);
        if (sectionIndex === -1) return;
        placeEntry(entry, sections[sectionIndex].title, overIdStr);
      }
      return;
    }

    if (activeIdStr === overIdStr) return;

    const fromSectionIndex = findSectionIndexByEntryId(activeIdStr);
    if (fromSectionIndex === -1) return;
    let toSectionIndex = findSectionIndexByEntryId(overIdStr);
    if (toSectionIndex === -1 && overIdStr.startsWith(SECTION_APPEND_PREFIX)) {
      toSectionIndex = sections.findIndex(
        (section) =>
          section.title === overIdStr.slice(SECTION_APPEND_PREFIX.length),
      );
    }
    if (toSectionIndex === -1) return;

    if (fromSectionIndex !== toSectionIndex) {
      const targetSection = sections[toSectionIndex];
      const change = moveCompositionEntry(
        sections,
        activeIdStr,
        targetSection.title,
        entryById,
        overIdStr,
      );
      if (change.error === "source_mismatch") {
        showAddError("Entries can only be placed in their source section.");
        return;
      }
      if (change.changed) updateSections(change.sections);
      return;
    }

    const change = reorderCompositionEntry(sections, activeIdStr, overIdStr);
    if (change.changed) updateSections(change.sections);
  }

  const activeBankEntry = activeId?.startsWith(BANK_DRAG_PREFIX)
    ? entryById.get(activeId.slice(BANK_DRAG_PREFIX.length))
    : undefined;
  const activeOutlineEntry =
    activeId && !activeId.startsWith(BANK_DRAG_PREFIX)
      ? entryById.get(activeId)
      : undefined;

  // Percentage bounds keep every pane usable at any viewport width.
  const [bankWidthPct, setBankWidthPct] = useState(38);
  const [previewWidthPct, setPreviewWidthPct] = useState(30);
  const [resizingSplit, setResizingSplit] = useState<
    "bank" | "preview" | false
  >(false);
  const [splitHovered, setSplitHovered] = useState<"bank" | "preview" | false>(
    false,
  );
  const splitRowRef = useRef<HTMLDivElement>(null);
  const splitDraftRef = useRef({
    bank: bankWidthPct,
    preview: previewWidthPct,
  });

  function clampSplit(pct: number) {
    return Math.min(50, Math.max(15, pct));
  }
  function onSplitPointerDown(which: "bank" | "preview") {
    return (e: PointerEvent<HTMLDivElement>) => {
      setResizingSplit(which);
      e.currentTarget.setPointerCapture(e.pointerId);
    };
  }
  function onSplitPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!resizingSplit || !splitRowRef.current) return;
    const rect = splitRowRef.current.getBoundingClientRect();
    if (resizingSplit === "bank") {
      const width = clampSplit(((e.clientX - rect.left) / rect.width) * 100);
      splitDraftRef.current.bank = width;
      splitRowRef.current.style.setProperty("--bank-width", `${width}%`);
    } else {
      const width = clampSplit(((rect.right - e.clientX) / rect.width) * 100);
      splitDraftRef.current.preview = width;
      splitRowRef.current.style.setProperty("--preview-width", `${width}%`);
    }
  }
  function onSplitPointerUp(e: PointerEvent<HTMLDivElement>) {
    setBankWidthPct(splitDraftRef.current.bank);
    setPreviewWidthPct(splitDraftRef.current.preview);
    setResizingSplit(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 pt-4 pb-1">
        <BackToDesktopLink />
        <ResumeTitle
          key={renaming ? "editing" : "viewing"}
          resume={resume}
          renaming={renaming}
          onStartRename={() => {
            if (demo) {
              requireSignIn();
              return;
            }
            setRenaming(true);
          }}
          onCommitRename={(title) => {
            setRenaming(false);
            void renameResume(title);
          }}
        />
        {addError && (
          <span className="px-2 text-[11.5px] text-danger">{addError}</span>
        )}
        {saveError && (
          <span className="flex items-center gap-2 px-2 text-[11.5px] text-danger">
            {saveError}
            <button
              onClick={() => void saveQueue.retry()}
              className="font-mono text-[10px] uppercase tracking-wide underline"
            >
              Retry
            </button>
          </span>
        )}
      </div>

      <DndContext
        id="resume-editor-dnd"
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={splitRowRef}
          className={`flex min-h-0 flex-1 ${resizingSplit ? "cursor-col-resize select-none" : ""}`}
          style={
            {
              "--bank-width": `${bankWidthPct}%`,
              "--preview-width": `${previewWidthPct}%`,
            } as CSSProperties
          }
        >
          <div
            className="min-h-0 min-w-[15%]"
            style={{ width: "var(--bank-width)" }}
          >
            <BankPane
              entries={entries}
              usedEntryIds={usedEntryIds}
              demo={demo}
              onRequireSignIn={requireSignIn}
              onEntriesImported={(importedEntries) =>
                setEntries((cur) => [...importedEntries, ...cur])
              }
              onEntryPatched={(id, values) =>
                setEntries((cur) =>
                  cur.map((e) =>
                    e.id === id
                      ? {
                          ...e,
                          ...(values.displayName !== undefined
                            ? { display_name: values.displayName }
                            : {}),
                          ...(values.tags !== undefined
                            ? { tags: values.tags }
                            : {}),
                          ...(values.rawLatex !== undefined
                            ? { raw_latex: values.rawLatex }
                            : {}),
                        }
                      : e,
                  ),
                )
              }
            />
          </div>
          <SplitDivider
            label="Resize bank and outline panes"
            active={resizingSplit === "bank"}
            hovered={splitHovered === "bank"}
            onPointerDown={onSplitPointerDown("bank")}
            onPointerMove={onSplitPointerMove}
            onPointerUp={onSplitPointerUp}
            onHoverChange={(hovered) =>
              setSplitHovered(hovered ? "bank" : false)
            }
          />
          <div className="min-h-0 min-w-[15%] flex-1">
            <OutlinePane
              sections={sections}
              entryById={entryById}
              onChange={updateSections}
              draggedEntry={activeBankEntry}
            />
          </div>
          <SplitDivider
            label="Resize outline and preview panes"
            active={resizingSplit === "preview"}
            hovered={splitHovered === "preview"}
            onPointerDown={onSplitPointerDown("preview")}
            onPointerMove={onSplitPointerMove}
            onPointerUp={onSplitPointerUp}
            onHoverChange={(hovered) =>
              setSplitHovered(hovered ? "preview" : false)
            }
          />
          <div
            className="min-h-0 min-w-[15%]"
            style={{ width: "var(--preview-width)" }}
          >
            <PreviewPane
              compileStatus={resume.compile_status}
              compileError={resume.compile_error}
              pageCount={resume.page_count}
              pdfUrl={pdfUrl}
              pdfDownloadUrl={pdfDownloadUrl}
              compiling={compiling}
              onCompile={() => void compileResume()}
              exporting={exporting}
              onExport={() => void exportResume()}
            />
          </div>
        </div>
        <DragOverlay>
          {activeBankEntry ? (
            <BankEntryCardVisual entry={activeBankEntry} />
          ) : activeOutlineEntry ? (
            <div className="rounded-md border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] font-semibold shadow-[3px_5px_10px_-2px_rgba(18,24,28,0.28)]">
              {activeOutlineEntry.display_name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {demo && <SignInModal open={signInOpen} onOpenChange={setSignInOpen} />}
    </div>
  );
}
