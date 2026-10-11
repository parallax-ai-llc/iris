/**
 * Crop box geometry for drawing a new box with a drag (CropOverlay).
 *
 * The box spans the drag anchor and the pointer in any direction (dragging
 * up-left works like dragging down-right) and stays inside the image.
 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * The crop box for a drag from `anchor` to `pointer` (image coordinates),
 * clamped to `bounds`. With `aspectRatio` (width / height) the height follows
 * the width and grows in the drag direction.
 */
export function rectFromDrag(
  anchor: Point,
  pointer: Point,
  bounds: { width: number; height: number },
  aspectRatio?: number | null,
): CropRect {
  const ax = clamp(anchor.x, 0, bounds.width);
  const ay = clamp(anchor.y, 0, bounds.height);
  let px = clamp(pointer.x, 0, bounds.width);
  let py = clamp(pointer.y, 0, bounds.height);

  if (aspectRatio && aspectRatio > 0) {
    const dirX = px >= ax ? 1 : -1;
    const dirY = py >= ay ? 1 : -1;
    // Largest box with this ratio that fits in the drag and in the image.
    const maxW = dirX > 0 ? bounds.width - ax : ax;
    const maxH = dirY > 0 ? bounds.height - ay : ay;
    let w = Math.min(Math.abs(px - ax), maxW);
    let h = w / aspectRatio;
    if (h > maxH) {
      h = maxH;
      w = h * aspectRatio;
    }
    px = ax + dirX * w;
    py = ay + dirY * h;
  }

  return {
    x: Math.min(ax, px),
    y: Math.min(ay, py),
    width: Math.abs(px - ax),
    height: Math.abs(py - ay),
  };
}
