/**
 * Base video track → one continuous video stream (+ its embedded audio).
 *
 * The timeline is laid out on the output frame grid: each clip occupies
 * round(end·fps) − round(start·fps) frames, gaps are black, and the audio
 * segments use the matching sample boundaries — so the concat always lands
 * every clip on its timeline position (no drift from speed or rounding).
 *
 * Embedded audio follows the preview rules (lib/trackAudio.ts): the base
 * track's mute/solo, the clip's mute / extracted / separated-copy flags, and
 * the source actually having an audio stream. Clips without audio (images,
 * muted, silent sources) contribute silence instead of dropping the audio of
 * every other clip.
 */

import type { ExportClip, ExportTrack } from './types';
import {
  appendBaseClipVideo, junctionTransition, segmentSourceRange,
  type ClipSegmentSpec, type FrameSpec,
} from './base-clip-chain';
import {
  AUDIO_NORMALIZE, EXPORT_SAMPLE_RATE, atempoChain, clipVolumeFilter,
  buildAudioEffectFilters, buildTransitionAudioFilters,
} from './audio-filters';
import { type GraphContext, sourceHasAudio, takeAudioSrc, takeVideoSrc } from './graph-context';
import { num } from './keyframe-expr';

export type BaseSegment =
  | { kind: 'gap'; startFrame: number; frames: number }
  | { kind: 'clip'; startFrame: number; spec: ClipSegmentSpec };

/** Frame index of a timeline time on the output grid. */
export function frameAt(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

/** Sample index of a frame boundary (keeps audio and video boundaries aligned). */
function sampleAtFrame(frame: number, fps: number): number {
  return Math.round((frame / fps) * EXPORT_SAMPLE_RATE);
}

/** Lay the base clips out on the frame grid, filling gaps up to `duration`. */
export function planBaseSegments(clips: ExportClip[], fps: number, duration: number): BaseSegment[] {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const segments: BaseSegment[] = [];
  let cur = 0;
  for (const clip of sorted) {
    const startF = frameAt(clip.startTime, fps);
    const endF = frameAt(clip.endTime, fps);
    const segStart = Math.max(startF, cur);
    const frames = endF - segStart;
    if (frames <= 0) continue;
    if (segStart > cur) segments.push({ kind: 'gap', startFrame: cur, frames: segStart - cur });
    segments.push({
      kind: 'clip',
      startFrame: segStart,
      spec: { clip, frames, leadSeconds: (segStart - startF) / fps },
    });
    cur = segStart + frames;
  }
  const totalF = frameAt(duration, fps);
  if (totalF > cur) segments.push({ kind: 'gap', startFrame: cur, frames: totalF - cur });
  return segments;
}

/** Whether a base clip contributes its embedded audio (see header). */
export function clipContributesAudio(
  clip: ExportClip,
  baseTrackAudible: boolean,
  ctx: Pick<GraphContext, 'sourcesWithAudio'>,
): boolean {
  return baseTrackAudible &&
    clip.mediaType !== 'image' &&
    !clip.muted &&
    !clip.audioHandledExternally &&
    !!clip.sourceUrl &&
    (!ctx.sourcesWithAudio || ctx.sourcesWithAudio.has(clip.sourceUrl));
}

export interface BaseTimelineResult {
  videoLabel: string;
  /** null when no base clip contributes audio. */
  audioLabel: string | null;
}

function silence(samples: number, label: string): string {
  return `anullsrc=channel_layout=stereo:sample_rate=${EXPORT_SAMPLE_RATE},` +
    `atrim=end_sample=${samples},asetpts=PTS-STARTPTS,${AUDIO_NORMALIZE}[${label}]`;
}

export function buildBaseTimeline(
  ctx: GraphContext,
  segments: BaseSegment[],
  baseTrack: ExportTrack | null,
  baseTrackAudible: boolean,
  frame: FrameSpec,
): BaseTimelineResult {
  const { width: W, height: H, fps } = frame;
  const { filterParts } = ctx;
  const withAudio = segments.some(
    (s) => s.kind === 'clip' && clipContributesAudio(s.spec.clip, baseTrackAudible, ctx),
  );

  const vLabels: string[] = [];
  const aLabels: string[] = [];
  const durations: number[] = [];
  const segClips: Array<ExportClip | null> = [];

  segments.forEach((seg, i) => {
    const frames = seg.kind === 'gap' ? seg.frames : seg.spec.frames;
    const samples = sampleAtFrame(seg.startFrame + frames, fps) - sampleAtFrame(seg.startFrame, fps);
    durations.push(frames / fps);

    if (seg.kind === 'gap') {
      const v = `gap${i}`;
      filterParts.push(
        `color=c=black:s=${W}x${H}:r=${num(fps)},trim=end_frame=${frames},setsar=1,format=yuv420p[${v}]`,
      );
      vLabels.push(v);
      segClips.push(null);
      if (withAudio) {
        filterParts.push(silence(samples, `agap${i}`));
        aLabels.push(`agap${i}`);
      }
      return;
    }

    const { clip } = seg.spec;
    const inputIdx = ctx.inputMap.get(clip.sourceUrl)!;
    vLabels.push(appendBaseClipVideo(seg.spec, frame, takeVideoSrc(ctx, inputIdx), `v${i}`, filterParts));
    segClips.push(clip);
    if (!withAudio) return;

    const aLabel = `a${i}`;
    if (!clipContributesAudio(clip, baseTrackAudible, ctx) || !sourceHasAudio(ctx, clip.sourceUrl)) {
      filterParts.push(silence(samples, aLabel));
    } else {
      const range = segmentSourceRange(seg.spec, fps);
      const lead = seg.spec.leadSeconds;
      const af: string[] = [
        `atrim=start=${num(range.start)}:end=${num(range.end)}`,
        'asetpts=PTS-STARTPTS',
        AUDIO_NORMALIZE,
        ...atempoChain(clip.speed || 1),
      ];
      const volume = clipVolumeFilter(
        baseTrack?.volume ?? 1,
        clip.volume ?? 1,
        lead > 0 ? clip.keyframes?.map((k) => ({ ...k, time: k.time - lead })) : clip.keyframes,
      );
      if (volume) af.push(volume);
      af.push(...buildTransitionAudioFilters(clip.effects, frames / fps));
      af.push(...buildAudioEffectFilters(clip.effects));
      af.push(AUDIO_NORMALIZE, 'apad', `atrim=end_sample=${samples}`, 'asetpts=PTS-STARTPTS');
      filterParts.push(`[${takeAudioSrc(ctx, inputIdx)}]${af.join(',')}[${aLabel}]`);
    }
    aLabels.push(aLabel);
  });

  if (vLabels.length === 0) {
    // Zero-length timeline guard: one black frame so the graph stays valid.
    filterParts.push(`color=c=black:s=${W}x${H}:r=${num(fps)},trim=end_frame=1,format=yuv420p[outv]`);
    return { videoLabel: 'outv', audioLabel: null };
  }

  joinSegments(filterParts, vLabels, withAudio ? aLabels : null, durations, segClips);
  return { videoLabel: 'outv', audioLabel: withAudio ? 'outa' : null };
}

/**
 * Concat the segments, using xfade/acrossfade at clip junctions that carry a
 * transition (adjacent clips only — never across a gap).
 */
function joinSegments(
  filterParts: string[],
  vLabels: string[],
  aLabels: string[] | null,
  durations: number[],
  segClips: Array<ExportClip | null>,
): void {
  const n = vLabels.length;
  const hasJunction = segClips.some((c, i) => i > 0 && junctionTransition(segClips[i - 1], c) !== null);

  if (!hasJunction) {
    if (aLabels) {
      const inter = vLabels.map((v, i) => `[${v}][${aLabels[i]}]`).join('');
      filterParts.push(`${inter}concat=n=${n}:v=1:a=1[outv][outa]`);
    } else {
      filterParts.push(`${vLabels.map((v) => `[${v}]`).join('')}concat=n=${n}:v=1:a=0[outv]`);
    }
    return;
  }

  let prevV = vLabels[0];
  let prevA = aLabels ? aLabels[0] : '';
  let acc = durations[0];
  for (let i = 1; i < n; i++) {
    const tr = junctionTransition(segClips[i - 1], segClips[i]);
    if (tr) {
      const offset = Math.max(0, acc - tr.duration);
      filterParts.push(
        `[${prevV}][${vLabels[i]}]xfade=transition=${tr.type}:duration=${tr.duration}:offset=${offset.toFixed(4)}[xfv${i}]`,
      );
      prevV = `xfv${i}`;
      if (aLabels) {
        filterParts.push(`[${prevA}][${aLabels[i]}]acrossfade=d=${tr.duration}:c1=tri:c2=tri[xfa${i}]`);
        prevA = `xfa${i}`;
      }
      acc = acc - tr.duration + durations[i];
    } else {
      if (aLabels) {
        filterParts.push(`[${prevV}][${prevA}][${vLabels[i]}][${aLabels[i]}]concat=n=2:v=1:a=1[catv${i}][cata${i}]`);
        prevA = `cata${i}`;
      } else {
        filterParts.push(`[${prevV}][${vLabels[i]}]concat=n=2:v=1:a=0[catv${i}]`);
      }
      prevV = `catv${i}`;
      acc += durations[i];
    }
  }
  filterParts.push(`[${prevV}]copy[outv]`);
  if (aLabels) filterParts.push(`[${prevA}]acopy[outa]`);
}
