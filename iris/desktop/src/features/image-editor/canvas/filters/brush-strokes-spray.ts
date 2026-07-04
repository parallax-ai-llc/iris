/**
 * Spray-based brush stroke filters (spatter, sprayed strokes)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Split out of brush-strokes.ts to
 * keep category modules under the 500-line limit; their gallery entries stay
 * in brush-strokes.ts, which owns the Brush Strokes registrations.
 */

import { gaussianBlur } from './blur';
import { seededRandom } from './core';

/**
 * Spatter — Randomly displace pixels within a spray radius using a seeded
 * pseudo-random number generator for deterministic results, then apply
 * Gaussian smoothing to soften the spattered appearance.
 * @param imageData Source image data
 * @param sprayRadius Maximum pixel displacement radius (5-15)
 * @param smoothness Amount of post-smoothing via Gaussian blur (1-15)
 */
export function spatter(
  imageData: ImageData,
  sprayRadius: number = 10,
  smoothness: number = 5
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const rr = Math.max(1, Math.round(sprayRadius));

  // Seeded PRNG for deterministic output
  const pseudoRandom = seededRandom(12345);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Random displacement within circular spray radius
      const angle = pseudoRandom() * Math.PI * 2;
      const dist = pseudoRandom() * rr;
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + Math.cos(angle) * dist)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + Math.sin(angle) * dist)));

      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;

      d[dstIdx] = data[srcIdx];
      d[dstIdx + 1] = data[srcIdx + 1];
      d[dstIdx + 2] = data[srcIdx + 2];
      d[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  // Post-smooth via Gaussian blur
  if (smoothness > 0) {
    return gaussianBlur(result, smoothness);
  }

  return result;
}

/**
 * Sprayed Strokes — Directional spray effect with configurable stroke direction.
 * Pixels are displaced along the stroke direction with perpendicular spray spread,
 * using a seeded PRNG for deterministic results.
 * @param imageData Source image data
 * @param strokeLength Length of the spray strokes along direction
 * @param sprayRadius Perpendicular spread radius of the spray
 * @param strokeDirection Direction of strokes: 'rightDiagonal' | 'horizontal' | 'leftDiagonal' | 'vertical'
 */
export function sprayedStrokes(
  imageData: ImageData,
  strokeLength: number = 12,
  sprayRadius: number = 7,
  strokeDirection: 'rightDiagonal' | 'horizontal' | 'leftDiagonal' | 'vertical' = 'rightDiagonal'
): ImageData {
  const { width, height, data } = imageData;

  // Map direction name to angle in degrees
  const dirAngles: Record<string, number> = {
    rightDiagonal: 45,
    horizontal: 0,
    leftDiagonal: 135,
    vertical: 90,
  };
  const angleDeg = dirAngles[strokeDirection] ?? 45;
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const result = new ImageData(width, height);
  const d = result.data;

  // Seeded PRNG for deterministic output
  const pseudoRandom = seededRandom(54321);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Displacement along stroke direction
      const along = (pseudoRandom() - 0.5) * strokeLength;
      // Perpendicular spray spread
      const perpAngle = rad + Math.PI / 2;
      const perpDist = (pseudoRandom() - 0.5) * sprayRadius;

      const sx = Math.min(width - 1, Math.max(0,
        Math.round(x + dx * along + Math.cos(perpAngle) * perpDist)
      ));
      const sy = Math.min(height - 1, Math.max(0,
        Math.round(y + dy * along + Math.sin(perpAngle) * perpDist)
      ));

      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;

      d[dstIdx] = data[srcIdx];
      d[dstIdx + 1] = data[srcIdx + 1];
      d[dstIdx + 2] = data[srcIdx + 2];
      d[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return result;
}
