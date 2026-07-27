// Namespacing for the desktop canvas's own DndContext — separate from
// src/components/dnd-ids.ts, which is scoped to the resume editor's bank/
// outline drag-and-drop and never shares a DndContext with this one.
export const FOLDER_DRAG_PREFIX = "folder:";
export const RESUME_DRAG_PREFIX = "resume:";
export const FOLDER_DROP_PREFIX = "folder-drop:"; // dropping a resume icon onto a folder files it
export const DESKTOP_BACK_DROP_ID = "desktop-back-drop"; // the "← Desktop" breadcrumb, while inside a folder
