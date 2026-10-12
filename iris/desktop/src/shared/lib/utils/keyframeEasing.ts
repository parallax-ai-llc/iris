/**
 * Keyframe easing curves — the single definition used by the editor preview
 * (effectRenderer.interpolateKeyframes) and by the FFmpeg export, which turns
 * keyframes into per-frame expressions (electron/ipc/export-render/keyframe-expr.ts).
 *
 * Imported by the Electron main process through a relative path: keep it free
 * of `@/` imports and of anything renderer-only.
 */

export type KeyframeEasingName =
  | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier'
  | 'hold' | 'auto-bezier' | 'continuous-bezier';

/**
 * Map linear progress `t` (0..1) between two keyframes to eased progress.
 * Uses the OUT-going easing of the starting keyframe (Premiere/AE convention).
 * Easings without a dedicated curve ('hold', 'auto-bezier', 'continuous-bezier',
 * 'bezier' without control points) fall back to linear — the preview has always
 * behaved this way, and the export mirrors it.
 */
export function easeKeyframeProgress(
  easing: string | undefined,
  t: number,
  bezierPoints?: [number, number, number, number],
): number {
  const e = easing ?? 'linear';
  if (e === 'ease-in') return t * t;
  if (e === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (e === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  if (e === 'bezier' && bezierPoints) {
    const [x1, y1, x2, y2] = bezierPoints;
    return cubicBezier(t, x1, y1, x2, y2);
  }
  return t;
}

/** Minimal keyframe shape shared by the editor's Keyframe and the export's ExportKeyframe. */
export interface EasedKeyframe {
  time: number;
  value: number;
  easing?: string;
  bezierPoints?: [number, number, number, number];
}

/**
 * Value of a curve at time `t` — the preview's interpolation rule
 * (effectRenderer.interpolateKeyframes): hold the first value before the first
 * keyframe, the last value after the last one, and between two keyframes ease
 * with the OUT-going easing of the earlier one. `kfs` must be sorted by time.
 * Used by the export for values it evaluates in JS (speed curves, blur steps,
 * subtitle animation) so both sides read the same curve.
 */
export function interpolateKeyframeValue(kfs: readonly EasedKeyframe[], t: number): number | undefined {
  if (kfs.length === 0) return undefined;
  if (kfs.length === 1) return kfs[0].value;
  if (t <= kfs[0].time) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (t >= last.time) return last.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const k0 = kfs[i];
    const k1 = kfs[i + 1];
    if (t >= k0.time && t <= k1.time) {
      const p = (t - k0.time) / (k1.time - k0.time);
      return k0.value + (k1.value - k0.value) * easeKeyframeProgress(k0.easing, p, k0.bezierPoints);
    }
  }
  return last.value;
}

/**
 * CSS-style cubic-bezier easing.
 * Solves for parameter u where x(u) = t (Newton's method), then returns y(u).
 */
export function cubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
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
