"use client";

import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { RESUME_DRAG_PREFIX } from "@/components/home/desktop-dnd-ids";
import { DesktopIconSlot, IconGlyphButton, IconLabel } from "@/components/home/desktop-icon";

// A drawn blank-page shape (with a folded corner, Finder's generic-document
// look), not a bordered card with a line icon inside — dragging moves the
// actual page shape.
//
// TODO: render an actual first-page thumbnail from the resume's compiled
// PDF (pdf_artifact_path) here instead of this blank placeholder.
export function DocumentGlyph() {
  return (
    <div className="relative h-16 w-12">
      <div className="absolute inset-0 rounded-[3px] bg-surface shadow-[0_2px_5px_-1px_rgba(18,24,28,0.28)]" />
      {/* Folded top-right corner */}
      <div
        className="absolute right-0 top-0 h-0 w-0 border-b-[10px] border-l-[10px] border-b-transparent border-l-surface-sunken"
        style={{ borderTopRightRadius: 3 }}
      />
      <div className="absolute right-0 top-0 h-0 w-0 border-t-[10px] border-r-[10px] border-r-transparent border-t-bg" />
    </div>
  );
}

export function ResumeIcon({
  id,
  title,
  x,
  y,
  selected,
  onSelect,
}: {
  id: string;
  title: string;
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: RESUME_DRAG_PREFIX + id,
  });

  // A plain click (no pointer movement past the drag activation distance —
  // see PointerSensor's activationConstraint in desktop.tsx) still fires
  // onClick normally in dnd-kit; only a real drag suppresses it. Single click
  // selects and double click opens, matching folders and the Finder.
  function openResume() {
    if (!isDragging) router.push(`/resume/${id}`);
  }

  function select() {
    if (!isDragging) onSelect();
  }

  return (
    <DesktopIconSlot x={x} y={y} transform={transform} isDragging={isDragging} setRef={setNodeRef}>
      <IconGlyphButton
        onSelect={select}
        onOpen={openResume}
        ariaLabel={`Open resume ${title}`}
        selected={selected}
        dragProps={{ ...listeners, ...attributes }}
      >
        <DocumentGlyph />
      </IconGlyphButton>
      <IconLabel title={title} selected={selected} onSelect={select} onOpen={openResume} />
    </DesktopIconSlot>
  );
}
