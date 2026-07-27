export type HoverCursor = "grab" | "col-resize";

export function setHoverCursor(cursor: HoverCursor) {
  document.documentElement.dataset.hoverCursor = cursor;
}

export function clearHoverCursor(cursor?: HoverCursor) {
  const root = document.documentElement;
  if (!cursor || root.dataset.hoverCursor === cursor) {
    delete root.dataset.hoverCursor;
  }
}
