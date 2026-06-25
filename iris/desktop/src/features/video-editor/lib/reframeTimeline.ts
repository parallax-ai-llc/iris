/**
 * reframeTimeline — adapt a project's timeline to a new canvas resolution / aspect ratio.
 *
 * Used by "Save As" when the user picks a different ratio than the original
 * (e.g. a 16:9 landscape project saved as a 9:16 short). Elements are uniformly
 * scaled to fit the more-constrained dimension and re-centred so anything that
 * sat near the old frame edge is pulled back inside the new frame.
 *
 * Coordinate model (see EditorPreview / OverlayLayer / SubtitleOverlay):
 *  - video/image clips: `x`/`y` are project-pixel offsets from the frame centre,
 *    `scale` multiplies the base size. A *video* clip's base size is the frame
 *    itself (object-contain), so its scale must stay put — object-contain refits
 *    it to the new frame automatically. An *image* clip's base size is its
 *    natural pixel size, so its scale is multiplied by the fit factor to keep it
 *    proportional to the canvas.
 *  - subtitle clips: `textPositionX/Y` are percentages of the frame (already
 *    resolution-independent) and are kept as-is; `fontSize` is left untouched
 *    so text is never shrunk when the ratio changes.
 *  - audio / music / adjustment clips: no spatial transform — untouched.
 */

import type { TimelineData, TimelineClip } from '@/types/videoProject.types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Returns a new TimelineData with every clip's transform remapped from the old
 * canvas (oldW×oldH) to the new canvas (newW×newH). The input is not mutated.
 * No-ops (returns the same reference) when dimensions are invalid or unchanged.
 */
export function reframeTimelineData(
  timeline: TimelineData,
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
): TimelineData {
  if (!oldW || !oldH || !newW || !newH) return timeline;
  if (oldW === newW && oldH === newH) return timeline;

  // Uniform fit factor: shrink to whichever dimension is more constrained so
  // anything inside the old frame stays inside the new one. (grows if both bigger)
  const k = Math.min(newW / oldW, newH / oldH);
  const halfW = newW / 2;
  const halfH = newH / 2;

  const reframeClip = (clip: TimelineClip): TimelineClip => {
    if (clip.type === 'video' || clip.type === 'image') {
      // Images carry their natural pixel size → their scale is canvas-relative
      // and must shrink with k. Videos fill the frame → leave scale alone.
      const scaleNatural = clip.type === 'image';
      const next: TimelineClip = {
        ...clip,
        x: clamp((clip.x ?? 0) * k, -halfW, halfW),
        y: clamp((clip.y ?? 0) * k, -halfH, halfH),
      };
      if (scaleNatural) next.scale = (clip.scale ?? 1) * k;
      if (clip.keyframes?.length) {
        next.keyframes = clip.keyframes.map((kf) => {
          if (kf.property === 'x') return { ...kf, value: clamp(kf.value * k, -halfW, halfW) };
          if (kf.property === 'y') return { ...kf, value: clamp(kf.value * k, -halfH, halfH) };
          if (kf.property === 'scale' && scaleNatural) return { ...kf, value: kf.value * k };
          return kf;
        });
      }
      return next;
    }

    if (clip.type === 'subtitle') {
      // Positions are % of the frame — already ratio-independent; clamp for safety.
      // Font size is intentionally left untouched (do not shrink text on reframe).
      const next: TimelineClip = { ...clip };
      if (typeof clip.textPositionX === 'number') next.textPositionX = clamp(clip.textPositionX, 0, 100);
      if (typeof clip.textPositionY === 'number') next.textPositionY = clamp(clip.textPositionY, 0, 100);
      return next;
    }

    return clip;
  };

  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map(reframeClip),
    })),
  };
}
