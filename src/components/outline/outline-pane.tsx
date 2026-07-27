"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { BankEntryRow } from "@/app/api/entries/route";
import { NEW_SECTION_DROP_ID, SECTION_APPEND_PREFIX } from "@/components/dnd-ids";

export interface EditorSection {
  title: string;
  entries: string[]; // bank_entry ids, ordered
}

// dnd handling (DndContext, sensors, drag-start/over/end) lives in
// ResumeEditor now — it's the ancestor of both BankPane and OutlinePane, so
// a single DndContext there is what lets a card dragged from the bank land
// in a section here. This component only renders the sortable tree.

export function OutlinePane({
  sections,
  entryById,
  onChange,
  draggedEntry,
}: {
  sections: EditorSection[];
  entryById: Map<string, BankEntryRow>;
  onChange: (next: EditorSection[]) => void;
  // The bank entry currently being dragged, if any — lets a section's "Add
  // to this section" box turn red while hovering a card that belongs to a
  // different section instead of just staying neutral.
  draggedEntry?: BankEntryRow;
}) {
  function removeEntry(sectionTitle: string, entryId: string) {
    const next = sections
      .map((s) => (s.title === sectionTitle ? { ...s, entries: s.entries.filter((id) => id !== entryId) } : s))
      .filter((s) => s.entries.length > 0);
    onChange(next);
  }

  // Section order moved off drag-and-drop to the up/down arrows below — with
  // only ever a handful of sections, arrows are more precise and don't fight
  // with the bank-card drop targets sharing the same DndContext.
  function moveSection(sectionTitle: string, direction: "up" | "down") {
    const index = sections.findIndex((s) => s.title === sectionTitle);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= sections.length) return;
    const next = sections.slice();
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    onChange(next);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 pr-2">
          {sections.map((section, index) => (
            <OutlineSection
              key={section.title}
              section={section}
              entryById={entryById}
              onRemove={removeEntry}
              blocked={
                draggedEntry !== undefined &&
                draggedEntry.source_section.trim().toLowerCase() !== section.title.trim().toLowerCase()
              }
              onMoveUp={index > 0 ? () => moveSection(section.title, "up") : undefined}
              onMoveDown={index < sections.length - 1 ? () => moveSection(section.title, "down") : undefined}
            />
          ))}
          <DropBox
            id={NEW_SECTION_DROP_ID}
            label={sections.length === 0 ? "Drop here to start building this resume" : "Add a new section"}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

function OutlineSection({
  section,
  entryById,
  onRemove,
  blocked,
  onMoveUp,
  onMoveDown,
}: {
  section: EditorSection;
  entryById: Map<string, BankEntryRow>;
  onRemove: (sectionTitle: string, entryId: string) => void;
  blocked: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <div className="flex-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
          {section.title}
        </div>
        <div className="ml-auto flex items-center">
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp}
            aria-label={`Move ${section.title} section up`}
            className="flex size-5 items-center justify-center rounded-sm text-muted-fg outline-none hover:bg-surface-sunken hover:text-brand disabled:pointer-events-none disabled:opacity-30 focus-visible:text-brand"
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown}
            aria-label={`Move ${section.title} section down`}
            className="flex size-5 items-center justify-center rounded-sm text-muted-fg outline-none hover:bg-surface-sunken hover:text-brand disabled:pointer-events-none disabled:opacity-30 focus-visible:text-brand"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
      </div>
      <SortableContext items={section.entries} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5">
          {section.entries.map((entryId) => (
            <OutlineEntry
              key={entryId}
              entryId={entryId}
              sectionTitle={section.title}
              entry={entryById.get(entryId)}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
      <DropBox
        id={SECTION_APPEND_PREFIX + section.title}
        label="Add to this section"
        compact
        blocked={blocked}
      />
    </div>
  );
}

// Explicit, always-visible drop target — dragging a card here (rather than
// anywhere in the pane) is what actually places it, so adding an entry is a
// deliberate drop, not a side effect of wherever the pointer let go.
function DropBox({
  id,
  label,
  compact,
  blocked,
}: {
  id: string;
  label?: string;
  compact?: boolean;
  blocked?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`mt-1.5 flex items-center justify-center gap-1.5 rounded-md border border-dashed text-[11px] transition-colors ${
        compact ? "h-14" : "h-[5.5rem]"
      } ${
        isOver && blocked
          ? "border-danger bg-danger/10 text-danger"
          : isOver
            ? "border-brand bg-brand/10 text-brand"
            : "border-line-strong text-faint hover:border-muted-fg hover:text-muted-fg"
      }`}
    >
      <Plus className="size-3" />
      {label && <span className="font-mono uppercase tracking-wide">{label}</span>}
    </div>
  );
}

function OutlineEntry({
  entryId,
  sectionTitle,
  entry,
  onRemove,
}: {
  entryId: string;
  sectionTitle: string;
  entry: BankEntryRow | undefined;
  onRemove: (sectionTitle: string, entryId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entryId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex touch-none items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-2 text-[12.5px] ${isDragging ? "cursor-grabbing opacity-40" : "cursor-grab"}`}
    >
      <GripVertical className="size-3.5 shrink-0 text-line-strong" />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {entry?.display_name ?? "unknown entry"}
      </span>
      <button
        onClick={() => onRemove(sectionTitle, entryId)}
        onPointerDown={(e) => e.stopPropagation()}
        className="text-faint outline-none hover:text-danger focus-visible:text-danger"
        aria-label={`Remove ${entry?.display_name ?? "entry"} from ${sectionTitle}`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
