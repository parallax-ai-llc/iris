/**
 * Effect rendering utilities for video preview
 * Keyframe interpolation and effect calculations
 */

import type { Keyframe } from '@/types/videoProject.types';

/**
 * Interpolate a keyframe property value at a given clip-relative time.
 * Returns undefined if no keyframes exist for the property.
 */
export function interpolateKeyframes(
  keyframes: Keyframe[],
  property: Keyframe['property'],
  clipOffset: number,
): number | undefined {
  const kfs = keyframes.filter((k) => k.property === property).sort((a, b) => a.time - b.time);
  if (kfs.length === 0) return undefined;
  if (kfs.length === 1) return kfs[0].value;

  // Before first keyframe
  if (clipOffset <= kfs[0].time) return kfs[0].value;
  // After last keyframe
  if (clipOffset >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  // Find surrounding keyframes
  for (let i = 0; i < kfs.length - 1; i++) {
    if (clipOffset >= kfs[i].time && clipOffset <= kfs[i + 1].time) {
      const t = (clipOffset - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
      // Use the OUT-going easing of the starting keyframe (Premiere/AE convention)
      const easing = kfs[i].easing ?? 'linear';
      let easedT = t;
      if (easing === 'ease-in') easedT = t * t;
      else if (easing === 'ease-out') easedT = 1 - (1 - t) * (1 - t);
      else if (easing === 'ease-in-out') easedT = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      else if (easing === 'bezier' && kfs[i].bezierPoints) {
        const [x1, y1, x2, y2] = kfs[i].bezierPoints!;
        easedT = cubicBezier(t, x1, y1, x2, y2);
      }
      return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * easedT;
    }
  }
  return kfs[kfs.length - 1].value;
}

/**
 * CSS-style cubic-bezier easing.
 * Solves for parameter u where x(u) = t (Newton's method), then returns y(u).
 */
function cubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = (u: number) => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const cy = (u: number) => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  const dcx = (u: number) =>
    3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
  // Newton's method
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = cx(u) - t;
    if (Math.abs(x) < 1e-5) return cy(u);
    const d = dcx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= x / d;
  }
  // Fallback: bisection
  let lo = 0;
  let hi = 1;
  u = t;
  for (let i = 0; i < 20; i++) {
    const x = cx(u);
    if (Math.abs(x - t) < 1e-5) return cy(u);
    if (x < t) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return cy(u);
}
