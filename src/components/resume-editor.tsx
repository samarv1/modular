"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
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
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Pencil } from "lucide-react";
import { BackToDesktopLink } from "@/components/back-to-desktop";
import { BankPane, BankEntryCardVisual } from "@/components/bank/bank-pane";
import { OutlinePane, type EditorSection } from "@/components/outline/outline-pane";
import { PreviewPane } from "@/components/preview/preview-pane";
import { BANK_DRAG_PREFIX, NEW_SECTION_DROP_ID, SECTION_APPEND_PREFIX } from "@/components/dnd-ids";
import type { BankEntryRow } from "@/lib/rows";
import { clearHoverCursor, setHoverCursor } from "@/lib/hover-cursor";
import type { ResumeMetaRow, ResumeSectionRow } from "@/lib/resume-composition-query";

// Single current-resume title, click-to-rename. Switching between resumes
// happens on the home page (src/app/page.tsx) — this editor only ever works
// on the one resume its route (/resume/[id]) was opened for, so there's no
// tab strip to manage here.
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
        // Remounts fresh each time rename mode opens (see the `key` at the
        // call site) — autoFocus/select-on-focus fire naturally on mount
        // instead of needing an effect to sync draft to the latest title.
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

// Adjustable divider — wider invisible hit area than the visible line
// itself, so it's easy to grab without needing pixel precision. Shared by
// both dividers in the three-pane split below.
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
      style={{ cursor: active ? "col-resize" : hovered ? "col-resize" : undefined }}
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
      entries: s.entries.slice().sort((a, b) => a.position - b.position).map((e) => e.bankEntryId),
    }));
}

export function ResumeEditor({
  initialEntries,
  initialResume,
  initialSections,
  initialPdfUrl = null,
  initialPdfDownloadUrl = null,
  initialRenaming = false,
}: {
  initialEntries: BankEntryRow[];
  initialResume: ResumeMetaRow;
  initialSections: ResumeSectionRow[];
  initialPdfUrl?: string | null;
  initialPdfDownloadUrl?: string | null;
  initialRenaming?: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  // Always the resume this route (/resume/[id]) was opened for — switching
  // resumes happens by navigating, on the home page, not by swapping state
  // here.
  const [resume, setResume] = useState(initialResume);
  const [sections, setSections] = useState<EditorSection[]>(toEditorSections(initialSections));
  const [addError, setAddError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState(initialPdfDownloadUrl);
  const [compiling, setCompiling] = useState(false);
  const [exporting, setExporting] = useState(false);
  // A freshly-created resume (via the home page's "New resume", which
  // navigates here with ?new=1) opens straight into rename mode rather than
  // just appearing with the default "Untitled resume" title — that's the
  // signal that you're now working on something new, and gets it named in
  // the same motion instead of leaving the default title to edit later.
  const [renaming, setRenaming] = useState(initialRenaming);
  const addErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const usedEntryIds = useMemo(() => new Set(sections.flatMap((s) => s.entries)), [sections]);

  // Composition writes are serialized and coalesced: while one request is in
  // flight, only the newest pending snapshot is retained. This prevents an
  // older request from finishing after a newer one and overwriting it.
  const saveQueueRef = useRef<{
    running: boolean;
    pending: EditorSection[] | null;
  }>({ running: false, pending: null });

  // Nothing persists a failed or not-yet-sent composition save across a
  // reload — only the manual Retry button recovers it. Warn before the
  // browser throws that state away instead of losing it silently.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      const hasUnsavedChanges = saveError !== null || saveQueueRef.current.pending !== null;
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveError]);

  async function drainCompositionSaves() {
    const queue = saveQueueRef.current;
    if (queue.running) return;
    queue.running = true;

    while (queue.pending) {
      const snapshot = queue.pending;
      queue.pending = null;
      try {
        const res = await fetch(`/api/resumes/${resume.id}/composition`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections: snapshot }),
          keepalive: true,
        });
        if (!res.ok) throw new Error("composition save failed");
        setSaveError(null);
      } catch {
        setSaveError("Changes could not be saved.");
        if (!queue.pending) {
          break;
        }
      }
    }

    queue.running = false;
    if (queue.pending) void drainCompositionSaves();
  }

  function queueCompositionSave(next: EditorSection[]) {
    const queue = saveQueueRef.current;
    queue.pending = next.map((section) => ({
      ...section,
      entries: [...section.entries],
    }));
    void drainCompositionSaves();
  }

  function updateSections(next: EditorSection[]) {
    setSections(next);
    queueCompositionSave(next);
  }

  async function renameResume(title: string) {
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

  // Compile is synchronous on the server (it awaits the whole Sandbox round
  // trip), so this just awaits one fetch — no polling loop needed, the
  // response already carries the final status.
  async function compileResume() {
    setCompiling(true);
    setResume((cur) => ({ ...cur, compile_status: "compiling", compile_error: null }));
    try {
      const res = await fetch(`/api/resumes/${resume.id}/compile`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        compileStatus?: string;
        compileError?: string;
        pageCount?: number | null;
        pdfUrl?: string | null;
        pdfDownloadUrl?: string | null;
        error?: string;
      };
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
      setResume((cur) => ({ ...cur, compile_status: "failed", compile_error: "Compile request failed." }));
    } finally {
      setCompiling(false);
    }
  }

  async function exportResume() {
    setExporting(true);
    try {
      const res = await fetch(`/api/resumes/${resume.id}/export`);
      const body = (await res.json().catch(() => ({}))) as {
        zipDownloadUrl?: string;
        error?: string;
      };
      if (!res.ok || !body.zipDownloadUrl) {
        showAddError(body.error ?? "Export failed.");
        return;
      }
      window.location.href = body.zipDownloadUrl;
    } catch {
      showAddError("Export request failed.");
    } finally {
      setExporting(false);
    }
  }

  // Place `entry` into the section titled `targetSectionTitle` (created if it
  // doesn't exist yet), inserted just before `insertBeforeId` or appended at
  // the end.
  function placeEntry(entry: BankEntryRow, targetSectionTitle: string, insertBeforeId?: string) {
    if (usedEntryIds.has(entry.id)) return;

    const targetIndex = sections.findIndex((s) => s.title === targetSectionTitle);
    const target = targetIndex === -1 ? null : sections[targetIndex];

    // A section's title is its identity (see OutlinePane) — an entry can
    // only land in a section whose title actually matches where it came
    // from, so an Education entry can't be dropped into an Experience
    // section just because that's where the pointer happened to be. Fails
    // silently (card just snaps back) rather than surfacing an error banner.
    if (target && target.title.trim().toLowerCase() !== entry.source_section.trim().toLowerCase()) {
      return;
    }

    const targetHasChunk = target?.entries.some((id) => {
      const kind = entryById.get(id)?.kind;
      return kind === "section_chunk" || kind === "header_chunk";
    });

    if (target && (targetHasChunk || entry.kind === "section_chunk" || entry.kind === "header_chunk")) {
      showAddError(`"${targetSectionTitle}" already holds a section that must stay by itself.`);
      return;
    }

    if (target) {
      const nextEntries = [...target.entries];
      const insertAt = insertBeforeId ? nextEntries.indexOf(insertBeforeId) : -1;
      if (insertAt === -1) nextEntries.push(entry.id);
      else nextEntries.splice(insertAt, 0, entry.id);
      updateSections(
        sections.map((s, i) => (i === targetIndex ? { ...s, entries: nextEntries } : s)),
      );
    } else {
      updateSections([...sections, { title: targetSectionTitle, entries: [entry.id] }]);
    }
  }

  function findSectionIndexByEntryId(entryId: string) {
    return sections.findIndex((s) => s.entries.includes(entryId));
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
      // Placement only happens on an explicit target — a section's "+" box,
      // an existing entry (insert before it), or the general "+" box — not
      // from letting go anywhere in the pane.
      if (overIdStr.startsWith(SECTION_APPEND_PREFIX)) {
        placeEntry(entry, overIdStr.slice(SECTION_APPEND_PREFIX.length));
      } else if (overIdStr === NEW_SECTION_DROP_ID) {
        placeEntry(entry, entry.source_section);
      } else {
        const sectionIndex = findSectionIndexByEntryId(overIdStr);
        if (sectionIndex === -1) return; // not dropped on a recognized target — no-op, card snaps back
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
        (section) => section.title === overIdStr.slice(SECTION_APPEND_PREFIX.length),
      );
    }
    if (toSectionIndex === -1) return;

    if (fromSectionIndex !== toSectionIndex) {
      const draggedEntry = entryById.get(activeIdStr);
      const targetSection = sections[toSectionIndex];
      if (
        !draggedEntry ||
        draggedEntry.source_section.trim().toLowerCase() !==
          targetSection.title.trim().toLowerCase()
      ) {
        showAddError("Entries can only be placed in their source section.");
        return;
      }
      const targetHasChunk = targetSection.entries.some((id) => {
        const kind = entryById.get(id)?.kind;
        return kind === "section_chunk" || kind === "header_chunk";
      });
      if (targetHasChunk || draggedEntry.kind === "section_chunk" || draggedEntry.kind === "header_chunk")
        return;

      const next = sections.map((section) => ({
        ...section,
        entries: [...section.entries],
      }));
      next[fromSectionIndex].entries = next[fromSectionIndex].entries.filter(
        (id) => id !== activeIdStr,
      );
      const insertAt = next[toSectionIndex].entries.indexOf(overIdStr);
      if (insertAt === -1) next[toSectionIndex].entries.push(activeIdStr);
      else next[toSectionIndex].entries.splice(insertAt, 0, activeIdStr);
      updateSections(next.filter((section) => section.entries.length > 0));
      return;
    }

    const section = sections[fromSectionIndex];
    const from = section.entries.indexOf(activeIdStr);
    const to = section.entries.indexOf(overIdStr);
    if (from === -1 || to === -1 || from === to) return;
    updateSections(
      sections.map((s, i) =>
        i === fromSectionIndex ? { ...s, entries: arrayMove(s.entries, from, to) } : s,
      ),
    );
  }

  const activeBankEntry = activeId?.startsWith(BANK_DRAG_PREFIX)
    ? entryById.get(activeId.slice(BANK_DRAG_PREFIX.length))
    : undefined;
  const activeOutlineEntry =
    activeId && !activeId.startsWith(BANK_DRAG_PREFIX) ? entryById.get(activeId) : undefined;

  // Adjustable bank/outline/preview split, two independent dividers. Clamped
  // so no pane can be dragged down to unusable — bounds are in percent of
  // the split row's own width, not the viewport, so they hold up regardless
  // of window size.
  const [bankWidthPct, setBankWidthPct] = useState(38);
  const [previewWidthPct, setPreviewWidthPct] = useState(30);
  const [resizingSplit, setResizingSplit] = useState<"bank" | "preview" | false>(false);
  const [splitHovered, setSplitHovered] = useState<"bank" | "preview" | false>(false);
  const splitRowRef = useRef<HTMLDivElement>(null);

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
      setBankWidthPct(clampSplit(((e.clientX - rect.left) / rect.width) * 100));
    } else {
      setPreviewWidthPct(clampSplit(((rect.right - e.clientX) / rect.width) * 100));
    }
  }
  function onSplitPointerUp(e: PointerEvent<HTMLDivElement>) {
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
          onStartRename={() => setRenaming(true)}
          onCommitRename={(title) => {
            setRenaming(false);
            void renameResume(title);
          }}
        />
        {addError && <span className="px-2 text-[11.5px] text-danger">{addError}</span>}
        {saveError && (
          <span className="flex items-center gap-2 px-2 text-[11.5px] text-danger">
            {saveError}
            <button
              onClick={() => queueCompositionSave(sections)}
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
        <div ref={splitRowRef} className={`flex min-h-0 flex-1 ${resizingSplit ? "cursor-col-resize select-none" : ""}`}>
          <div className="min-h-0 min-w-[15%]" style={{ width: `${bankWidthPct}%` }}>
            <BankPane
              entries={entries}
              usedEntryIds={usedEntryIds}
              onEntriesImported={(importedEntries) =>
                setEntries((cur) => [...importedEntries, ...cur])
              }
              onEntryPatched={(id, values) =>
                setEntries((cur) =>
                  cur.map((e) =>
                    e.id === id
                      ? {
                          ...e,
                          ...(values.displayName !== undefined ? { display_name: values.displayName } : {}),
                          ...(values.tags !== undefined ? { tags: values.tags } : {}),
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
            onHoverChange={(hovered) => setSplitHovered(hovered ? "bank" : false)}
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
            onHoverChange={(hovered) => setSplitHovered(hovered ? "preview" : false)}
          />
          <div className="min-h-0 min-w-[15%]" style={{ width: `${previewWidthPct}%` }}>
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
    </div>
  );
}
