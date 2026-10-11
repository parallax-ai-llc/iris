/**
 * Track lock checks. A locked track protects every clip on it from edits:
 * drag, trim, delete, split, duplicate, paste onto it, property/effect edits
 * and compound grouping. Every editing path asks these helpers (one rule).
 */

import type { Track } from '@/types/editor.types';

export function isTrackLocked(tracks: Track[], trackId: string | null | undefined): boolean {
  if (!trackId) return false;
  return tracks.find((t) => t.id === trackId)?.locked === true;
}

/** True when the clip sits on a locked track. Unknown clips count as not locked. */
export function isClipLocked(tracks: Track[], clipId: string | null | undefined): boolean {
  if (!clipId) return false;
  for (const t of tracks) {
    if (t.clips.some((c) => c.id === clipId)) return t.locked;
  }
  return false;
}

/** Ids of every clip on a locked track. */
export function lockedClipIds(tracks: Track[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tracks) {
    if (!t.locked) continue;
    for (const c of t.clips) ids.add(c.id);
  }
  return ids;
}
