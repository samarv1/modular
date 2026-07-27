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
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Pencil } from "lucide-react";
import { BackToDesktopLink } from "@/components/back-to-desktop";
import { BankPane, BankEntryCardVisual } from "@/components/bank/bank-pane";
import { OutlinePane, type EditorSection } from "@/components/outline/outline-pane";
import { BANK_DRAG_PREFIX, NEW_SECTION_DROP_ID, SECTION_APPEND_PREFIX } from "@/components/dnd-ids";
import type { BankEntryRow } from "@/app/api/entries/route";
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
        onBlur={() => onCommitRename(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
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
  initialRenaming = false,
}: {
  initialEntries: BankEntryRow[];
  initialResume: ResumeMetaRow;
  initialSections: ResumeSectionRow[];
  initialRenaming?: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  // Always the resume this route (/resume/[id]) was opened for — switching
  // resumes happens by navigating, on the home page, not by swapping state
  // here.
  const [resume, setResume] = useState(initialResume);
  const [sections, setSections] = useState<EditorSection[]>(toEditorSections(initialSections));
  const [addError, setAddError] = useState<string | null>(null);
  // A freshly-created resume (via the home page's "New resume", which
  // navigates here with ?new=1) opens straight into rename mode rather than
  // just appearing with the default "Untitled resume" title — that's the
  // signal that you're now working on something new, and gets it named in
  // the same motion instead of leaving the default title to edit later.
  const [renaming, setRenaming] = useState(initialRenaming);

  useEffect(() => () => clearHoverCursor(), []);

  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const usedEntryIds = useMemo(() => new Set(sections.flatMap((s) => s.entries)), [sections]);

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  function updateSections(next: EditorSection[]) {
    setSections(next);
  }

  useEffect(() => {
    // Skip persisting the composition that was just loaded from the server
    // on mount — only writes triggered by actual user edits should autosave.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      fetch(`/api/resumes/${resume.id}/composition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      }).catch(() => {
        // Last-write-wins autosave (PLAN.md) — the next successful save
        // supersedes a failed one, so a transient network error here is a
        // silent retry-on-next-edit rather than a blocking error state.
      });
    }, 400);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  async function renameResume(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setResume((cur) => ({ ...cur, title: trimmed }));
    await fetch(`/api/resumes/${resume.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  }

  // Shared by the bank card's "+" button and drag-and-drop: place `entry`
  // into the section titled `targetSectionTitle` (created if it doesn't
  // exist yet), inserted just before `insertBeforeId` or appended at the end.
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

    const targetHasChunk = target?.entries.some((id) => entryById.get(id)?.kind === "section_chunk");

    if (target && (targetHasChunk || entry.kind === "section_chunk")) {
      setAddError(`"${targetSectionTitle}" already holds a section that must stay by itself.`);
      setTimeout(() => setAddError(null), 3500);
      return;
    }

    if (target) {
      const nextEntries = [...target.entries];
      const insertAt = insertBeforeId ? nextEntries.indexOf(insertBeforeId) : -1;
      if (insertAt === -1) nextEntries.push(entry.id);
      else nextEntries.splice(insertAt, 0, entry.id);
      setSections(sections.map((s, i) => (i === targetIndex ? { ...s, entries: nextEntries } : s)));
    } else {
      setSections([...sections, { title: targetSectionTitle, entries: [entry.id] }]);
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

  // Live-move an already-placed outline entry across sections as the drag
  // passes over another section's container, so the drop target reflects
  // where it'll land — final order/removal-of-empties is settled in
  // handleDragEnd. Bank cards aren't placed yet, so they get no live
  // preview — they're only placed on drop (see handleDragEnd).
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    if (activeIdStr.startsWith(BANK_DRAG_PREFIX)) return;

    const overIdStr = String(over.id);
    const fromIndex = findSectionIndexByEntryId(activeIdStr);
    if (fromIndex === -1) return;

    let toIndex = findSectionIndexByEntryId(overIdStr);
    if (toIndex === -1 && overIdStr.startsWith(SECTION_APPEND_PREFIX)) {
      toIndex = sections.findIndex((s) => s.title === overIdStr.slice(SECTION_APPEND_PREFIX.length));
    }
    if (toIndex === -1 || toIndex === fromIndex) return;

    const targetSection = sections[toIndex];
    const draggedEntry = entryById.get(activeIdStr);
    const targetHasChunk = targetSection.entries.some(
      (id) => entryById.get(id)?.kind === "section_chunk",
    );
    if (targetHasChunk || draggedEntry?.kind === "section_chunk") return; // exclusivity — no live preview across into/out of a chunk section

    const next = sections.map((s) => ({ ...s, entries: [...s.entries] }));
    next[fromIndex].entries = next[fromIndex].entries.filter((id) => id !== activeIdStr);
    const overEntryIndex = next[toIndex].entries.indexOf(overIdStr);
    if (overEntryIndex === -1) next[toIndex].entries.push(activeIdStr);
    else next[toIndex].entries.splice(overEntryIndex, 0, activeIdStr);
    setSections(next.filter((s) => s.entries.length > 0));
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

    // Entry-within-same-section reorder. Cross-section moves already
    // happened during handleDragOver.
    const sectionIndex = findSectionIndexByEntryId(activeIdStr);
    if (sectionIndex === -1) return;
    const section = sections[sectionIndex];
    const from = section.entries.indexOf(activeIdStr);
    const to = section.entries.indexOf(overIdStr);
    if (from === -1 || to === -1 || from === to) return;
    setSections(
      sections.map((s, i) => (i === sectionIndex ? { ...s, entries: arrayMove(s.entries, from, to) } : s)),
    );
  }

  const activeBankEntry = activeId?.startsWith(BANK_DRAG_PREFIX)
    ? entryById.get(activeId.slice(BANK_DRAG_PREFIX.length))
    : undefined;
  const activeOutlineEntry =
    activeId && !activeId.startsWith(BANK_DRAG_PREFIX) ? entryById.get(activeId) : undefined;

  // Adjustable bank/outline split. Clamped so neither pane can be dragged
  // down to unusable — bounds are in percent of the split row's own width,
  // not the viewport, so they hold up regardless of window size.
  const [bankWidthPct, setBankWidthPct] = useState(50);
  const [resizingSplit, setResizingSplit] = useState(false);
  const [splitHovered, setSplitHovered] = useState(false);
  const splitRowRef = useRef<HTMLDivElement>(null);

  function clampSplit(pct: number) {
    return Math.min(75, Math.max(20, pct));
  }
  function onSplitPointerDown(e: PointerEvent<HTMLDivElement>) {
    setResizingSplit(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onSplitPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!resizingSplit || !splitRowRef.current) return;
    const rect = splitRowRef.current.getBoundingClientRect();
    setBankWidthPct(clampSplit(((e.clientX - rect.left) / rect.width) * 100));
  }
  function onSplitPointerUp(e: PointerEvent<HTMLDivElement>) {
    setResizingSplit(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
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
            renameResume(title);
          }}
        />
        {addError && <span className="px-2 text-[11.5px] text-danger">{addError}</span>}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div ref={splitRowRef} className={`flex min-h-0 flex-1 ${resizingSplit ? "cursor-col-resize select-none" : ""}`}>
          <div className="min-h-0 min-w-[15%]" style={{ width: `${bankWidthPct}%` }}>
            <BankPane
              initialEntries={entries}
              usedEntryIds={usedEntryIds}
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
          {/* Adjustable divider — wider invisible hit area than the visible
              line itself, so it's easy to grab without needing pixel precision. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize bank and outline panes"
            onPointerDown={onSplitPointerDown}
            onPointerMove={onSplitPointerMove}
            onPointerUp={onSplitPointerUp}
            onPointerCancel={onSplitPointerUp}
            onPointerEnter={() => {
              setSplitHovered(true);
              setHoverCursor("col-resize");
            }}
            onPointerLeave={() => {
              setSplitHovered(false);
              clearHoverCursor("col-resize");
            }}
            style={{ cursor: resizingSplit ? "col-resize" : splitHovered ? "col-resize" : undefined }}
            className="group relative w-2 shrink-0 cursor-auto touch-none"
          >
            <div
              className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors ${
                resizingSplit ? "bg-brand" : "group-hover:bg-brand"
              }`}
            />
          </div>
          <div className="min-h-0 min-w-[15%] flex-1">
            <OutlinePane
              sections={sections}
              entryById={entryById}
              onChange={updateSections}
              draggedEntry={activeBankEntry}
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
