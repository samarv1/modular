"use client";

import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { RESUME_DRAG_PREFIX } from "@/components/home/desktop-dnd-ids";

// A drawn blank-page shape (with a folded corner, Finder's generic-document
// look), not a bordered card with a line icon inside — dragging moves the
// actual page shape.
//
// TODO(Phase 7 — compile worker): once resumes have a compiled PDF, render
// an actual first-page thumbnail here instead of this blank placeholder.
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
        onDoubleClick={openResume}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            openResume();
          }
        }}
        aria-label={`Open resume ${title}`}
        className={`cursor-pointer rounded-lg border-0 p-1 ${selected ? "bg-ink/15" : "bg-transparent"}`}
      >
        <DocumentGlyph />
      </button>
      <button
        onClick={select}
        onDoubleClick={openResume}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            openResume();
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
