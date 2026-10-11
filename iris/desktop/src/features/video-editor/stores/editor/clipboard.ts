/**
 * Clip clipboard: copy, paste (overwrite) and ripple delete.
 *
 * Paste is one edit: every pasted clip gets a new id, linked pairs stay linked
 * to each other (new id to new id), and whatever lies under a pasted clip on
 * its track is overwritten (trimmed/split/removed, as `overwriteEdit` does).
 * Clips whose target track is locked are skipped.
 */

import type { Clip, Track, TrackType } from '@/types/editor.types';
import { splitClipPieces, pruneDanglingLinks, findClip } from './clipTiming';

const EPS = 1e-6;

export interface ClipClipboard {
  clips: Clip[];
  trackIds: string[];
}

/** Copy the selected clips (plus their linked clips when linked selection is on). */
export function collectClipboard(tracks: Track[], selectedIds: string[], includeLinked: boolean): ClipClipboard | null {
  const ids = new Set(selectedIds);
  if (includeLinked) {
    for (const id of selectedIds) {
      const linked = findClip(tracks, id)?.clip.linkedClipId;
      if (linked && findClip(tracks, linked)) ids.add(linked);
    }
  }
  const clips: Clip[] = [];
  const trackIds: string[] = [];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!ids.has(clip.id)) continue;
      clips.push(structuredClone(clip));
      trackIds.push(track.id);
    }
  }
  return clips.length > 0 ? { clips, trackIds } : null;
}

/** Remove/trim/split the clips under [start, end) so a new clip can go there. */
export function overwriteRange(clips: Clip[], start: number, end: number, newId: () => string): Clip[] {
  const out: Clip[] = [];
  for (const c of clips) {
    if (c.endTime <= start + EPS || c.startTime >= end - EPS) {
      out.push(c);
    } else if (c.startTime >= start - EPS && c.endTime <= end + EPS) {
      // fully covered: removed
    } else if (c.startTime < start && c.endTime > end) {
      const left = splitClipPieces(c, start, newId());
      const rest = left ? splitClipPieces(left[1], end, newId()) : null;
      if (left) out.push(left[0]);
      if (rest) out.push({ ...rest[1], name: `${c.name} (2)` } as Clip);
    } else if (c.startTime < start) {
      const pieces = splitClipPieces(c, start, newId());
      if (pieces) out.push(pieces[0]);
    } else {
      const pieces = splitClipPieces(c, end, newId());
      if (pieces) out.push({ ...pieces[1], id: c.id, name: c.name } as Clip);
    }
  }
  return out;
}

function trackTypeFor(clip: Clip): TrackType {
  switch (clip.type) {
    case 'audio': return 'audio';
    case 'music': return 'music';
    case 'subtitle': return 'subtitle';
    case 'adjustment': return 'adjustment';
    default: return 'video';
  }
}

export interface PasteResult {
  tracks: Track[];
  pastedIds: string[];
}

/** Paste so the earliest clipboard clip starts at `at`. Returns null when nothing could be pasted. */
export function pasteClipboard(tracks: Track[], clipboard: ClipClipboard, at: number, newId: () => string): PasteResult | null {
  if (clipboard.clips.length === 0) return null;
  const earliest = Math.min(...clipboard.clips.map((c) => c.startTime));
  const offset = at - earliest;

  // Resolve a target track for every clip (its original track, else the first
  // unlocked track of the same type); skip clips without an unlocked target.
  const placed: { clip: Clip; trackId: string }[] = [];
  const idMap = new Map<string, string>();
  clipboard.clips.forEach((clip, i) => {
    const original = tracks.find((t) => t.id === clipboard.trackIds[i]);
    const target = original && !original.locked
      ? original
      : original
        ? null
        : tracks.find((t) => t.type === trackTypeFor(clip) && !t.locked);
    if (!target) return;
    const id = newId();
    idMap.set(clip.id, id);
    placed.push({ clip, trackId: target.id });
  });
  if (placed.length === 0) return null;

  const pasted = placed.map(({ clip, trackId }) => ({
    ...structuredClone(clip),
    id: idMap.get(clip.id)!,
    trackId,
    name: `${clip.name} (copy)`,
    startTime: clip.startTime + offset,
    endTime: clip.endTime + offset,
    linkedClipId: clip.linkedClipId ? idMap.get(clip.linkedClipId) : undefined,
  } as Clip));

  const next = tracks.map((track) => {
    const mine = pasted.filter((c) => c.trackId === track.id);
    if (mine.length === 0) return track;
    let clips = track.clips;
    for (const c of mine) clips = overwriteRange(clips, c.startTime, c.endTime, newId);
    return { ...track, clips: [...clips, ...mine] };
  });
  return { tracks: pruneDanglingLinks(next), pastedIds: pasted.map((c) => c.id) };
}

/**
 * Ripple delete: remove the clips (and their linked clips) and close only the
 * deleted ranges on each affected track. Other gaps, including one before the
 * first clip, stay. Locked tracks are not touched.
 */
export function rippleDeleteClips(tracks: Track[], clipIds: string[]): Track[] | null {
  const ids = new Set<string>();
  for (const id of clipIds) {
    const found = findClip(tracks, id);
    if (!found || found.track.locked) continue;
    ids.add(id);
    const linked = findClip(tracks, found.clip.linkedClipId);
    if (linked && !linked.track.locked) ids.add(linked.clip.id);
  }
  if (ids.size === 0) return null;

  const next = tracks.map((track) => {
    const removed = track.clips.filter((c) => ids.has(c.id));
    if (removed.length === 0) return track;
    const remaining = track.clips
      .filter((c) => !ids.has(c.id))
      .map((c) => {
        const shift = removed
          .filter((r) => r.endTime <= c.startTime + EPS)
          .reduce((sum, r) => sum + (r.endTime - r.startTime), 0);
        return shift > EPS ? ({ ...c, startTime: c.startTime - shift, endTime: c.endTime - shift } as Clip) : c;
      });
    return { ...track, clips: remaining };
  });
  return pruneDanglingLinks(next);
}
