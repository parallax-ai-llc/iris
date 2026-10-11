/**
 * Save the live editor timeline to the current video project and, when the
 * save succeeds, record the save point the unsaved-changes check compares
 * against (stores/editor/documentLifecycle.ts).
 *
 * The save point is captured BEFORE the request: an edit made while the save
 * is in flight is not part of what was written, so it stays unsaved.
 *
 * Saves are serialized: a save requested while another one (manual or auto
 * save) is in flight waits for it, so two timeline writes never race and the
 * later one always carries the newer state.
 *
 * The save point is only recorded when the editor still shows the document
 * that was saved (same editor project id). If the project was closed or
 * switched while the request was in flight, the new document is left alone.
 */

import { useEditorStore } from '../stores/editor.store';
import { useVideoProjectStore } from '../stores/videoProject.store';
import { convertEditorTracksToTimelineData } from './editorTimelineData';

export interface SaveEditorTimelineOptions {
  thumbnail?: string | null;
}

let inFlight: Promise<boolean> | null = null;

/** True while a timeline save (manual or auto) is in flight. */
export function isEditorTimelineSaving(): boolean {
  return inFlight !== null;
}

async function runSave(options: SaveEditorTimelineOptions): Promise<boolean> {
  const editor = useEditorStore.getState();
  const documentId = editor.project?.id ?? null;
  const point = editor.captureSavePoint();
  const timelineData = convertEditorTracksToTimelineData(editor.tracks, editor.markers);

  const projectStore = useVideoProjectStore.getState();
  projectStore.updateTimelineData(timelineData);
  const saved = await projectStore.saveTimeline({
    timelineData,
    duration: editor.duration,
    thumbnail: options.thumbnail || undefined,
  });

  const after = useEditorStore.getState();
  if (saved && after.isEditorOpen && (after.project?.id ?? null) === documentId) {
    after.markSaved(point);
  }
  return saved;
}

export async function saveEditorTimeline(options: SaveEditorTimelineOptions = {}): Promise<boolean> {
  while (inFlight) {
    await inFlight.catch(() => false);
  }
  const run = runSave(options);
  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
}
