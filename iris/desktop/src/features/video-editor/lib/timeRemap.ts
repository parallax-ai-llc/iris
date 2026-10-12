/**
 * Variable clip speed (speed keyframes / time remapping) → source time.
 *
 * One definition shared by the editor preview (EditorPreview.tsx: seek,
 * playhead sync, playbackRate) and the FFmpeg export
 * (electron/ipc/export-render/speed-remap.ts), so a clip with a speed curve
 * shows the same source frame at the same timeline instant in both.
 *
 *   speed(t)          the clip's playback rate at clip time t (seconds from the
 *                     clip's timeline start). Speed keyframes win; otherwise
 *                     timeRemappingKeyframes; otherwise the static `speed`.
 *   sourceOffset(t) = ∫₀ᵗ speed(τ) dτ   (source seconds after sourceStartTime)
 *
 * Speed keyframes use the preview's keyframe interpolation (shared easing in
 * keyframeEasing.ts). Time-remapping keyframes ({ time, speed }) are a speed
 * multiplier (1 = normal) interpolated linearly. Rates are clamped to
 * [MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE], the range the preview's <video>
 * playbackRate accepts, so sourceOffset is strictly increasing and invertible.
 *
 * Imported by the Electron main process through a relative path — keep it free
 * of `@/` imports and of anything renderer-only.
 */

import { interpolateKeyframeValue, type EasedKeyframe } from '../../../shared/lib/utils/keyframeEasing';

export const MIN_PLAYBACK_RATE = 0.0625;
export const MAX_PLAYBACK_RATE = 16;

/** Simpson panels per keyframe segment (even). Error is far below a frame. */
const SIMPSON_PANELS = 32;

export interface SpeedCurveClip {
  speed?: number;
  keyframes?: ReadonlyArray<{
    time: number;
    property: string;
    value: number;
    easing?: string;
    bezierPoints?: [number, number, number, number];
  }>;
  timeRemappingKeyframes?: ReadonlyArray<{ time: number; speed: number }>;
}

export const clampRate = (v: number) =>
  Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, Number.isFinite(v) ? v : 1));

/** The clip's speed curve (sorted points), or null when the speed is constant. */
export function speedCurveOf(clip: SpeedCurveClip): EasedKeyframe[] | null {
  const fromKeyframes = (clip.keyframes ?? [])
    .filter((k) => k.property === 'speed' && Number.isFinite(k.time) && Number.isFinite(k.value))
    .map((k) => ({ time: k.time, value: k.value, easing: k.easing, bezierPoints: k.bezierPoints }));
  if (fromKeyframes.length > 0) return fromKeyframes.sort((a, b) => a.time - b.time);
  const remap = (clip.timeRemappingKeyframes ?? [])
    .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.speed))
    .map((k) => ({ time: k.time, value: k.speed }));
  if (remap.length > 0) return remap.sort((a, b) => a.time - b.time);
  return null;
}

export function hasVariableSpeed(clip: SpeedCurveClip): boolean {
  return speedCurveOf(clip) !== null;
}

export interface TimeMap {
  /** True when the clip has a speed curve (keyframes / time remapping). */
  variable: boolean;
  /** Playback rate at clip time t. */
  speedAt(t: number): number;
  /** Source seconds after sourceStartTime shown at clip time t. */
  sourceOffsetAt(t: number): number;
  /** Inverse of sourceOffsetAt: clip time at which source offset s is shown. */
  clipTimeAt(s: number): number;
  /** Clip-time breakpoints of the curve (keyframe times), sorted. */
  breakpoints: number[];
}

/** Static-speed map (the behaviour every clip without a curve keeps). */
function constantMap(speed: number): TimeMap {
  const v = speed > 0 && Number.isFinite(speed) ? speed : 1;
  return {
    variable: false,
    speedAt: () => v,
    sourceOffsetAt: (t) => t * v,
    clipTimeAt: (s) => s / v,
    breakpoints: [],
  };
}

export function buildTimeMap(clip: SpeedCurveClip): TimeMap {
  const curve = speedCurveOf(clip);
  if (!curve) return constantMap(clip.speed ?? 1);
  if (curve.length === 1) return { ...constantMap(clampRate(curve[0].value)), variable: true };

  const speedAt = (t: number) => clampRate(interpolateKeyframeValue(curve, t) ?? 1);
  const k = curve.map((p) => p.time);
  const first = k[0];
  const lastIdx = k.length - 1;

  /** ∫ speed over [a, b] inside one keyframe segment (Simpson). */
  const integrate = (a: number, b: number): number => {
    if (b <= a) return 0;
    const n = SIMPSON_PANELS;
    const hh = (b - a) / n;
    let sum = speedAt(a) + speedAt(b);
    for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * speedAt(a + i * hh);
    return (sum * hh) / 3;
  };

  // G(t) = ∫_{first}^{t} speed; cumulative values at the keyframe times.
  const cum: number[] = [0];
  for (let i = 1; i < k.length; i++) cum.push(cum[i - 1] + integrate(k[i - 1], k[i]));
  const vFirst = speedAt(first - 1);
  const vLast = speedAt(k[lastIdx] + 1);

  const G = (t: number): number => {
    if (t <= first) return vFirst * (t - first);
    if (t >= k[lastIdx]) return cum[lastIdx] + vLast * (t - k[lastIdx]);
    let i = 0;
    while (i < lastIdx - 1 && t >= k[i + 1]) i++;
    return cum[i] + integrate(k[i], t);
  };
  const g0 = G(0);

  const Ginv = (g: number): number => {
    if (g <= 0) return first + g / vFirst;
    if (g >= cum[lastIdx]) return k[lastIdx] + (g - cum[lastIdx]) / vLast;
    let i = 0;
    while (i < lastIdx - 1 && g >= cum[i + 1]) i++;
    // G is strictly increasing on [k[i], k[i+1]] — bisect.
    let lo = k[i];
    let hi = k[i + 1];
    for (let iter = 0; iter < 48; iter++) {
      const mid = (lo + hi) / 2;
      if (cum[i] + integrate(k[i], mid) < g) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  return {
    variable: true,
    speedAt,
    sourceOffsetAt: (t) => G(t) - g0,
    clipTimeAt: (s) => Ginv(s + g0),
    breakpoints: k,
  };
}
