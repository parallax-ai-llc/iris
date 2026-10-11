/**
 * One base-track clip → an exact-length video segment.
 *
 * Segment length is fixed by the timeline slot on the frame grid
 * (`frames` = round(end·fps) − round(start·fps)), never by the source range:
 * the source span read is `frames / fps × speed`, then the stream is padded /
 * cut to exactly `frames` frames. Consecutive segments therefore always add up
 * to the timeline, whatever the speed or the source rounding.
 *
 * Chain: trim → speed → effects → spatial transitions → fit to W×H → CFR →
 * exact length → transform/opacity/keyframes → temporal transitions, followed
 * by the multi-input stages (glow, intra-clip xfade vs black, chroma key).
 * Moved from electron/ipc/export.ts and extended.
 */

import type { ExportClip } from './types';
import { buildEffectFilters } from './video-effect-filters';
import { buildSpatialTransitionVideoFilters, buildTransitionVideoFilters } from './transition-filters';
import { buildBaseClipTransformFilters } from './clip-transform';
import { num } from './keyframe-expr';
// Pure data shared with the renderer — relative path only.
import { XFADE_MAP } from '../../../src/features/video-editor/effects/registry';

export interface ClipSegmentSpec {
  clip: ExportClip;
  /** Exact number of output frames for this segment. */
  frames: number;
  /** Timeline seconds already consumed before this segment starts inside the clip. */
  leadSeconds: number;
}

export interface FrameSpec {
  width: number;   // even
  height: number;  // even
  fps: number;
}

/** Transitions realised elsewhere (fade filter, zoompan, sendcmd blur). */
const NON_XFADE_HANDLED = new Set([
  'fade', 'dissolve', 'dip-to-black', 'dip-to-white',
  'zoom', 'cross-zoom', 'zoom-basic', 'multi-spin',
  'blur', 'blur-transition',
]);

/** Source range [start, end) read for a segment (timeline slot × speed). */
export function segmentSourceRange(seg: ClipSegmentSpec, fps: number): { start: number; end: number } {
  const speed = seg.clip.speed || 1;
  const start = seg.clip.sourceStartTime + seg.leadSeconds * speed;
  return { start, end: start + (seg.frames / fps) * speed };
}

/** Linear filter chain for the segment (input pad → exact-length frames). */
function buildLinearChain(seg: ClipSegmentSpec, frame: FrameSpec): string[] {
  const { clip, frames } = seg;
  const { width: W, height: H, fps } = frame;
  const isImage = clip.mediaType === 'image';
  const speed = clip.speed || 1;
  const duration = frames / fps;
  const chain: string[] = [];

  if (isImage) {
    // Looped still: the input already runs at `fps`, just take `frames` of it.
    chain.push(`trim=end_frame=${frames}`, 'setpts=PTS-STARTPTS');
  } else {
    const range = segmentSourceRange(seg, fps);
    // One extra source frame of margin so the last output frame has a picture.
    const margin = speed / fps;
    chain.push(`trim=start=${num(range.start)}:end=${num(range.end + margin)}`, 'setpts=PTS-STARTPTS');
    if (speed !== 1) chain.push(`setpts=${num(1 / speed)}*PTS`);
  }

  chain.push(...buildEffectFilters(clip.effects));
  // Spatial transitions (zoom/blur) must run BEFORE the output scale so the
  // fit-scale upsamples the cropped/blurred region back to W×H.
  chain.push(...buildSpatialTransitionVideoFilters(clip.effects, duration, W, H, fps));

  // Fit (object-contain) to the output frame, like the preview <video>.
  chain.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
  chain.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`);
  chain.push('setsar=1', 'format=yuv420p', `fps=${num(fps)}`);
  // Exact slot length: clone the last frame if the source runs short, then cut.
  chain.push(`tpad=stop_mode=clone:stop=${frames}`, `trim=end_frame=${frames}`, 'setpts=PTS-STARTPTS');

  chain.push(...buildBaseClipTransformFilters(clip, W, H, fps, seg.leadSeconds));
  // Temporal transitions (fade/dissolve/dip) — timing-based, safe after scale.
  chain.push(...buildTransitionVideoFilters(clip.effects, duration));
  return chain;
}

/**
 * Append the filter graph for one base clip segment. Returns the label of the
 * finished segment stream.
 */
export function appendBaseClipVideo(
  seg: ClipSegmentSpec,
  frame: FrameSpec,
  srcLabel: string,
  label: string,
  filterParts: string[],
): string {
  const { clip } = seg;
  const { width: W, height: H, fps } = frame;
  const duration = seg.frames / fps;
  filterParts.push(`[${srcLabel}]${buildLinearChain(seg, frame).join(',')}[${label}]`);
  let out = label;

  // Glow (requires split/blend — cannot be in the linear chain)
  const glowFx = clip.effects?.find((fx) => fx.enabled && fx.filterType === 'glow');
  if (glowFx) {
    const sigma = Math.max(1, Math.round((glowFx.filterIntensity ?? 50) / 10));
    const ga = `${label}ga`, gb = `${label}gb`, gc = `${label}gc`, glowOut = `${label}glow`;
    filterParts.push(
      `[${out}]split[${ga}][${gb}];[${gb}]gblur=sigma=${sigma}[${gc}];[${ga}][${gc}]blend=all_mode=addition[${glowOut}]`,
    );
    out = glowOut;
  }

  // Intra-clip xfade transitions vs a black canvas (slide/wipe/iris/...).
  //   start: black → clip (offset=0), end: clip → black (offset=dur-d)
  const xfadeFxList = (clip.effects ?? []).filter(
    (fx) =>
      fx.enabled &&
      fx.type === 'transition' &&
      fx.transitionType &&
      fx.transitionType in XFADE_MAP &&
      !NON_XFADE_HANDLED.has(fx.transitionType),
  );
  let xfStep = 0;
  for (const fx of xfadeFxList) {
    const xfType = XFADE_MAP[fx.transitionType!];
    const dur = Math.min(duration, fx.transitionDuration ?? 0.5);
    const pos = fx.transitionPosition ?? 'start';
    if (pos === 'start' || pos === 'both') {
      const bg = `${label}xfbg${xfStep}`;
      const o = `${label}xfs${xfStep}`;
      filterParts.push(`color=c=black:s=${W}x${H}:d=${duration.toFixed(4)}:r=${num(fps)},setsar=1,format=yuv420p[${bg}]`);
      filterParts.push(`[${bg}][${out}]xfade=transition=${xfType}:duration=${dur.toFixed(4)}:offset=0[${o}]`);
      out = o;
      xfStep++;
    }
    if (pos === 'end' || pos === 'both') {
      const bg = `${label}xfbg${xfStep}`;
      const o = `${label}xfe${xfStep}`;
      const offset = Math.max(0, duration - dur);
      filterParts.push(`color=c=black:s=${W}x${H}:d=${dur.toFixed(4)}:r=${num(fps)},setsar=1,format=yuv420p[${bg}]`);
      filterParts.push(`[${out}][${bg}]xfade=transition=${xfType}:duration=${dur.toFixed(4)}:offset=${offset.toFixed(4)}[${o}]`);
      out = o;
      xfStep++;
    }
  }

  // Chroma key (needs a background composite)
  const ckFx = clip.effects?.find((fx) => fx.enabled && fx.filterType === 'chroma-key');
  if (ckFx) {
    const ckP = ckFx.filterParams || {};
    const keyColor = ((ckP.keyColor as string) ?? '#00FF00').replace('#', '0x');
    const similarity = Math.max(0.01, Math.min(1.0, ((ckP.similarity as number) ?? 40) / 100));
    const blendAmt = Math.max(0, Math.min(1.0, ((ckP.smoothness as number) ?? 8) / 100));
    const ckBg = `${label}ckbg`;
    const ckOut = `${label}ck`;
    filterParts.push(`color=c=black:s=${W}x${H}:r=${num(fps)}[${ckBg}]`);
    filterParts.push(
      `[${out}]chromakey=color=${keyColor}:similarity=${similarity.toFixed(3)}:blend=${blendAmt.toFixed(3)}[${label}fg]`,
    );
    filterParts.push(`[${ckBg}][${label}fg]overlay=format=auto:shortest=1[${ckOut}]`);
    out = ckOut;
  }

  return out;
}

/** Junction transition at the start of `right` / end of `left` (xfade name + duration). */
export function junctionTransition(
  left: ExportClip | null,
  right: ExportClip | null,
): { type: string; duration: number } | null {
  if (!left || !right) return null;
  const isJunctionFx = (pos: 'start' | 'end') => (fx: NonNullable<ExportClip['effects']>[number]) =>
    fx.enabled && fx.type === 'transition' &&
    (fx.transitionPosition === pos || fx.transitionPosition === 'both') &&
    !!fx.transitionType && fx.transitionType in XFADE_MAP;
  const endFx = left.effects?.find(isJunctionFx('end'));
  const startFx = right.effects?.find(isJunctionFx('start'));
  // Prefer the right (newer) clip's start transition; fall back to the left's end.
  const fx = startFx || endFx;
  if (!fx) return null;
  return { type: XFADE_MAP[fx.transitionType!], duration: fx.transitionDuration ?? 0.5 };
}
