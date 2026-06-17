import type { Track, Clip } from '@/features/video-editor/stores/editor.store';

/** Find a clip by ID across all tracks */
export function findClipById(tracks: Track[], clipId: string): { clip: Clip; track: Track } | null {
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) {
      return { clip, track };
    }
  }
  return null;
}

/** Calculate the maximum end time across all clips in all tracks */
export function calculateMaxEndTime(tracks: Track[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.endTime > max) {
        max = clip.endTime;
      }
    }
  }
  return max;
}

/** Sort clips by start time (returns a new array) */
export function sortClipsByStartTime<T extends { startTime: number }>(clips: T[]): T[] {
  return [...clips].sort((a, b) => a.startTime - b.startTime);
}

/** Close gaps between clips by shifting them to fill empty spaces */
export function closeGapsInClips(clips: Clip[]): Clip[] {
  const sorted = sortClipsByStartTime(clips);
  let cursor = 0;
  return sorted.map((clip) => {
    const gap = clip.startTime - cursor;
    if (gap > 0.001) {
      const updated = { ...clip, startTime: clip.startTime - gap, endTime: clip.endTime - gap };
      cursor = updated.endTime;
      return updated;
    }
    cursor = clip.endTime;
    return clip;
  });
}

/** Update a specific clip across all tracks using an updater function */
export function updateClipInTracks(
  tracks: Track[],
  clipId: string,
  updater: (clip: Clip) => Clip,
): Track[] {
  return tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) => (c.id === clipId ? updater(c) : c)),
  }));
}

/** Remove clips from tracks by their IDs */
export function removeClipsFromTracks(tracks: Track[], clipIds: string[]): Track[] {
  const idSet = new Set(clipIds);
  return tracks.map((t) => ({
    ...t,
    clips: t.clips.filter((c) => !idSet.has(c.id)),
  }));
}
