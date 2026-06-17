/**
 * Snap engine for layer movement in the image editor.
 * Calculates snap positions against canvas edges, center, and other layers.
 */

const DEFAULT_SNAP_THRESHOLD = 8; // pixels in image space

export interface SnapLine {
  orientation: 'h' | 'v';
  position: number;
}

interface SnapTarget {
  position: number;
  orientation: 'h' | 'v';
}

interface LayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapResult {
  x: number;
  y: number;
  snapLines: SnapLine[];
}

export function calculateSnap(
  layerX: number,
  layerY: number,
  layerW: number,
  layerH: number,
  canvasW: number,
  canvasH: number,
  otherLayers: LayerBounds[],
  options: { smartGuides: boolean; threshold?: number }
): SnapResult {
  const threshold = options.threshold ?? DEFAULT_SNAP_THRESHOLD;
  const snapLines: SnapLine[] = [];

  // Build vertical snap targets (x-axis positions)
  const vTargets: SnapTarget[] = [
    { position: 0, orientation: 'v' },
    { position: canvasW / 2, orientation: 'v' },
    { position: canvasW, orientation: 'v' },
  ];

  // Build horizontal snap targets (y-axis positions)
  const hTargets: SnapTarget[] = [
    { position: 0, orientation: 'h' },
    { position: canvasH / 2, orientation: 'h' },
    { position: canvasH, orientation: 'h' },
  ];

  // Add other layer edges as snap targets if smart guides enabled
  if (options.smartGuides) {
    for (const other of otherLayers) {
      vTargets.push(
        { position: other.x, orientation: 'v' },
        { position: other.x + other.width / 2, orientation: 'v' },
        { position: other.x + other.width, orientation: 'v' },
      );
      hTargets.push(
        { position: other.y, orientation: 'h' },
        { position: other.y + other.height / 2, orientation: 'h' },
        { position: other.y + other.height, orientation: 'h' },
      );
    }
  }

  // Layer reference points for vertical (x-axis)
  // left edge, center, right edge
  const layerVRefs = [
    { offset: 0, value: layerX },                         // left edge
    { offset: layerW / 2, value: layerX + layerW / 2 },   // center
    { offset: layerW, value: layerX + layerW },            // right edge
  ];

  // Layer reference points for horizontal (y-axis)
  const layerHRefs = [
    { offset: 0, value: layerY },                         // top edge
    { offset: layerH / 2, value: layerY + layerH / 2 },   // center
    { offset: layerH, value: layerY + layerH },            // bottom edge
  ];

  // Find best vertical snap
  let bestVSnap: { adjustment: number; targetPos: number } | null = null;
  let bestVDist = Infinity;

  for (const ref of layerVRefs) {
    for (const target of vTargets) {
      const dist = Math.abs(ref.value - target.position);
      if (dist <= threshold && dist < bestVDist) {
        bestVDist = dist;
        bestVSnap = {
          adjustment: target.position - ref.value,
          targetPos: target.position,
        };
      }
    }
  }

  // Find best horizontal snap
  let bestHSnap: { adjustment: number; targetPos: number } | null = null;
  let bestHDist = Infinity;

  for (const ref of layerHRefs) {
    for (const target of hTargets) {
      const dist = Math.abs(ref.value - target.position);
      if (dist <= threshold && dist < bestHDist) {
        bestHDist = dist;
        bestHSnap = {
          adjustment: target.position - ref.value,
          targetPos: target.position,
        };
      }
    }
  }

  let snappedX = layerX;
  let snappedY = layerY;

  if (bestVSnap) {
    snappedX = layerX + bestVSnap.adjustment;
    snapLines.push({ orientation: 'v', position: bestVSnap.targetPos });
  }

  if (bestHSnap) {
    snappedY = layerY + bestHSnap.adjustment;
    snapLines.push({ orientation: 'h', position: bestHSnap.targetPos });
  }

  return { x: snappedX, y: snappedY, snapLines };
}
