/**
 * Keyframes → FFmpeg per-frame expressions.
 *
 * The preview evaluates keyframes with interpolateKeyframes()
 * (src/shared/lib/utils/effectRenderer.ts): clamp to the first value before the
 * first keyframe, clamp to the last value after the last one, and between two
 * keyframes ease with the OUT-going easing of the earlier keyframe. This module
 * emits the same piecewise curve as an FFmpeg expression of a time variable so
 * filters that support per-frame evaluation (perspective, eq, volume) follow it
 * exactly. Easing comes from the one shared definition in keyframeEasing.ts.
 *
 * Expression shape (n keyframes):
 *   if(lt(T,t0), v0, if(lt(T,t1), seg0(T), ... if(lt(T,tn-1), segn-2(T), vn-1)))
 */

import type { ExportKeyframe } from './types';
// Shared with the renderer — relative path only (no `@/` alias in main).
import { easeKeyframeProgress } from '../../../src/shared/lib/utils/keyframeEasing';

/** Samples used to approximate a cubic-bezier easing segment piecewise-linearly. */
const BEZIER_SAMPLES = 24;

/** Format a number for an FFmpeg expression; negatives are parenthesised. */
export function num(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return n < 0 ? `(${s})` : s;
}

/** Keyframes of one property, sorted by time (same filter/sort as the preview). */
export function keyframesOf(
  keyframes: ExportKeyframe[] | undefined,
  property: string,
): ExportKeyframe[] {
  if (!keyframes || keyframes.length === 0) return [];
  return keyframes
    .filter((k) => k.property === property && Number.isFinite(k.time) && Number.isFinite(k.value))
    .sort((a, b) => a.time - b.time);
}

export function hasKeyframes(keyframes: ExportKeyframe[] | undefined, property: string): boolean {
  return keyframesOf(keyframes, property).length > 0;
}

/** Eased value between kf0 and kf1 as an expression of the progress `u` (0..1). */
function easedSegment(kf0: ExportKeyframe, kf1: ExportKeyframe, u: string): string {
  const v0 = kf0.value;
  const dv = kf1.value - kf0.value;
  if (dv === 0) return num(v0);
  const easing = kf0.easing ?? 'linear';
  let eased: string;
  if (easing === 'ease-in') {
    eased = `${u}*${u}`;
  } else if (easing === 'ease-out') {
    eased = `(1-(1-${u})*(1-${u}))`;
  } else if (easing === 'ease-in-out') {
    eased = `if(lt(${u},0.5),2*${u}*${u},1-2*(1-${u})*(1-${u}))`;
  } else if (easing === 'bezier' && kf0.bezierPoints) {
    // Piecewise-linear sampling of the exact shared curve.
    const samples: number[] = [];
    for (let i = 0; i <= BEZIER_SAMPLES; i++) {
      samples.push(easeKeyframeProgress('bezier', i / BEZIER_SAMPLES, kf0.bezierPoints));
    }
    let expr = num(samples[BEZIER_SAMPLES]);
    for (let i = BEZIER_SAMPLES - 1; i >= 0; i--) {
      const a = samples[i];
      const b = samples[i + 1];
      const local = `(${u}*${BEZIER_SAMPLES}-${i})`;
      const seg = b === a ? num(a) : `${num(a)}+${num(b - a)}*${local}`;
      expr = `if(lt(${u},${num((i + 1) / BEZIER_SAMPLES)}),${seg},${expr})`;
    }
    eased = `(${expr})`;
  } else {
    // linear, hold, auto-bezier, continuous-bezier — linear in the preview too.
    eased = u;
  }
  return `${num(v0)}+${num(dv)}*${eased}`;
}

/**
 * Expression for `property` at time variable `tVar` (seconds from clip start),
 * or null when the clip has no keyframes for it.
 */
export function keyframeExpr(
  keyframes: ExportKeyframe[] | undefined,
  property: string,
  tVar: string,
): string | null {
  const kfs = keyframesOf(keyframes, property);
  if (kfs.length === 0) return null;
  if (kfs.length === 1) return num(kfs[0].value);

  const T = `(${tVar})`;
  let expr = num(kfs[kfs.length - 1].value);
  for (let i = kfs.length - 2; i >= 0; i--) {
    const k0 = kfs[i];
    const k1 = kfs[i + 1];
    const d = k1.time - k0.time;
    if (d <= 0) continue; // duplicate times: the later keyframe wins, like the preview
    const u = `((${T}-${num(k0.time)})/${num(d)})`;
    expr = `if(lt(${T},${num(k1.time)}),${easedSegment(k0, k1, u)},${expr})`;
  }
  return `if(lt(${T},${num(kfs[0].time)}),${num(kfs[0].value)},${expr})`;
}
