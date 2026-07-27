// Shared dnd-kit id namespacing so ResumeEditor's single DndContext can tell
// apart in-outline entry drags and bank-card drags (a bank entry not yet
// placed can share its raw id with an outline entry that IS placed, since
// both come from the same bank_entry.id). Sections themselves aren't
// draggable — they're reordered via up/down arrows in OutlinePane instead.
export const BANK_DRAG_PREFIX = "bank:";
// Explicit drop targets, rendered as visible grey "+" boxes, rather than
// the whole outline pane being one big catch-all droppable — placing a card
// should be a deliberate drop onto a target, not an accident of where the
// pointer happened to be released.
export const SECTION_APPEND_PREFIX = "append:"; // + section title — appends to that section
export const NEW_SECTION_DROP_ID = "new-section-drop"; // finds-or-creates by the entry's own source_section
