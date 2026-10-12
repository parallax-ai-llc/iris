/**
 * Blur keyframes → gblur whose sigma changes per frame (sendcmd).
 *
 * The preview adds CSS `blur(<value>px)` from interpolateKeyframes(…, 'blur')
 * on top of the clip's effect filters (EditorPreview.tsx). The export uses the
 * same curve (shared interpolation in keyframeEasing.ts) and the same strength
 * mapping as the static Blur effect (video-effect-filters-basic.ts:
 * CSS blur(v px) → gblur σ = v / 5), applied right after the clip's effect
 * filters, i.e. in source pixels like the static effect.
 *
 * gblur has no per-frame expressions, so sendcmd sets `sigma` before each
 * frame whose value changed by at least SIGMA_STEP. The command targets this
 * clip's gblur INSTANCE (gblur@<tag>) so other gblur filters are untouched.
 */

import type { ExportClip } from './types';
import { keyframesOf, num } from './keyframe-expr';
// Shared with the preview — relative path only.
import { interpolateKeyframeValue } from '../../../src/shared/lib/utils/keyframeEasing';

/** CSS blur px → gblur sigma (same factor as the static Blur effect). */
export const BLUR_PX_TO_SIGMA = 1 / 5;
/** Smallest sigma change worth a command (invisible below this). */
const SIGMA_STEP = 0.05;

export function blurSigmaAt(clip: ExportClip, clipTime: number): number | null {
  const kfs = keyframesOf(clip.keyframes, 'blur');
  const px = interpolateKeyframeValue(kfs, clipTime);
  if (px === undefined) return null;
  return Math.max(0, px) * BLUR_PX_TO_SIGMA;
}

/**
 * Filters for a segment whose frames carry pts from 0 = segment start on the
 * timeline (`lead` = clip time at the segment start, `frames` at `fps`).
 */
export function buildBlurKeyframeFilters(
  clip: ExportClip,
  lead: number,
  frames: number,
  fps: number,
  tag: string,
): string[] {
  const first = blurSigmaAt(clip, lead);
  if (first === null) return [];
  const target = `gblur@${tag}`;
  const cmds: string[] = [];
  let last = first;
  for (let f = 1; f < frames; f++) {
    const sigma = blurSigmaAt(clip, lead + f / fps)!;
    if (Math.abs(sigma - last) < SIGMA_STEP && !(sigma === 0 && last !== 0)) continue;
    // Half a frame early so the frame at f/fps already gets its value.
    cmds.push(`${num((f - 0.5) / fps)} ${target} sigma ${num(Number(sigma.toFixed(3)))}`);
    last = sigma;
  }
  const filters: string[] = [];
  if (cmds.length > 0) filters.push(`sendcmd=c='${cmds.join(';')}'`);
  filters.push(`${target}=sigma=${num(Number(first.toFixed(3)))}`);
  return filters;
}
