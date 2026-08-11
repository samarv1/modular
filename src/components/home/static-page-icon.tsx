"use client";

import { useDraggable } from "@dnd-kit/core";
import { DocumentGlyph } from "@/components/home/resume-icon";
import { FolderGlyph } from "@/components/home/folder-icon";
import { STATIC_PAGE_DRAG_PREFIX } from "@/components/home/desktop-dnd-ids";
import { DesktopIconSlot, IconGlyphButton, IconLabel } from "@/components/home/desktop-icon";

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
    <DesktopIconSlot x={x} y={y} transform={transform} isDragging={isDragging} setRef={setNodeRef}>
      <IconGlyphButton
        onSelect={select}
        onOpen={open}
        ariaLabel={`Open ${title}`}
        selected={selected}
        dragProps={{ ...listeners, ...attributes }}
      >
        {glyph === "folder" ? (
          <FolderGlyph hasContents={hasContents ?? false} isOver={false} color="warn" />
        ) : (
          <DocumentGlyph />
        )}
      </IconGlyphButton>
      <IconLabel title={title} selected={selected} onSelect={select} onOpen={open} />
    </DesktopIconSlot>
  );
}
