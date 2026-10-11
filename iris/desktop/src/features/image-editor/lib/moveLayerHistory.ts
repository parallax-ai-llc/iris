/**
 * History entry of a Move-tool drag: a click without movement is not an edit.
 * An Alt+drag duplicates the layer first (without history), so a duplicate
 * that did not move still needs its own 'Layer Duplicated' entry.
 */

export interface MoveDragStart {
  x: number;
  y: number;
  /** The drag started with an Alt+duplicate. */
  duplicated: boolean;
}

export function moveDragHistoryLabel(
  start: MoveDragStart,
  end: { x: number; y: number } | null | undefined,
): 'Move Layer' | 'Layer Duplicated' | null {
  const moved = !!end && (end.x !== start.x || end.y !== start.y);
  if (moved) return 'Move Layer';
  return start.duplicated ? 'Layer Duplicated' : null;
}
