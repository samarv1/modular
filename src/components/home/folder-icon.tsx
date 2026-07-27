"use client";

import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Pencil } from "lucide-react";
import { FOLDER_DRAG_PREFIX, FOLDER_DROP_PREFIX } from "@/components/home/desktop-dnd-ids";

// A drawn folder shape (back tab + opaque front panel), not a bordered card
// with a line icon inside — dragging moves the actual folder shape, closer
// to how Finder/desktop icons behave than a generic boxed glyph. The front
// panel is fully opaque (no /alpha) — contents peek out above its top edge
// rather than showing through a translucent front.
function FolderGlyph({ hasContents, isOver }: { hasContents: boolean; isOver: boolean }) {
  return (
    <div className="relative h-14 w-16">
      {/* Back tab, part of the same folder shape */}
      <span className={`absolute left-1 top-2 h-3 w-8 rounded-t-[3px] ${isOver ? "bg-brand" : "bg-brand/85"}`} />
      {/* Generic stacked-papers peek, sticking out above the front panel — no
          real thumbnails yet (the compile worker that would produce a real
          preview is Phase 7, not built), just a visual cue there's content. */}
      {hasContents && (
        <>
          <span className="absolute left-0 top-0 h-8 w-11 -rotate-6 rounded-sm border border-line-strong bg-surface shadow-sm" />
          <span className="absolute right-0 top-0 h-8 w-11 rotate-3 rounded-sm border border-line-strong bg-surface shadow-sm" />
        </>
      )}
      {/* Front panel — opaque, drawn last so it covers the lower half of the
          peeking papers and only their tops stick out above it. */}
      <span
        className={`absolute bottom-0 left-0 h-10 w-16 rounded-[4px] shadow-[0_2px_4px_-1px_rgba(18,24,28,0.25)] transition-colors ${
          isOver ? "bg-brand ring-2 ring-brand ring-offset-1" : "bg-brand"
        }`}
      />
    </div>
  );
}

export function FolderIcon({
  id,
  name,
  x,
  y,
  hasContents,
  renaming,
  selected,
  onSelect,
  onStartRename,
  onCommitRename,
  onOpen,
}: {
  id: string;
  name: string;
  x: number;
  y: number;
  hasContents: boolean;
  renaming: boolean;
  selected: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onOpen: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: FOLDER_DRAG_PREFIX + id,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: FOLDER_DROP_PREFIX + id });

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex w-24 touch-none select-none flex-col items-center gap-1"
    >
      <button
        {...listeners}
        {...attributes}
        onClick={onSelect}
        onDoubleClick={onOpen}
        className={`cursor-pointer rounded-lg border-0 p-1 ${selected ? "bg-ink/15" : "bg-transparent"}`}
      >
        <FolderGlyph hasContents={hasContents} isOver={isOver} />
      </button>
      {renaming ? (
        <input
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitRename(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(name);
              e.currentTarget.blur();
            }
          }}
          className="w-full rounded border-b border-brand bg-transparent px-1 text-center text-[11px] outline-none"
        />
      ) : (
        // Clicking the label selects (like the glyph) rather than renaming —
        // the pencil is the explicit rename affordance, so a stray click on
        // the name can't drop you into an edit field.
        <div
          onClick={onSelect}
          onDoubleClick={onOpen}
          className="group relative max-w-full cursor-pointer"
        >
          <span
            className={`block truncate rounded px-1 text-center text-[11px] font-medium ${
              selected ? "bg-brand text-white" : "text-ink"
            }`}
          >
            {name}
          </span>
          {/* Absolutely placed just outside the label so it never eats into
              the name's width — otherwise the folder title truncates earlier
              than a resume title of the same length. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            title="Rename folder"
            className="absolute left-full top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-60"
          >
            <Pencil className="size-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}
