/**
 * Compound / nested clip creation (Ctrl+G, Nest).
 *
 * Selected clips are grouped by track type: video-track clips become one
 * compound on a video track, audio-track clips one compound on an audio track,
 * and so on, so a video clip never lands on an audio track (or the reverse).
 * When exactly one video and one audio compound result they are linked.
 * Clips on locked tracks are left where they are.
 */

import type { Clip, CompoundClip, Track, VideoClip } from '@/types/editor.types';
import { pruneDanglingLinks } from './clipTiming';

export interface CompoundOptions {
  mode: 'compound' | 'nest';
  newId: () => string;
}

export interface CompoundResult {
  tracks: Track[];
  compounds: CompoundClip[];
}

export function buildCompoundClips(tracks: Track[], selectedIds: string[], opts: CompoundOptions): CompoundResult | null {
  const selected = new Set(selectedIds);
  const collected: { clip: Clip; track: Track }[] = [];
  for (const track of tracks) {
    if (track.locked) continue;
    for (const clip of track.clips) if (selected.has(clip.id)) collected.push({ clip, track });
  }
  const minTotal = opts.mode === 'compound' ? 2 : 1;
  if (collected.length < minTotal) return null;

  // Group by track type, keeping the order in which types first appear.
  const groups = new Map<Track['type'], { clip: Clip; track: Track }[]>();
  for (const item of collected) {
    const list = groups.get(item.track.type) ?? [];
    list.push(item);
    groups.set(item.track.type, list);
  }

  const compounds: CompoundClip[] = [];
  const placement = new Map<string, CompoundClip[]>();
  for (const items of groups.values()) {
    const ordered = opts.mode === 'nest'
      ? [...items].sort((a, b) => a.clip.startTime - b.clip.startTime)
      : items;
    const start = Math.min(...ordered.map((c) => c.clip.startTime));
    const end = Math.max(...ordered.map((c) => c.clip.endTime));
    const home = ordered[0].track;
    const innerClips = ordered.map((c) => ({
      ...c.clip,
      startTime: c.clip.startTime - start,
      endTime: c.clip.endTime - start,
    } as Clip));
    const innerTrackIds = [...new Set(ordered.map((c) => c.track.id))];
    const innerTracks = innerTrackIds.map((tid) => {
      const t = tracks.find((tr) => tr.id === tid)!;
      return { ...t, clips: innerClips.filter((ic) => ic.trackId === tid) };
    });
    const firstVideo = ordered.find((c) => c.clip.type === 'video');
    const n = ordered.length;
    const compound: CompoundClip = {
      id: opts.newId(),
      trackId: home.id,
      type: 'compound',
      startTime: start,
      endTime: end,
      sourceStartTime: 0,
      sourceEndTime: end - start,
      name: opts.mode === 'nest' ? `Nested (${n} clip${n === 1 ? '' : 's'})` : `Compound (${n} clips)`,
      innerClips,
      innerTracks,
      thumbnailUrl: firstVideo ? (firstVideo.clip as VideoClip).thumbnailUrl : undefined,
    };
    compounds.push(compound);
    placement.set(home.id, [...(placement.get(home.id) ?? []), compound]);
  }

  const videoCompounds = compounds.filter((c) => tracks.find((t) => t.id === c.trackId)?.type === 'video');
  const audioCompounds = compounds.filter((c) => tracks.find((t) => t.id === c.trackId)?.type === 'audio');
  if (videoCompounds.length === 1 && audioCompounds.length === 1) {
    videoCompounds[0].linkedClipId = audioCompounds[0].id;
    audioCompounds[0].linkedClipId = videoCompounds[0].id;
  }

  const removed = new Set(collected.map((c) => c.clip.id));
  const next = tracks.map((t) => {
    const added = placement.get(t.id) ?? [];
    if (added.length === 0 && !t.clips.some((c) => removed.has(c.id))) return t;
    return { ...t, clips: [...t.clips.filter((c) => !removed.has(c.id)), ...added] };
  });
  return { tracks: pruneDanglingLinks(next), compounds };
}
