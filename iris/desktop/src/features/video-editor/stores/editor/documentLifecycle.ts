/**
 * Document lifecycle of the video editor store: unsaved-change tracking and the
 * view state that resets between projects.
 *
 * "Unsaved" is not a flag that editing actions switch on by hand. It is derived
 * when someone asks (closing, New, Open, quitting the app) from the save point,
 * which is recorded when a project is opened/created and when a save succeeds:
 *
 *  1. History position: the current history entry must be the entry that was
 *     current at the save point. Entries are compared by identity, so undoing
 *     back to the opened state is clean again, a new edit after an undo (which
 *     cuts the redo branch) is dirty, and a save point trimmed off the front of
 *     the 50-entry history can never match again (dirty until the next save).
 *  2. Untracked changes: some actions change the project without a history
 *     entry (inspector `updateClip`, track mute/lock/visibility, effects,
 *     markers, ...). They are caught by comparing what a save would write
 *     (`convertEditorTracksToTimelineData`) with what was written at the save
 *     point. Runtime-only fields (waveform peaks, selection, playhead, zoom,
 *     panel toggles) are not part of that projection, so they never count.
 */

import type { EditorProject, Marker, SavePoint, Track } from '@/types/editor.types';
import { convertEditorTracksToTimelineData } from '../../lib/editorTimelineData';

/** Timeline zoom of a freshly opened project. */
export const DEFAULT_PIXELS_PER_SECOND = 50;

/** View state that belongs to one project and is reset when a project is opened or closed. */
export const PROJECT_VIEW_RESET = {
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
  scrollLeft: 0,
} as const;

/** What a save would write, as a comparable string. */
export function timelineContentKey(tracks: Track[], markers: Marker[]): string {
  return JSON.stringify(convertEditorTracksToTimelineData(tracks, markers));
}

interface HistoryPosition {
  history: EditorProject[];
  historyIndex: number;
}

export function currentHistoryEntry(s: HistoryPosition): EditorProject | null {
  return s.history[s.historyIndex] ?? null;
}

interface SavePointInputs extends HistoryPosition {
  tracks: Track[];
  markers: Marker[];
}

export function createSavePoint(s: SavePointInputs): SavePoint {
  return { entry: currentHistoryEntry(s), content: timelineContentKey(s.tracks, s.markers) };
}

export const EMPTY_SAVE_POINT: SavePoint = { entry: null, content: timelineContentKey([], []) };

interface DirtyInputs extends SavePointInputs {
  isEditorOpen: boolean;
  savePoint: SavePoint;
}

/** The single "would leaving lose work?" check used by every leave path. */
export function hasUnsavedEditorChanges(s: DirtyInputs): boolean {
  if (!s.isEditorOpen) return false;
  if (currentHistoryEntry(s) !== s.savePoint.entry) return true;
  return timelineContentKey(s.tracks, s.markers) !== s.savePoint.content;
}

/**
 * `clearHistory` empties the history. A clean project stays clean (the save
 * point moves to the empty position); a dirty one stays dirty.
 */
export function savePointAfterClearHistory(s: DirtyInputs): SavePoint {
  return hasUnsavedEditorChanges(s) ? s.savePoint : { entry: null, content: s.savePoint.content };
}

type ClipPatch = Partial<Record<string, unknown>>;

function patchTracks(tracks: Track[], clipId: string, patch: ClipPatch): Track[] {
  let changed = false;
  const next = tracks.map((t) => {
    if (!t.clips.some((c) => c.id === clipId)) return t;
    changed = true;
    return { ...t, clips: t.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as typeof c) : c)) };
  });
  return changed ? next : tracks;
}

interface BackgroundPatchInputs extends DirtyInputs {
  project: EditorProject | null;
}

/**
 * A background update that is not a user edit (e.g. the separated audio file of
 * the opened video replacing the placeholder source) is applied to the live
 * tracks AND every history snapshot, so it is neither undone by Ctrl+Z nor
 * reported as an unsaved change. When the project was clean before, the save
 * point follows the update.
 */
export function applyBackgroundClipPatch(
  s: BackgroundPatchInputs,
  clipId: string,
  patch: ClipPatch,
): Pick<BackgroundPatchInputs, 'tracks' | 'history' | 'project' | 'savePoint'> {
  const wasClean = !hasUnsavedEditorChanges(s);
  const remap = new Map<EditorProject, EditorProject>();
  const history = s.history.map((entry) => {
    const tracks = patchTracks(entry.tracks, clipId, patch);
    if (tracks === entry.tracks) return entry;
    const next = { ...entry, tracks };
    remap.set(entry, next);
    return next;
  });
  const tracks = patchTracks(s.tracks, clipId, patch);
  const project = s.project ? (remap.get(s.project) ?? s.project) : null;
  const entry = s.savePoint.entry ? (remap.get(s.savePoint.entry) ?? s.savePoint.entry) : null;
  const savePoint: SavePoint = {
    entry,
    content: wasClean && s.isEditorOpen ? timelineContentKey(tracks, s.markers) : s.savePoint.content,
  };
  return { tracks, history, project, savePoint };
}
