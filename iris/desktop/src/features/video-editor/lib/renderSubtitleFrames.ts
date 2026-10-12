/**
 * Animated subtitle → one full-frame PNG per output frame.
 *
 * Output frame f (export timeline, frames from round(startTime·fps) up to
 * round(endTime·fps)) shows the subtitle as the preview draws it at clip time
 * f/fps + clipTimeOffset. Identical frames (typewriter steps, a settled
 * bounce, …) are rasterised once; `frameIndex` maps every output frame to its
 * image. The export handler writes them as an image2 sequence and FFmpeg
 * overlays it frame-exact (electron/ipc/export-render/ffmpeg-args.ts).
 */

import type { SubtitleClip } from '@/types/editor.types';
import { buildSubtitleSvg, rasterizeSubtitleSvg } from './renderSubtitlePng';

export interface SubtitleFrameSequence {
  frameDataUrls: string[];
  frameIndex: number[];
}

export async function renderSubtitleClipFrames(
  clip: SubtitleClip,
  width: number,
  height: number,
  fps: number,
  /** Export-timeline slot of the clip (seconds). */
  startTime: number,
  endTime: number,
  /** Clip time at export time 0 (range start − clip start). */
  clipTimeOffset: number,
): Promise<SubtitleFrameSequence> {
  const first = Math.round(startTime * fps);
  const last = Math.round(endTime * fps);
  const byKey = new Map<string, number>();
  const frameDataUrls: string[] = [];
  const frameIndex: number[] = [];
  for (let f = first; f < last; f++) {
    const svg = buildSubtitleSvg(clip, width, height, { time: f / fps + clipTimeOffset });
    let idx = byKey.get(svg);
    if (idx === undefined) {
      idx = frameDataUrls.length;
      frameDataUrls.push(await rasterizeSubtitleSvg(svg, width, height));
      byKey.set(svg, idx);
    }
    frameIndex.push(idx);
  }
  return { frameDataUrls, frameIndex };
}
