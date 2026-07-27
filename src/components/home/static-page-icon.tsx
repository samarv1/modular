"use client";

import { useDraggable } from "@dnd-kit/core";
import { DocumentGlyph } from "@/components/home/resume-icon";
import { FolderGlyph } from "@/components/home/folder-icon";
import { STATIC_PAGE_DRAG_PREFIX } from "@/components/home/desktop-dnd-ids";

// Same select/open interaction as ResumeIcon/FolderIcon, but there's no
// route to navigate to — opening one just switches Desktop into its own
// page view (see Desktop's openPageId). Glyph varies by what the page
// represents: a document for a single page (About), a folder for one that
// holds multiple things (Bank).
export function StaticPageIcon({
  id,
  title,
  x,
  y,
  glyph,
  hasContents,
  selected,
  onSelect,
  onOpen,
}: {
  id: string;
  title: string;
  x: number;
  y: number;
  glyph: "document" | "folder";
  hasContents?: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: STATIC_PAGE_DRAG_PREFIX + id,
  });

  function select() {
    if (!isDragging) onSelect();
  }
  function open() {
    if (!isDragging) onOpen();
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex w-32 touch-none select-none flex-col items-center gap-1"
    >
      <button
        {...listeners}
        {...attributes}
        onClick={select}
        onDoubleClick={open}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            open();
          }
        }}
        aria-label={`Open ${title}`}
        className={`cursor-pointer rounded-lg border-0 p-1 ${selected ? "bg-ink/15" : "bg-transparent"}`}
      >
        {glyph === "folder" ? (
          <FolderGlyph hasContents={hasContents ?? false} isOver={false} color="warn" />
        ) : (
          <DocumentGlyph />
        )}
      </button>
      <button
        onClick={select}
        onDoubleClick={open}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            open();
          }
        }}
        title={title}
        className={`inline-block max-w-full whitespace-normal break-words rounded px-1 text-center text-[11px] font-medium leading-tight ${
          selected ? "bg-brand text-white" : "text-ink"
        }`}
      >
        {title}
      </button>
    </div>
  );
}
