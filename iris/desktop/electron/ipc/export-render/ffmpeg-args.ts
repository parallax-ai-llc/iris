/**
 * ExportRequest → FFmpeg argument list.
 *
 * Compositing model (matches EditorPreview.tsx):
 *   - tracks[0] is the top layer. The base video is the bottom-most video track
 *     with a non-image clip; every other video/image clip is an overlay.
 *   - Track mute/solo are audio controls only — a muted video track still
 *     renders its pictures (hidden tracks are dropped by the renderer).
 *   - Audio: base-track embedded audio + audio/music track clips, gated by the
 *     shared rules in src/features/video-editor/lib/trackAudio.ts.
 *
 * Everything goes through one filter_complex graph:
 *   base timeline (base-timeline.ts) → overlays (../export-overlays.ts) →
 *   adjustment effects → subtitle PNGs / ASS → encoder.
 *
 * Pure (no electron import) so it can be exercised with a real FFmpeg in tests.
 */

import path from 'path';
import type { ExportClip, ExportRenderExtras, ExportRequest, ExportTrack } from './types';
import { buildOverlayCompositor, type OverlayClip, type OverlayTrack } from '../export-overlays';
import { buildEffectFilters } from './video-effect-filters';
import { getQualityParams } from './quality';
import { buildAssContent, type SubClip } from './ass-subtitles';
import { type GraphContext, countUse, emitSplits, sourceHasAudio } from './graph-context';
import { buildBaseTimeline, clipContributesAudio, planBaseSegments } from './base-timeline';
import { mixExternalAudio, type ExternalAudioClip } from './audio-mix';
import { num } from './keyframe-expr';
// Shared with the preview — relative path only.
import { isTrackAudible } from '../../../src/features/video-editor/lib/trackAudio';

export interface BuildArgsOptions {
  /** Directory for the burned-subtitle ASS file (FFmpeg runs with it as cwd). */
  tempDir?: string;
}

const isRealVideo = (c: ExportClip) => c.mediaType !== 'image' && !!c.sourceUrl;

function overlayClipOf(c: ExportClip): OverlayClip {
  return {
    id: c.id,
    mediaType: c.mediaType,
    startTime: c.startTime,
    endTime: c.endTime,
    sourceStartTime: c.sourceStartTime,
    sourceEndTime: c.sourceEndTime,
    sourceUrl: c.sourceUrl,
    sourceWidth: c.sourceWidth,
    sourceHeight: c.sourceHeight,
    speed: c.speed,
    muted: c.muted,
    effects: c.effects,
    transform: c.transform,
    blendMode: c.blendMode,
  };
}

/** Pick the base track and split every other visual clip into overlay layers. */
function partitionVideo(tracks: ExportTrack[]) {
  const videoTracks = tracks
    .map((track, storeIndex) => ({ track, storeIndex }))
    .filter(({ track }) => track.type === 'video');

  let baseTrack: ExportTrack | null = null;
  for (let i = videoTracks.length - 1; i >= 0; i--) {
    if (videoTracks[i].track.clips.some((c) => c.type === 'video' && isRealVideo(c))) {
      baseTrack = videoTracks[i].track;
      break;
    }
  }

  const overlayTracks: OverlayTrack[] = [];
  for (const { track, storeIndex } of videoTracks) {
    const isBase = track === baseTrack;
    const clips = track.clips
      .filter((c) => c.sourceUrl && (isBase ? c.mediaType === 'image' : (c.type === 'video' || c.mediaType === 'image')))
      .map(overlayClipOf);
    if (clips.length > 0) overlayTracks.push({ id: track.id, trackIndex: storeIndex, clips });
  }

  const baseClips = baseTrack ? baseTrack.clips.filter((c) => c.type === 'video' && isRealVideo(c)) : [];
  return { baseTrack, baseClips, overlayTracks };
}

export function buildFFmpegArgs(
  request: ExportRequest,
  sourcesWithAudio?: Set<string>,
  options: BuildArgsOptions = {},
): string[] {
  const args: string[] = ['-y'];
  const W = Math.max(2, Math.floor(request.width / 2) * 2);
  const H = Math.max(2, Math.floor(request.height / 2) * 2);
  const fps = request.frameRate;
  const frame = { width: W, height: H, fps };
  const tracks = request.tracks;
  const isGif = request.format === 'gif';

  const ctx: GraphContext = {
    filterParts: [],
    inputMap: new Map(),
    videoSplitQueue: new Map(),
    audioSplitQueue: new Map(),
    sourcesWithAudio,
  };

  const { baseTrack, baseClips, overlayTracks } = partitionVideo(tracks);
  // GIF has no audio stream — build no audio chains at all (an unmapped
  // audio label would be an unconnected filter output).
  const baseAudible = !isGif && baseTrack ? isTrackAudible(baseTrack, tracks) : false;
  const segments = planBaseSegments(baseClips, fps, request.duration);

  const externalAudio: ExternalAudioClip[] = [];
  for (const track of tracks) {
    if (isGif || (track.type !== 'audio' && track.type !== 'music')) continue;
    if (!isTrackAudible(track, tracks)) continue;
    for (const clip of track.clips) {
      if ((clip.type !== 'audio' && clip.type !== 'music') || !clip.sourceUrl || clip.muted) continue;
      if (!sourceHasAudio(ctx, clip.sourceUrl)) continue;
      externalAudio.push({ clip, track });
    }
  }

  // ── Inputs (all registered up front so split fan-outs see every consumer) ──
  let nextInput = 0;
  const register = (clip: { sourceUrl: string; mediaType?: string }) => {
    if (ctx.inputMap.has(clip.sourceUrl)) return;
    if (clip.mediaType === 'image') {
      // Still image: loop; the image2 demuxer is forced because downloaded
      // assets may carry a misleading extension.
      args.push('-loop', '1', '-f', 'image2', '-framerate', String(fps));
    }
    args.push('-i', clip.sourceUrl);
    ctx.inputMap.set(clip.sourceUrl, nextInput++);
  };
  segments.forEach((s) => { if (s.kind === 'clip') register(s.spec.clip); });
  overlayTracks.forEach((t) => t.clips.forEach(register));
  externalAudio.forEach(({ clip }) => register(clip));

  const videoUses = new Map<number, number>();
  const audioUses = new Map<number, number>();
  segments.forEach((s) => {
    if (s.kind !== 'clip') return;
    const idx = ctx.inputMap.get(s.spec.clip.sourceUrl);
    countUse(videoUses, idx);
    if (clipContributesAudio(s.spec.clip, baseAudible, ctx)) countUse(audioUses, idx);
  });
  overlayTracks.forEach((t) => t.clips.forEach((c) => countUse(videoUses, ctx.inputMap.get(c.sourceUrl))));
  externalAudio.forEach(({ clip }) => countUse(audioUses, ctx.inputMap.get(clip.sourceUrl)));
  emitSplits(ctx, videoUses, audioUses);

  // ── Base timeline + audio mix ──────────────────────────────────────────────
  const base = buildBaseTimeline(ctx, segments, baseTrack, baseAudible, frame);
  const finalAudioLabel = mixExternalAudio(ctx, externalAudio, base.audioLabel);
  const { filterParts } = ctx;
  let videoOut = base.videoLabel;

  // ── Overlays ───────────────────────────────────────────────────────────────
  if (overlayTracks.length > 0) {
    const extraInputArgs: string[] = [];
    const nextInputIndex = { value: nextInput };
    const finalOverlay = buildOverlayCompositor(
      overlayTracks,
      {
        projectWidth: W,
        projectHeight: H,
        frameRate: fps,
        accLabel: videoOut,
        filterParts,
        inputMap: ctx.inputMap,
        nextInputIndex,
        extraInputArgs,
        videoSplitQueue: ctx.videoSplitQueue,
        audioSplitQueue: ctx.audioSplitQueue,
      },
      buildEffectFilters,
    );
    filterParts.push(`[${finalOverlay}]format=yuv420p[outv_composite]`);
    videoOut = 'outv_composite';
    args.push(...extraInputArgs); // all overlay sources are pre-registered; kept for safety
    nextInput = nextInputIndex.value;
  }

  // ── Adjustment track effects (whole frame) ─────────────────────────────────
  const adjFilters = buildEffectFilters(
    tracks.filter((t) => t.type === 'adjustment' && !t.muted).flatMap((t) => t.clips.flatMap((c) => c.effects ?? [])),
  );
  if (adjFilters.length > 0) {
    filterParts.push(`[${videoOut}]${adjFilters.join(',')}[outv_adj]`);
    videoOut = 'outv_adj';
  }

  // ── Subtitles: renderer-rasterised PNGs (pixel-exact) or ASS fallback ──────
  const subtitleOverlays = (request.subtitleOverlays ?? []).filter(
    (s) => s.pngPath && s.endTime - s.startTime > 0,
  );
  subtitleOverlays.forEach((sub, si) => {
    args.push('-loop', '1', '-f', 'image2', '-framerate', String(fps), '-i', sub.pngPath!);
    const proc = `subpng${si}_proc`;
    const comp = `subpng${si}_comp`;
    filterParts.push(
      `[${nextInput}:v]trim=end=${(sub.endTime - sub.startTime).toFixed(4)},setpts=PTS-STARTPTS,fps=${num(fps)},format=rgba[${proc}]`,
    );
    const enable = `between(t,${sub.startTime.toFixed(4)},${sub.endTime.toFixed(4)})`;
    filterParts.push(`[${videoOut}][${proc}]overlay=0:0:enable='${enable}'[${comp}]`);
    videoOut = comp;
    nextInput++;
  });

  const hasSubtitlePngs = !!(request.subtitleOverlays && request.subtitleOverlays.length > 0);
  if (request.includeSubtitles && request.subtitleFormat === 'burned' && !isGif && !hasSubtitlePngs) {
    const allSubs = tracks
      .filter((t) => t.type === 'subtitle')
      .flatMap((t) => t.clips)
      .filter((c) => c.text)
      .sort((a, b) => a.startTime - b.startTime);
    if (allSubs.length > 0) {
      const extras = request as ExportRequest & ExportRenderExtras;
      const assDir = options.tempDir ?? '.';
      const assFileName = `iris_subs_${Date.now()}.ass`;
      filterParts.push(`[${videoOut}]ass=${assFileName}[outv_sub]`);
      videoOut = 'outv_sub';
      extras._ffmpegCwd = assDir;
      extras._assContent = buildAssContent(allSubs as SubClip[], W, H);
      extras._assPath = path.join(assDir, assFileName);
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  if (isGif) {
    filterParts.push(`[${videoOut}]fps=10,split[gs0][gs1];[gs0]palettegen[gp];[gs1][gp]paletteuse[gifout]`);
    args.push('-filter_complex', filterParts.join(';'), '-map', '[gifout]', '-loop', '0');
  } else {
    args.push('-filter_complex', filterParts.join(';'), '-map', `[${videoOut}]`);
    if (finalAudioLabel) args.push('-map', finalAudioLabel);
    args.push(...getQualityParams(request.quality, request.format, request.codec, request.proResProfile));
    args.push('-r', String(fps));
  }
  args.push('-t', String(request.duration));
  args.push(request.outputPath);
  return args;
}
