// Shared by the desktop canvas (client-side folder/drag creation) and the
// static-page default position (Desktop) — both need to hand a freshly
// created icon a position that doesn't land on top of whatever's already
// there. Row-major grid: each new item goes to the right of the last one,
// wrapping to the next row once it would run past the canvas's right edge
// (see the bounded panel in Desktop, max-w-[960px]).
const PLACEMENT_ORIGIN = { x: 24, y: 24 };
const CANVAS_WIDTH = 960;
const CELL_WIDTH = 140; // icon column width (w-32 = 128px) + gap
const CELL_HEIGHT = 130; // glyph + up-to-2-line label + gap

export function nextPlacement(existingCount: number) {
  const columns = Math.max(1, Math.floor((CANVAS_WIDTH - PLACEMENT_ORIGIN.x) / CELL_WIDTH));
  const col = existingCount % columns;
  const row = Math.floor(existingCount / columns);
  return {
    x: PLACEMENT_ORIGIN.x + col * CELL_WIDTH,
    y: PLACEMENT_ORIGIN.y + row * CELL_HEIGHT,
  };
}
