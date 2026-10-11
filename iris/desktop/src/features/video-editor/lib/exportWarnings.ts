/**
 * Edits the preview shows but the FFmpeg export cannot reproduce yet.
 *
 * The Export modal lists these before rendering so the user knows the file
 * will differ from the preview (never silently dropped):
 *   - speed keyframes / time remapping → exported at the clip's base speed
 *   - blur keyframes                   → exported without the animated blur
 *   - animated subtitles               → rasterised once (static text)
 * Everything else the preview animates on the base clip (opacity, position,
 * scale, rotation, volume, brightness, contrast keyframes) is exported.
 */

import type { SubtitleClip, Track, VideoClip } from '@/types/editor.types';
import { flattenCompoundClips } from './flattenCompoundClips';

export interface ExportFidelityWarnings {
  speedKeyframes: number;
  blurKeyframes: number;
  subtitleAnimations: number;
}

export function collectExportWarnings(tracks: Track[]): ExportFidelityWarnings {
  const result: ExportFidelityWarnings = { speedKeyframes: 0, blurKeyframes: 0, subtitleAnimations: 0 };
  for (const track of flattenCompoundClips(tracks)) {
    if (track.visible === false) continue;
    for (const clip of track.clips) {
      if (clip.type === 'video') {
        const vc = clip as VideoClip;
        const kfs = vc.keyframes ?? [];
        if (kfs.some((k) => k.property === 'speed') || (vc.timeRemappingKeyframes?.length ?? 0) > 0) {
          result.speedKeyframes++;
        }
        if (kfs.some((k) => k.property === 'blur')) result.blurKeyframes++;
      } else if (clip.type === 'subtitle') {
        const sc = clip as SubtitleClip;
        const animated = (sc.style?.animation && sc.style.animation !== 'none') ||
          (sc.animationKeyframes?.length ?? 0) > 0;
        if (animated) result.subtitleAnimations++;
      }
    }
  }
  return result;
}

export function hasExportWarnings(w: ExportFidelityWarnings): boolean {
  return w.speedKeyframes > 0 || w.blurKeyframes > 0 || w.subtitleAnimations > 0;
}
