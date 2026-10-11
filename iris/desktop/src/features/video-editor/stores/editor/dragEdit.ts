/**
 * Timeline drag edits (move, trim, roll, slip, slide, rate stretch) as pure
 * functions of the drag start state.
 *
 * Every mousemove recomputes the result from `dragState.originalTracks` (the
 * tracks when the drag started), so nothing accumulates between events and
 * cancelling is a plain restore. Linked clips follow the dragged clip; clips on
 * locked tracks never change.
 */

import type { Clip, DragState, Marker, Track } from '@/types/editor.types';
import { sortClipsByStartTime } from '@/shared/lib/utils/trackUtils';
import {
  clipSpeed,
  findClip,
  isImageClip,
  replaceClips,
  trimClipEnd,
  trimClipStart,
  withClipSpeed,
} from './clipTiming';
import { lockedClipIds } from './trackLocks';

const EPS = 1e-6;
const SNAP_THRESHOLD_PX = 8;
/** A move must exceed this before edge snapping engages (no jump on click). */
const MIN_MOVE_THRESHOLD = 0.05;
const MIN_CLIP = 0.1;

export interface SnapContext {
  playhead: number;
  markers: Marker[];
  pixelsPerSecond: number;
  gridSize: number;
  snapToGrid: boolean;
}

/**
 * Snap a time to nearby clip edges, the playhead and markers (always on), with
 * the grid as a fallback when snap-to-grid is enabled.
 */
export function snapToEdges(
  time: number,
  tracks: Track[],
  exclude: Set<string>,
  ctx: SnapContext,
): { snappedTime: number; snapTarget: number | null } {
  const threshold = SNAP_THRESHOLD_PX / ctx.pixelsPerSecond;
  let bestSnap = time;
  let bestDist = threshold;
  let snapTarget: number | null = null;

  const points: number[] = [ctx.playhead, ...ctx.markers.map((m) => m.time)];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (exclude.has(clip.id)) continue;
      points.push(clip.startTime, clip.endTime);
    }
  }
  for (const pt of points) {
    const dist = Math.abs(time - pt);
    if (dist < bestDist) {
      bestDist = dist;
      bestSnap = pt;
      snapTarget = pt;
    }
  }
  if (snapTarget === null && ctx.snapToGrid && ctx.gridSize > 0) {
    const gridSnap = Math.round(time / ctx.gridSize) * ctx.gridSize;
    if (Math.abs(time - gridSnap) < bestDist) bestSnap = gridSnap;
  }
  return { snappedTime: bestSnap, snapTarget };
}

/**
 * Clips that a move drag carries: the dragged clip, its linked clip and — when
 * the dragged clip is part of the selection — every other selected clip and
 * their linked clips. Clips on locked tracks are left out.
 */
export function moveGroupIds(tracks: Track[], clipId: string, selectedIds: string[]): string[] {
  const locked = lockedClipIds(tracks);
  const seeds = selectedIds.includes(clipId) ? [clipId, ...selectedIds.filter((id) => id !== clipId)] : [clipId];
  const group: string[] = [];
  const add = (id: string | undefined) => {
    if (!id || group.includes(id) || locked.has(id) || !findClip(tracks, id)) return;
    group.push(id);
  };
  for (const id of seeds) {
    add(id);
    if (locked.has(id)) continue;
    add(findClip(tracks, id)?.clip.linkedClipId);
  }
  return group;
}

/** Fill in the drag-start snapshot used by every later drag computation. */
export function beginDragState(dragState: DragState, tracks: Track[], selectedIds: string[]): DragState {
  return {
    ...dragState,
    originalTracks: tracks,
    moveGroupIds: dragState.operation === 'move' ? moveGroupIds(tracks, dragState.clipId, selectedIds) : undefined,
  };
}

/** Clip timing fields compared to decide whether a drag changed anything. */
function timingKey(c: Clip): string {
  return `${c.trackId}|${c.startTime}|${c.endTime}|${c.sourceStartTime}|${c.sourceEndTime}|${clipSpeed(c)}`;
}

/** True when any clip's track/timing differs between two track lists. */
export function timingChanged(before: Track[], after: Track[]): boolean {
  if (before === after) return false;
  const map = new Map<string, string>();
  for (const t of before) for (const c of t.clips) map.set(c.id, `${t.id}#${timingKey(c)}`);
  let count = 0;
  for (const t of after) {
    for (const c of t.clips) {
      count++;
      if (map.get(c.id) !== `${t.id}#${timingKey(c)}`) return true;
    }
  }
  return count !== map.size;
}

interface DragResult {
  tracks: Track[];
  snapTarget: number | null;
}

/** Trim a clip and its linked clip to the same edge time; the more restrictive clamp wins. */
function trimPair(
  primary: Clip,
  linked: Clip | null,
  edge: 'start' | 'end',
  time: number,
): Map<string, Clip> {
  const trim = (c: Clip, t: number) =>
    edge === 'start'
      ? trimClipStart(c, t, { freeSource: isImageClip(c) })
      : trimClipEnd(c, t, { freeSource: isImageClip(c) });
  const edgeOf = (c: Clip) => (edge === 'start' ? c.startTime : c.endTime);
  let p = trim(primary, time);
  const out = new Map<string, Clip>([[primary.id, p]]);
  if (linked) {
    let l = trim(linked, edgeOf(p));
    if (Math.abs(edgeOf(l) - edgeOf(p)) > EPS) {
      p = trim(primary, edgeOf(l));
      l = trim(linked, edgeOf(p));
      out.set(primary.id, p);
    }
    out.set(linked.id, l);
  }
  return out;
}

/** Recompute the timeline for a drag at `currentTime` from the drag-start snapshot. */
export function computeDrag(dragState: DragState, liveTracks: Track[], currentTime: number, ctx: SnapContext): DragResult {
  const base = dragState.originalTracks ?? liveTracks;
  const locked = lockedClipIds(base);
  const orig = findClip(base, dragState.clipId)?.clip ?? dragState.originalClip;
  const linkedFound = findClip(base, orig.linkedClipId);
  const linked = linkedFound && !locked.has(linkedFound.clip.id) ? linkedFound.clip : null;
  const exclude = new Set([orig.id, ...(orig.linkedClipId ? [orig.linkedClipId] : [])]);
  const snap = (t: number) => snapToEdges(t, base, exclude, ctx);
  const op = dragState.operation;

  if (op === 'move') {
    const group = dragState.moveGroupIds ?? [orig.id, ...(linked ? [linked.id] : [])];
    const groupSet = new Set(group);
    const duration = orig.endTime - orig.startTime;
    const grabOffset = Math.min(Math.max(0, dragState.startTime - orig.startTime), duration);
    const rawStart = currentTime - grabOffset;
    const { snappedTime, snapTarget } = Math.abs(rawStart - orig.startTime) > MIN_MOVE_THRESHOLD
      ? snapToEdges(rawStart, base, groupSet, ctx)
      : { snappedTime: rawStart, snapTarget: null };
    let delta = Math.max(0, snappedTime) - orig.startTime;
    const groupClips = group.map((id) => findClip(base, id)?.clip).filter((c): c is Clip => !!c);
    const minStart = Math.min(...groupClips.map((c) => c.startTime));
    if (minStart + delta < 0) delta = -minStart;
    const replacements = new Map<string, Clip>();
    for (const c of groupClips) {
      replacements.set(c.id, { ...c, startTime: c.startTime + delta, endTime: c.endTime + delta } as Clip);
    }
    return { tracks: replaceClips(base, replacements), snapTarget };
  }

  if (op === 'trim-start' || op === 'trim-end') {
    const edge = op === 'trim-start' ? 'start' : 'end';
    const { snappedTime, snapTarget: raw } = snap(currentTime);
    const target = edge === 'start'
      ? Math.max(0, Math.min(orig.endTime - MIN_CLIP, snappedTime))
      : Math.max(orig.startTime + MIN_CLIP, snappedTime);
    const replacements = trimPair(orig, linked, edge, target);
    const result = replacements.get(orig.id)!;
    const resultEdge = edge === 'start' ? result.startTime : result.endTime;
    const snapTarget = raw !== null && Math.abs(resultEdge - raw) < 0.001 ? raw : null;
    return { tracks: replaceClips(base, replacements), snapTarget };
  }

  if ((op === 'roll-end' || op === 'roll-start') && dragState.adjacentClipId) {
    const adj = findClip(base, dragState.adjacentClipId)?.clip ?? dragState.adjacentOriginalClip;
    if (!adj || locked.has(adj.id)) return { tracks: base, snapTarget: null };
    const free = (c: Clip) => ({ freeSource: isImageClip(c) });
    let a: Clip;
    let b: Clip;
    if (op === 'roll-end') {
      const boundary = Math.max(orig.startTime + MIN_CLIP, Math.min(adj.endTime - MIN_CLIP, currentTime));
      a = trimClipEnd(orig, boundary, free(orig));
      b = trimClipStart(adj, a.endTime, free(adj));
      if (Math.abs(b.startTime - a.endTime) > EPS) a = trimClipEnd(orig, b.startTime, free(orig));
    } else {
      const boundary = Math.max(adj.startTime + MIN_CLIP, Math.min(orig.endTime - MIN_CLIP, currentTime));
      a = trimClipStart(orig, boundary, free(orig));
      b = trimClipEnd(adj, a.startTime, free(adj));
      if (Math.abs(b.endTime - a.startTime) > EPS) a = trimClipStart(orig, b.endTime, free(orig));
    }
    return { tracks: replaceClips(base, new Map([[a.id, a], [b.id, b]])), snapTarget: null };
  }

  if (op === 'slip') {
    // Shift the source window; the timeline position stays. The shift is
    // limited so neither the clip nor its linked clip leaves its source.
    let shift = (currentTime - dragState.startTime) * clipSpeed(orig);
    for (const c of [orig, ...(linked ? [linked] : [])]) {
      shift = Math.max(shift, -c.sourceStartTime);
      const max = c.sourceDuration ?? 0;
      if (max > 0) shift = Math.min(shift, max - c.sourceEndTime);
    }
    const replacements = new Map<string, Clip>();
    for (const c of [orig, ...(linked ? [linked] : [])]) {
      replacements.set(c.id, { ...c, sourceStartTime: c.sourceStartTime + shift, sourceEndTime: c.sourceEndTime + shift } as Clip);
    }
    return { tracks: replaceClips(base, replacements), snapTarget: null };
  }

  if (op === 'slide') {
    const timeDelta = currentTime - dragState.startTime;
    const replacements = new Map<string, Clip>();
    const track = findClip(base, orig.id)?.track;
    if (track) {
      const sorted = sortClipsByStartTime(track.clips);
      const idx = sorted.findIndex((c) => c.id === orig.id);
      const prev = idx > 0 ? sorted[idx - 1] : null;
      const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
      if (prev && !locked.has(prev.id)) {
        replacements.set(prev.id, trimClipEnd(prev, Math.max(prev.startTime + MIN_CLIP, prev.endTime + timeDelta)));
      }
      if (next && !locked.has(next.id)) {
        replacements.set(next.id, trimClipStart(next, Math.min(next.endTime - MIN_CLIP, next.startTime + timeDelta)));
      }
    }
    return { tracks: replaceClips(base, replacements), snapTarget: null };
  }

  if (op === 'rate-stretch') {
    const newEnd = Math.max(orig.startTime + MIN_CLIP, currentTime);
    const sourceLength = orig.sourceEndTime - orig.sourceStartTime;
    const speed = Math.max(0.1, Math.min(8, sourceLength / (newEnd - orig.startTime)));
    return { tracks: withClipSpeed(base, orig.id, speed, locked), snapTarget: null };
  }

  return { tracks: base, snapTarget: null };
}

/** Move a clip to another track of the same type (no-op when locked, different type or overlapping). */
export function moveClipAcrossTracks(tracks: Track[], clipId: string, targetTrackId: string): Track[] {
  const found = findClip(tracks, clipId);
  if (!found || found.track.id === targetTrackId) return tracks;
  const target = tracks.find((t) => t.id === targetTrackId);
  if (!target || target.type !== found.track.type) return tracks;
  if (target.locked || found.track.locked) return tracks;
  const { clip } = found;
  if (target.clips.some((c) => clip.startTime < c.endTime && clip.endTime > c.startTime)) return tracks;
  const moved = { ...clip, trackId: targetTrackId } as Clip;
  return tracks.map((t) => {
    if (t.id === found.track.id) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
    if (t.id === targetTrackId) return { ...t, clips: [...t.clips, moved] };
    return t;
  });
}

/**
 * Resolve overlaps after a move drop.
 *
 * On the dragged clip's track: a small overlap (< half of the neighbour) snaps
 * the dragged clip next to the neighbour, a large one pushes the neighbour.
 * The snap correction is applied to the whole moved group (linked and other
 * selected clips) so linked clips stay in sync. Remaining overlaps on any
 * track push the non-moved clips to the right.
 */
export function resolveMoveDrop(tracks: Track[], primaryId: string, groupIds: string[]): Track[] {
  const group = new Set(groupIds.length > 0 ? groupIds : [primaryId]);
  const primaryFound = findClip(tracks, primaryId);
  if (!primaryFound) return tracks;

  // 1) Snap correction decided on the primary clip's track.
  const primary = primaryFound.clip;
  const others = sortClipsByStartTime(primaryFound.track.clips.filter((c) => !group.has(c.id)));
  const length = primary.endTime - primary.startTime;
  let start = primary.startTime;
  let end = primary.endTime;
  for (const other of others) {
    const overlap = Math.min(end, other.endTime) - Math.max(start, other.startTime);
    if (overlap <= 0) continue;
    if (overlap >= (other.endTime - other.startTime) / 2) continue; // pushed below
    if ((start + end) / 2 < (other.startTime + other.endTime) / 2) {
      end = other.startTime;
      start = end - length;
    } else {
      start = other.endTime;
      end = start + length;
    }
    if (start < 0) {
      start = 0;
      end = length;
    }
  }
  let delta = start - primary.startTime;
  const groupClips = tracks.flatMap((t) => t.clips).filter((c) => group.has(c.id));
  const minStart = Math.min(...groupClips.map((c) => c.startTime));
  if (minStart + delta < 0) delta = -minStart;

  // 2) Apply the correction to the whole group, 3) push remaining overlaps.
  return tracks.map((track) => {
    const moved = track.clips
      .filter((c) => group.has(c.id))
      .map((c) => (Math.abs(delta) > EPS ? ({ ...c, startTime: c.startTime + delta, endTime: c.endTime + delta } as Clip) : c));
    if (moved.length === 0) return track;
    const placed: Clip[] = [...moved];
    for (const other of sortClipsByStartTime(track.clips.filter((c) => !group.has(c.id)))) {
      const len = other.endTime - other.startTime;
      let s = other.startTime;
      let bumped = true;
      while (bumped) {
        bumped = false;
        for (const p of placed) {
          if (s < p.endTime - EPS && s + len > p.startTime + EPS) {
            s = p.endTime;
            bumped = true;
          }
        }
      }
      placed.push(Math.abs(s - other.startTime) > EPS ? ({ ...other, startTime: s, endTime: s + len } as Clip) : other);
    }
    return { ...track, clips: placed };
  });
}

/** History label of a finished drag. */
export function dragHistoryLabel(op: DragState['operation']): string {
  switch (op) {
    case 'move': return 'Move Clip';
    case 'roll-start':
    case 'roll-end': return 'Roll Edit';
    case 'slip': return 'Slip Edit';
    case 'slide': return 'Slide Edit';
    case 'rate-stretch': return 'Rate Stretch';
    default: return 'Trim Clip';
  }
}

