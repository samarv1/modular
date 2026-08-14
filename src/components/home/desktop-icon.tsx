"use client";

import type { ReactNode } from "react";

// Shared pieces used by every desktop icon (folder, resume, static page,
// bank file): a positioned/draggable wrapper, the glyph button (click
// selects, double-click or Enter opens), and the plain text label under it.
// Folders swap the label for their own renaming-aware version instead of
// using IconLabel.

export function DesktopIconSlot({
  x,
  y,
  transform,
  isDragging,
  setRef,
  children,
}: {
  x: number;
  y: number;
  transform?: { x: number; y: number } | null;
  isDragging?: boolean;
  setRef?: (node: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <div
      ref={setRef}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex w-32 touch-none select-none flex-col items-center gap-1"
    >
      {children}
    </div>
  );
}

export function IconGlyphButton({
  onSelect,
  onOpen,
  ariaLabel,
  selected,
  dragProps,
  children,
}: {
  onSelect: () => void;
  onOpen: () => void;
  ariaLabel: string;
  selected: boolean;
  dragProps?: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <button
      {...dragProps}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen();
        }
      }}
      aria-label={ariaLabel}
      className={`cursor-pointer rounded-lg border-0 p-1 ${selected ? "bg-ink/15" : "bg-transparent"}`}
    >
      {children}
    </button>
  );
}

export function IconLabel({
  title,
  selected,
  onSelect,
  onOpen,
}: {
  title: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen();
        }
      }}
      title={title}
      className={`inline-block max-w-full whitespace-normal break-words rounded px-1 text-center text-[11px] font-medium leading-tight ${
        selected ? "bg-brand text-white" : "text-ink"
      }`}
    >
      {title}
    </button>
  );
}
