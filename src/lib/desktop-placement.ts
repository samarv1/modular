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

function cellAt(index: number) {
  const columns = Math.max(
    1,
    Math.floor((CANVAS_WIDTH - PLACEMENT_ORIGIN.x) / CELL_WIDTH),
  );
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: PLACEMENT_ORIGIN.x + col * CELL_WIDTH,
    y: PLACEMENT_ORIGIN.y + row * CELL_HEIGHT,
  };
}

export function nextPlacement(existingCount: number) {
  return cellAt(existingCount);
}

// Scans the grid in the same row-major order as nextPlacement, but checks
// each cell against the positions actually occupied by current items
// instead of trusting a count. A count goes stale the moment it's computed
// from state that doesn't yet reflect an in-flight create (or reflects a
// deleted item that's still lingering), and silently hands out a slot that's
// either already taken or skips one that's free. Scanning real occupancy is
// self-correcting either way.
export function nextFreePlacement(occupied: { x: number; y: number }[]) {
  for (let index = 0; ; index++) {
    const candidate = cellAt(index);
    // Overlap, not exact-equality: dragged items sit at whatever coordinate
    // the drop landed on (Math.round(position + delta), not a grid cell), so
    // requiring an exact match would let a dragged item's cell look "free"
    // and hand out an overlapping position anyway.
    const blocked = occupied.some(
      (p) =>
        Math.abs(p.x - candidate.x) < CELL_WIDTH &&
        Math.abs(p.y - candidate.y) < CELL_HEIGHT,
    );
    if (!blocked) return candidate;
  }
}
