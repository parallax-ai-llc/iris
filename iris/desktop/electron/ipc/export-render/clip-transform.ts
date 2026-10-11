/**
 * Base-track clip transform / opacity / keyframes → FFmpeg filters.
 *
 * Mirrors the preview's base <video> styling (EditorPreview.tsx):
 *   transform = translate(x, y) scale(s) rotate(r)  around the frame centre
 *   opacity   = keyframed or static clip opacity, over the black stage
 *   filter    = … brightness(kf) contrast(kf) for keyframed brightness/contrast
 * Keyframed values use the same curve as interpolateKeyframes() via
 * ./keyframe-expr.ts. x / y are project pixels (the overlay compositor uses the
 * same unit), rotation is degrees clockwise.
 *
 * Input: a clip segment already normalised to the output size W×H (yuv420p,
 * constant frame rate, pts starting at 0 = clip start on the timeline).
 */

import type { ExportClip } from './types';
import { keyframeExpr, hasKeyframes, num } from './keyframe-expr';

/** Black border added before `perspective` so its edge clamping smears black. */
const BORDER = 2;

/** Offset that keeps tv-range black (Y=16) fixed when eq scales contrast by m.
 *  Calibrated against FFmpeg's eq LUT: Y' ≈ (Y-127)·m + 127 + 255·brightness. */
const EQ_BLACK_PIVOT = 111 / 255;

const GEOMETRY_PROPS = ['scale', 'rotation', 'x', 'y'] as const;

function staticTransform(clip: ExportClip) {
  const t = clip.transform;
  return {
    scale: t?.scale ?? 1,
    rotation: t?.rotation ?? 0,
    x: t?.x ?? 0,
    y: t?.y ?? 0,
    opacity: t?.opacity ?? 1,
  };
}

/**
 * pad → perspective(sense=destination) → crop: maps the frame through
 * translate·scale·rotate about its centre at a constant output size, with
 * per-frame expressions when any geometry property is keyframed.
 */
function buildGeometryFilters(clip: ExportClip, W: number, H: number, fps: number, lead: number): string[] {
  const st = staticTransform(clip);
  const animated = GEOMETRY_PROPS.some((p) => hasKeyframes(clip.keyframes, p));
  const identity = st.scale === 1 && st.rotation === 0 && st.x === 0 && st.y === 0;
  if (!animated && identity) return [];

  const corners: Array<[number, number]> = [
    [-BORDER, -BORDER], [W + BORDER, -BORDER], [-BORDER, H + BORDER], [W + BORDER, H + BORDER],
  ];
  const cx = W / 2;
  const cy = H / 2;
  const coords: string[] = [];

  if (!animated) {
    const rad = (st.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    corners.forEach(([qx, qy], i) => {
      const dx = qx - cx;
      const dy = qy - cy;
      const X = cx + BORDER + st.x + st.scale * (dx * cos - dy * sin);
      const Y = cy + BORDER + st.y + st.scale * (dx * sin + dy * cos);
      coords.push(`x${i}=${num(X)}:y${i}=${num(Y)}`);
    });
  } else {
    // perspective exposes the input frame count `in`; frames are CFR from 0.
    const T = lead > 0 ? `in/${num(fps)}+${num(lead)}` : `in/${num(fps)}`;
    const S = keyframeExpr(clip.keyframes, 'scale', T) ?? num(st.scale);
    const R = `(${keyframeExpr(clip.keyframes, 'rotation', T) ?? num(st.rotation)})*PI/180`;
    const X = keyframeExpr(clip.keyframes, 'x', T) ?? num(st.x);
    const Y = keyframeExpr(clip.keyframes, 'y', T) ?? num(st.y);
    corners.forEach(([qx, qy], i) => {
      const dx = num(qx - cx);
      const dy = num(qy - cy);
      const xe = `${num(cx + BORDER)}+(${X})+(${S})*(${dx}*cos(${R})-${dy}*sin(${R}))`;
      const ye = `${num(cy + BORDER)}+(${Y})+(${S})*(${dx}*sin(${R})+${dy}*cos(${R}))`;
      coords.push(`x${i}='${xe}':y${i}='${ye}'`);
    });
  }

  return [
    `pad=${W + 2 * BORDER}:${H + 2 * BORDER}:${BORDER}:${BORDER}:color=black`,
    `perspective=${coords.join(':')}:sense=destination:eval=${animated ? 'frame' : 'init'}`,
    `crop=${W}:${H}:${BORDER}:${BORDER}`,
  ];
}

/** eq that scales the picture toward tv-range black by `m` (expression or number). */
function eqMultiply(m: string, animated: boolean): string {
  return `eq=contrast='${m}':brightness='(${m}-1)*${num(EQ_BLACK_PIVOT)}':saturation='${m}'` +
    `:eval=${animated ? 'frame' : 'init'}`;
}

/**
 * Filters for keyframed contrast, then brightness × opacity (opacity over the
 * black stage is a multiply toward black — same as the preview).
 */
function buildToneFilters(clip: ExportClip, lead: number): string[] {
  const filters: string[] = [];
  const t = lead > 0 ? `t+${num(lead)}` : 't';
  const contrast = keyframeExpr(clip.keyframes, 'contrast', t);
  if (contrast !== null) {
    filters.push(`eq=contrast='${contrast}':saturation='${contrast}':eval=frame`);
  }

  const st = staticTransform(clip);
  const opacityKf = keyframeExpr(clip.keyframes, 'opacity', t);
  const brightness = keyframeExpr(clip.keyframes, 'brightness', t);
  const staticOpacity = Math.max(0, Math.min(1, st.opacity));
  if (opacityKf === null && brightness === null) {
    if (staticOpacity < 0.999) filters.push(eqMultiply(num(staticOpacity), false));
    return filters;
  }
  const opacity = opacityKf !== null ? `clip(${opacityKf},0,1)` : num(staticOpacity);
  const m = brightness !== null ? `(${opacity})*max(0,${brightness})` : opacity;
  filters.push(eqMultiply(m, true));
  return filters;
}

/**
 * All per-clip visual filters for a base-track clip: geometry (transform +
 * keyframes) followed by tone (contrast / brightness / opacity keyframes).
 */
export function buildBaseClipTransformFilters(
  clip: ExportClip,
  W: number,
  H: number,
  fps: number,
  /** Timeline seconds of the clip already skipped before this segment. */
  timeOffset = 0,
): string[] {
  return [...buildGeometryFilters(clip, W, H, fps, timeOffset), ...buildToneFilters(clip, timeOffset)];
}
