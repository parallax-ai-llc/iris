/**
 * Compound / nested clips → plain clips on timeline time, for rendering.
 *
 * A CompoundClip keeps its contents in `innerClips` (times relative to the
 * compound's own start) plus `innerTracks` (track metadata / order). Neither
 * the preview compositor nor the export renderer understands compounds, so
 * both render `flattenCompoundClips(tracks)` instead of the raw tracks:
 *
 *   - inner time → timeline time: t + compound.startTime − compound.sourceStartTime
 *     (sourceStartTime moves when the compound's head is trimmed);
 *   - inner clips are cut to the compound's [startTime, endTime) window, with
 *     source times / keyframes shifted the same way a trim would;
 *   - the first inner track whose type matches the host track merges into the
 *     host (so the host keeps its base-track role and its audio); the other
 *     inner tracks become virtual tracks placed just above the host, in their
 *     original order;
 *   - nested compounds are flattened recursively.
 *
 * Flattened clip ids are prefixed with the compound id so a duplicated
 * compound never yields two clips with the same id.
 */

import type { Clip, CompoundClip, Track } from '@/types/editor.types';

type Speedy = { speed?: number; keyframes?: Array<{ time: number }> };

/** Map one inner clip into the compound's timeline window (null if outside). */
function placeInnerClip(clip: Clip, compound: CompoundClip, trackId: string): Clip | null {
  const offset = compound.startTime - compound.sourceStartTime;
  const s = clip.startTime + offset;
  const e = clip.endTime + offset;
  const cs = Math.max(s, compound.startTime);
  const ce = Math.min(e, compound.endTime);
  if (ce - cs <= 1e-6) return null;

  const speed = (clip as Speedy).speed ?? 1;
  const leftTrim = cs - s;
  const rightTrim = e - ce;
  const placed = {
    ...clip,
    id: `${compound.id}/${clip.id}`,
    trackId,
    startTime: cs,
    endTime: ce,
    sourceStartTime: clip.sourceStartTime + leftTrim * speed,
    sourceEndTime: clip.sourceEndTime - rightTrim * speed,
  } as Clip;
  const kfs = (clip as Speedy).keyframes;
  if (leftTrim > 0 && Array.isArray(kfs)) {
    (placed as Speedy).keyframes = kfs.map((k) => ({ ...k, time: k.time - leftTrim }));
  }
  return placed;
}

/** Inner tracks of a compound (in inner time), each holding its inner clips. */
function innerTracksOf(compound: CompoundClip, host: Track): Track[] {
  const byTrack = new Map<string, Clip[]>();
  for (const c of compound.innerClips ?? []) {
    const list = byTrack.get(c.trackId) ?? [];
    list.push(c);
    byTrack.set(c.trackId, list);
  }
  const ordered: Track[] = [];
  for (const meta of compound.innerTracks ?? []) {
    if (!byTrack.has(meta.id)) continue;
    ordered.push({ ...meta, clips: byTrack.get(meta.id)! });
    byTrack.delete(meta.id);
  }
  // Clips whose track metadata is missing render on a track like the host.
  byTrack.forEach((clips, id) => ordered.push({ ...host, id, clips }));
  return ordered;
}

/** Expand one compound into timeline-time tracks (recursively flattened). */
function expandCompound(compound: CompoundClip, host: Track): Track[] {
  const inner = flattenCompoundClips(innerTracksOf(compound, host));
  return inner.map((t) => {
    const id = `${host.id}::${compound.id}::${t.id}`;
    return {
      ...t,
      id,
      muted: host.muted || t.muted,
      solo: host.solo,
      visible: host.visible && t.visible !== false,
      clips: t.clips
        .map((c) => placeInnerClip(c, compound, id))
        .filter((c): c is Clip => c !== null),
    };
  });
}

export function flattenCompoundClips(tracks: Track[]): Track[] {
  if (!tracks.some((t) => t.clips.some((c) => c.type === 'compound'))) return tracks;

  const out: Track[] = [];
  for (const track of tracks) {
    const compounds = track.clips.filter((c): c is CompoundClip => c.type === 'compound');
    if (compounds.length === 0) {
      out.push(track);
      continue;
    }
    const hostClips: Clip[] = track.clips.filter((c) => c.type !== 'compound');
    const above: Track[] = [];
    for (const compound of compounds) {
      let merged = false;
      for (const inner of expandCompound(compound, track)) {
        if (!merged && inner.type === track.type) {
          hostClips.push(...inner.clips.map((c) => ({ ...c, trackId: track.id }) as Clip));
          merged = true;
        } else {
          above.push(inner);
        }
      }
    }
    hostClips.sort((a, b) => a.startTime - b.startTime);
    out.push(...above, { ...track, clips: hostClips });
  }
  return out;
}

/**
 * Id of the timeline clip that owns a rendered clip: flattened compound
 * contents select their compound (the inner clip is not on the timeline).
 */
export function editableClipId(renderedClipId: string): string {
  const i = renderedClipId.indexOf('/');
  return i < 0 ? renderedClipId : renderedClipId.slice(0, i);
}
