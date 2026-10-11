/**
 * Speed-aware clip timing: trim, split and speed changes.
 *
 * Source time = timeline time x speed. Every edit that moves a clip edge in
 * timeline seconds (trim, roll, split, inspector Start/End) moves the matching
 * source point by `delta * speed`, so a 2x clip trimmed by 1s drops 2s of media.
 *
 * Keyframe times are clip-relative timeline seconds. When an edit moves the
 * clip start (trim-start, the second piece of a split), keyframes are re-based
 * on the new start; keyframes that fall outside a piece are dropped and the
 * value at the cut is kept as an interpolated boundary keyframe.
 */

import type { Clip, Track } from '@/types/editor.types';
import type { ClipEffect, Keyframe } from '@/types/videoProject.types';
import { hasEffects } from '@/types/editor.types';
import { interpolateKeyframes } from '@/shared/lib/utils/effectRenderer';

const EPS = 1e-6;

/** Playback speed of a clip (1 when the clip has none). 0 = freeze frame. */
export function clipSpeed(clip: Clip): number {
  const s = (clip as { speed?: number }).speed;
  return typeof s === 'number' && Number.isFinite(s) && s >= 0 ? s : 1;
}

/** Keyframes of the sub-range [from, from + length] of a clip, re-based to start at 0. */
export function rebaseKeyframes(keyframes: Keyframe[], from: number, length: number): Keyframe[] {
  if (keyframes.length === 0) return [];
  const to = from + length;
  const out: Keyframe[] = [];
  const properties = [...new Set(keyframes.map((k) => k.property))];
  for (const property of properties) {
    const kfs = keyframes.filter((k) => k.property === property).sort((a, b) => a.time - b.time);
    const inside = kfs
      .filter((k) => k.time >= from - EPS && k.time <= to + EPS)
      .map((k) => ({ ...k, time: Math.min(Math.max(k.time - from, 0), length) }));
    const before = kfs.filter((k) => k.time < from - EPS);
    const after = kfs.filter((k) => k.time > to + EPS);
    if (before.length > 0 && !inside.some((k) => Math.abs(k.time) < EPS)) {
      const prev = before[before.length - 1];
      out.push({ ...prev, time: 0, value: interpolateKeyframes(kfs, property, from) ?? prev.value });
    }
    out.push(...inside);
    if (after.length > 0 && Number.isFinite(length) && !inside.some((k) => Math.abs(k.time - length) < EPS)) {
      const prev = inside[inside.length - 1] ?? before[before.length - 1] ?? after[0];
      out.push({ ...prev, time: length, value: interpolateKeyframes(kfs, property, to) ?? after[0].value });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

function cloneEffect(e: ClipEffect): ClipEffect {
  return {
    ...e,
    filterParams: e.filterParams ? JSON.parse(JSON.stringify(e.filterParams)) : e.filterParams,
    keyframes: e.keyframes ? e.keyframes.map((k) => ({ ...k })) : e.keyframes,
  };
}

/**
 * Effects of one side of a split. A transition belongs to the edge it sits on:
 * the first piece keeps start transitions, the second keeps end transitions,
 * and a 'both' transition becomes a start (first) / end (second) transition.
 */
export function effectsForPiece(effects: ClipEffect[], keep: 'start' | 'end'): ClipEffect[] {
  const out: ClipEffect[] = [];
  for (const e of effects) {
    if (e.type !== 'transition') {
      out.push(cloneEffect(e));
      continue;
    }
    const pos = e.transitionPosition ?? 'start';
    if (pos === keep) out.push(cloneEffect(e));
    else if (pos === 'both') out.push({ ...cloneEffect(e), transitionPosition: keep });
  }
  return out;
}

/** Re-based keyframes (clip + effect keyframes) for a sub-range of the clip. */
function rebasedState(clip: Clip, from: number, length: number): Partial<Clip> {
  if (!hasEffects(clip)) return {};
  return {
    keyframes: rebaseKeyframes(clip.keyframes, from, length),
    effects: clip.effects.map((e) =>
      e.keyframes && e.keyframes.length > 0 ? { ...e, keyframes: rebaseKeyframes(e.keyframes, from, length) } : e,
    ),
  } as Partial<Clip>;
}

function independentState(clip: Clip): Partial<Clip> {
  const transform = 'transform' in clip && clip.transform ? { transform: { ...clip.transform } } : {};
  return transform as Partial<Clip>;
}

/** Split a clip at a timeline time. Returns null when the time is not strictly inside the clip. */
export function splitClipPieces(clip: Clip, splitTime: number, secondId: string): [Clip, Clip] | null {
  if (splitTime <= clip.startTime + EPS || splitTime >= clip.endTime - EPS) return null;
  const rel = splitTime - clip.startTime;
  const total = clip.endTime - clip.startTime;
  const sourceSplit = clip.sourceStartTime + rel * clipSpeed(clip);
  const fades = clip.type === 'audio' || clip.type === 'music';

  const piece = (from: number, length: number, keep: 'start' | 'end'): Partial<Clip> => {
    const rebased = rebasedState(clip, from, length) as { effects?: ClipEffect[] };
    return {
      ...independentState(clip),
      ...rebased,
      ...(rebased.effects ? { effects: effectsForPiece(rebased.effects, keep) } : {}),
    } as Partial<Clip>;
  };

  const first = {
    ...clip,
    endTime: splitTime,
    sourceEndTime: sourceSplit,
    ...piece(0, rel, 'start'),
    ...(fades ? { fadeOut: 0 } : {}),
  } as Clip;

  const second = {
    ...clip,
    id: secondId,
    name: `${clip.name} (2)`,
    startTime: splitTime,
    sourceStartTime: sourceSplit,
    ...piece(rel, total - rel, 'end'),
    ...(fades ? { fadeIn: 0 } : {}),
  } as Clip;

  return [first, second];
}

export interface TrimOptions {
  /** Images have no source length: their edges may move past the source bounds. */
  freeSource?: boolean;
}

export function isImageClip(clip: Clip): boolean {
  return clip.type === 'video' && clip.mediaType === 'image';
}

/** Move the clip start to `newStart` (timeline seconds), keeping the end. */
export function trimClipStart(clip: Clip, newStart: number, opts: TrimOptions = {}): Clip {
  const speed = clipSpeed(clip);
  let start = Math.max(0, Math.min(newStart, clip.endTime - 0.01));
  let sourceStart = clip.sourceStartTime + (start - clip.startTime) * speed;
  if (sourceStart < 0) {
    if (!opts.freeSource && speed > 0) start = clip.startTime - clip.sourceStartTime / speed;
    sourceStart = 0;
  }
  const shift = start - clip.startTime;
  if (Math.abs(shift) < EPS) return clip;
  return {
    ...clip,
    startTime: start,
    sourceStartTime: sourceStart,
    ...rebasedState(clip, shift, Infinity),
  } as Clip;
}

/** Move the clip end to `newEnd` (timeline seconds), keeping the start. */
export function trimClipEnd(clip: Clip, newEnd: number, opts: TrimOptions = {}): Clip {
  const speed = clipSpeed(clip);
  let end = Math.max(newEnd, clip.startTime + 0.01);
  let sourceEnd = clip.sourceEndTime + (end - clip.endTime) * speed;
  const max = clip.sourceDuration ?? 0;
  if (!opts.freeSource && max > 0 && sourceEnd > max && speed > 0) {
    sourceEnd = max;
    end = clip.endTime + (max - clip.sourceEndTime) / speed;
  }
  if (Math.abs(end - clip.endTime) < EPS) return clip;
  return { ...clip, endTime: end, sourceEndTime: sourceEnd } as Clip;
}

// ── Track helpers ─────────────────────────────────────────────────

export function findClip(tracks: Track[], clipId: string | null | undefined): { clip: Clip; track: Track } | null {
  if (!clipId) return null;
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, track };
  }
  return null;
}

/** Replace clips by id (clips keep their track). */
export function replaceClips(tracks: Track[], replacements: Map<string, Clip>): Track[] {
  if (replacements.size === 0) return tracks;
  return tracks.map((t) =>
    t.clips.some((c) => replacements.has(c.id))
      ? { ...t, clips: t.clips.map((c) => replacements.get(c.id) ?? c) }
      : t,
  );
}

/** Start of the first clip on the track that begins at/after `time` (Infinity when none). */
export function nextClipStart(track: Track, time: number, exclude: Set<string>): number {
  let next = Infinity;
  for (const c of track.clips) {
    if (exclude.has(c.id)) continue;
    if (c.startTime >= time - EPS && c.startTime < next) next = c.startTime;
  }
  return next;
}

/** Clear `linkedClipId`s that point at clips no longer on the timeline. */
export function pruneDanglingLinks(tracks: Track[]): Track[] {
  const ids = new Set(tracks.flatMap((t) => t.clips.map((c) => c.id)));
  let changed = false;
  const next = tracks.map((t) => {
    if (!t.clips.some((c) => c.linkedClipId && !ids.has(c.linkedClipId))) return t;
    changed = true;
    return {
      ...t,
      clips: t.clips.map((c) => (c.linkedClipId && !ids.has(c.linkedClipId) ? { ...c, linkedClipId: undefined } : c)),
    };
  });
  return changed ? next : tracks;
}

/**
 * Set the speed of a clip and its linked clip. The timeline length follows the
 * source length (`length = source / speed`); a clip never grows over the next
 * clip on its track; when it would, the speed is raised just enough to fit
 * (applied to both clips so they stay in sync). Speed 0 (freeze frame) keeps the length.
 */
export function withClipSpeed(tracks: Track[], clipId: string, speed: number, lockedIds: Set<string>): Track[] {
  const found = findClip(tracks, clipId);
  if (!found) return tracks;
  const members: { clip: Clip; track: Track }[] = [found];
  const linked = findClip(tracks, found.clip.linkedClipId);
  if (linked && !lockedIds.has(linked.clip.id)) members.push(linked);
  const memberIds = new Set(members.map((m) => m.clip.id));

  const replacements = new Map<string, Clip>();
  if (!(speed > 0)) {
    for (const m of members) replacements.set(m.clip.id, { ...m.clip, speed } as Clip);
    return replaceClips(tracks, replacements);
  }

  let effective = speed;
  for (const m of members) {
    const sourceLength = m.clip.sourceEndTime - m.clip.sourceStartTime;
    const room = nextClipStart(m.track, m.clip.startTime + EPS, memberIds) - m.clip.startTime;
    if (sourceLength / effective > room + EPS && room > EPS) effective = sourceLength / room;
  }
  for (const m of members) {
    const sourceLength = m.clip.sourceEndTime - m.clip.sourceStartTime;
    replacements.set(m.clip.id, {
      ...m.clip,
      speed: effective,
      endTime: m.clip.startTime + sourceLength / effective,
    } as Clip);
  }
  return replaceClips(tracks, replacements);
}
