/**
 * Effect rendering utilities for video preview
 * Keyframe interpolation and effect calculations
 */

import type { Keyframe } from '@/types/videoProject.types';
import { interpolateKeyframeValue } from './keyframeEasing';

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
  return interpolateKeyframeValue(kfs, clipOffset);
}
