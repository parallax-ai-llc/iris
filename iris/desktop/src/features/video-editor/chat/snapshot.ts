/**
 * Video editor state snapshot for the assistant.
 *
 * Read from the editor and project stores at send time and rendered into the
 * system prompt by `buildVideoSystemPrompt`.
 */

import { useEditorStore, type Track, type Clip } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import type {
  VideoEditorStateSnapshot,
  VideoTrackSnapshot,
  VideoClipSnapshot,
  VideoSubtitleEntrySnapshot,
} from './systemPrompt';

function effectIdsFor(clip: Clip): string[] | undefined {
  if (clip.type === 'video' || clip.type === 'audio' || clip.type === 'adjustment') {
    const ids: string[] = [];
    for (const e of clip.effects) {
      const id = e.filterType ?? e.transitionType ?? e.audioEffectType;
      if (id) ids.push(id);
    }
    return ids;
  }
  return undefined;
}

export function buildVideoSnapshot(): VideoEditorStateSnapshot {
  const editor = useEditorStore.getState();
  const project = useVideoProjectStore.getState().currentProject;

  const tracks: VideoTrackSnapshot[] = editor.tracks.map((t: Track) => ({
    id: t.id,
    type: t.type === 'music' ? 'music' : t.type,
    name: t.name,
    visible: t.visible,
    muted: t.muted,
    locked: t.locked,
    clipCount: t.clips.length,
  }));

  const clips: VideoClipSnapshot[] = [];
  const subtitles: VideoSubtitleEntrySnapshot[] = [];

  for (const track of editor.tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'compound' || clip.type === 'shape') continue;

      const snap: VideoClipSnapshot = {
        id: clip.id,
        trackId: clip.trackId,
        type: clip.type,
        name: clip.name,
        startTime: clip.startTime,
        endTime: clip.endTime,
        effects: effectIdsFor(clip),
        opacity:
          clip.type === 'video'
            ? clip.transform.opacity
            : clip.type === 'adjustment'
              ? clip.opacity
              : undefined,
        muted:
          clip.type === 'video' || clip.type === 'audio'
            ? clip.muted
            : undefined,
      };

      if (clip.type === 'subtitle') {
        snap.text = clip.text;
        subtitles.push({
          startTime: clip.startTime,
          endTime: clip.endTime,
          text: clip.text,
        });
      }

      clips.push(snap);
    }
  }

  clips.sort((a, b) => a.startTime - b.startTime || a.trackId.localeCompare(b.trackId));

  return {
    projectName: project?.name ?? 'Untitled',
    durationSec: editor.duration,
    width: project?.width ?? 1920,
    height: project?.height ?? 1080,
    frameRate: project?.frameRate ?? 30,
    currentTime: editor.currentTime,
    isPlaying: editor.isPlaying,
    selectedClipId: editor.selectedClip?.id ?? null,
    tracks,
    clips,
    subtitles,
  };
}
