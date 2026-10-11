/**
 * Effect rendering utilities for video preview
 * Keyframe interpolation and effect calculations
 */

import type { Keyframe } from '@/types/videoProject.types';
import { easeKeyframeProgress } from './keyframeEasing';

/**
 * Interpolate a keyframe property value at a given clip-relative time.
 * Returns undefined if no keyframes exist for the property.
 *
 * The export renders the same curve per frame (electron/ipc/export-render/
 * keyframe-expr.ts) using the shared easing in ./keyframeEasing.ts.
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
      const easedT = easeKeyframeProgress(kfs[i].easing, t, kfs[i].bezierPoints);
      return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * easedT;
    }
  }
  return kfs[kfs.length - 1].value;
}
