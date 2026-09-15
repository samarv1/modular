"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { clearHoverCursor, setHoverCursor } from "@/lib/hover-cursor";
import { sectionGroupLabel } from "@/lib/section-label";
import type { BankEntryRow } from "@/lib/rows";
import {
  NEW_SECTION_DROP_ID,
  SECTION_APPEND_PREFIX,
} from "@/components/dnd-ids";
import {
  moveCompositionSection,
  removeCompositionEntry,
  type EditorSection,
} from "@/lib/editor-composition";

export type { EditorSection } from "@/lib/editor-composition";

export function OutlinePane({
  sections,
  entryById,
  onChange,
  draggedEntry,
}: {
  sections: EditorSection[];
  entryById: Map<string, BankEntryRow>;
  onChange: (next: EditorSection[]) => void;
  draggedEntry?: BankEntryRow;
}) {
  function removeEntry(sectionTitle: string, entryId: string) {
    onChange(removeCompositionEntry(sections, sectionTitle, entryId));
  }

  function moveSection(sectionTitle: string, direction: "up" | "down") {
    onChange(moveCompositionSection(sections, sectionTitle, direction));
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <ScrollArea className="min-h-0 flex-1">
        {/* The overlay scrollbar needs clearance from card controls. */}
        <div className="flex flex-col gap-4 pr-4">
          {sections.map((section, index) => (
            <OutlineSection
              key={section.title}
              section={section}
              entryById={entryById}
              onRemove={removeEntry}
              blocked={
                draggedEntry !== undefined &&
                draggedEntry.source_section.trim().toLowerCase() !==
                  section.title.trim().toLowerCase()
              }
              onMoveUp={
                index > 0 ? () => moveSection(section.title, "up") : undefined
              }
              onMoveDown={
                index < sections.length - 1
                  ? () => moveSection(section.title, "down")
                  : undefined
              }
            />
          ))}
          <DropBox
            id={NEW_SECTION_DROP_ID}
            label={
              sections.length === 0
                ? "Drop here to start building this resume"
                : "Add a new section"
            }
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
        {/* Display labels may be grouped, but section titles remain identity keys. */}
        <div className="flex-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
          {sectionGroupLabel(section.title)}
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
      <SortableContext
        items={section.entries}
        strategy={verticalListSortingStrategy}
      >
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
      {label && (
        <span className="font-mono uppercase tracking-wide">{label}</span>
      )}
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
  const [hovering, setHovering] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entryId,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: isDragging ? "grabbing" : hovering ? "grab" : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerEnter={() => {
        setHovering(true);
        setHoverCursor("grab");
      }}
      onPointerLeave={() => {
        setHovering(false);
        clearHoverCursor("grab");
      }}
      className={`flex touch-none items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-2 text-[12.5px] ${isDragging ? "cursor-grabbing opacity-40" : "cursor-auto"}`}
    >
      <GripVertical className="pointer-events-none size-3.5 shrink-0 text-line-strong" />
      <span className="pointer-events-none min-w-0 flex-1 truncate font-semibold">
        {entry?.display_name ?? "unknown entry"}
      </span>
      <button
        onClick={() => onRemove(sectionTitle, entryId)}
        onPointerDown={(e) => e.stopPropagation()}
        data-cursor-override="pointer"
        className="cursor-pointer text-faint outline-none hover:text-danger focus-visible:text-danger"
        aria-label={`Remove ${entry?.display_name ?? "entry"} from ${sectionTitle}`}
      >
        <X className="pointer-events-none size-3.5" />
      </button>
    </div>
  );
}
