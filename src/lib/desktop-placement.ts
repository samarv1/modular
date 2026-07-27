// Shared by the desktop canvas (client-side folder/drag creation) and the
// server-side import route — both need to hand a freshly created icon a
// position that doesn't land exactly on top of whatever's already there.
// Cascades diagonally from a fixed origin rather than randomizing, so
// placement is at least deterministic given how many items already exist.
const PLACEMENT_ORIGIN = { x: 24, y: 24 };
const PLACEMENT_STEP = 28;

export function nextPlacement(existingCount: number) {
  const step = existingCount % 8;
  return { x: PLACEMENT_ORIGIN.x + step * PLACEMENT_STEP, y: PLACEMENT_ORIGIN.y + step * PLACEMENT_STEP };
}
