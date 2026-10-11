/**
 * Video editor document lifecycle: unsaved-change tracking (history position +
 * save point) and the per-project view reset. See stores/editor/documentLifecycle.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editor.store';
import type { VideoClip } from '../editor.store';
import type { IrisAsset } from '@/shared/api/types';
import {
  DEFAULT_PIXELS_PER_SECOND,
  applyBackgroundClipPatch,
} from '../editor/documentLifecycle';

function asset(id: string, extra: Partial<IrisAsset> = {}): IrisAsset {
  const now = new Date().toISOString();
  return {
    id,
    userId: '',
    name: id,
    storagePath: '',
    currentVersion: 1,
    assetType: 'VIDEO',
    mimeType: 'video/mp4',
    sizeBytes: 0,
    isPublic: false,
    metadata: { duration: 8 },
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function clip(name: string, start: number): Omit<VideoClip, 'id' | 'trackId'> {
  return {
    type: 'video',
    assetId: `asset-${name}`,
    name,
    startTime: start,
    endTime: start + 4,
    sourceStartTime: 0,
    sourceEndTime: 4,
    transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 },
    volume: 1,
    muted: false,
    speed: 1,
    blendMode: 'normal',
    effects: [],
    keyframes: [],
  };
}

const store = () => useEditorStore.getState();

/** `count` recorded edits (rename + history entry). */
function rename(clipId: string, count: number, prefix: string) {
  for (let i = 0; i < count; i++) {
    store().updateClip(clipId, { name: `${prefix}${i}` });
    store().pushHistory('Rename');
  }
}
const dirty = () => store().hasUnsavedChanges();
const videoTrackId = () => store().tracks.find((t) => t.type === 'video')!.id;

/** Open a blank project, add two clips and record that as the stored state. */
function openSavedProject(): string[] {
  store().closeEditor();
  store().openEditor(asset('project-lifecycle'));
  const a = store().addClip(videoTrackId(), clip('A', 0));
  const b = store().addClip(videoTrackId(), clip('B', 4));
  store().markSaved();
  return [a.id, b.id];
}

beforeEach(() => {
  store().closeEditor();
});

describe('opening', () => {
  it('a freshly opened project is clean', () => {
    store().openEditor(asset('project-open'));
    expect(store().isEditorOpen).toBe(true);
    expect(dirty()).toBe(false);
  });

  it('a project opened from timeline data is clean', () => {
    store().openEditor(asset('project-load'));
    store().loadFromTimelineData(
      {
        version: 1,
        settings: { backgroundColor: '#000000', defaultTransitionDuration: 0.5, audioFadeDefault: 0.3 },
        tracks: [
          {
            id: 'track-video-1', type: 'video', name: 'Video 1', locked: false, muted: false, visible: true, height: 80,
            clips: [{ id: 'c1', type: 'video', trackId: 'track-video-1', startTime: 0, endTime: 3, duration: 3, sourceUrl: 'x', inPoint: 0, outPoint: 3 } as never],
          },
        ],
        markers: [{ id: 'm1', time: 1, label: 'M' }],
      },
      3,
    );
    expect(store().tracks[0].clips).toHaveLength(1);
    expect(dirty()).toBe(false);
  });

  it('a closed editor never reports unsaved changes', () => {
    openSavedProject();
    store().removeClip(store().tracks[0].clips[0].id);
    store().closeEditor();
    expect(dirty()).toBe(false);
  });
});

describe('edits and history position', () => {
  it('a recorded edit makes the project dirty and undo back to the save point cleans it', () => {
    const [a] = openSavedProject();
    store().removeClip(a);
    expect(dirty()).toBe(true);
    store().undo();
    expect(dirty()).toBe(false);
    store().redo();
    expect(dirty()).toBe(true);
  });

  it('undo past the save point is dirty too', () => {
    openSavedProject();
    store().undo();
    expect(dirty()).toBe(true);
  });

  it('a new edit after undo (redo branch cut) stays dirty even when the content is the same', () => {
    const [a] = openSavedProject();
    store().undo(); // before clip B
    store().addClip(videoTrackId(), clip('B', 4)); // same content, new branch
    expect(store().tracks[0].clips.map((c) => c.name)).toEqual(['A', 'B']);
    expect(dirty()).toBe(true);
    void a;
  });

  it('view-only actions keep the project clean and add no history', () => {
    const [a] = openSavedProject();
    const historyLength = store().history.length;
    store().selectClip(a);
    store().play();
    store().pause();
    store().seek(2);
    store().zoomIn();
    store().setInspectorTab('effects');
    store().toggleWaveforms();
    expect(store().history.length).toBe(historyLength);
    expect(dirty()).toBe(false);
  });

  it('an untracked change (updateClip without history) is dirty; reverting it is clean', () => {
    const [a] = openSavedProject();
    const before = store().tracks[0].clips[0].startTime;
    store().updateClip(a, { name: 'renamed' });
    expect(dirty()).toBe(true);
    store().updateClip(a, { name: 'A' });
    expect(store().tracks[0].clips[0].startTime).toBe(before);
    expect(dirty()).toBe(false);
  });

  it('a local-file source alone does not count, but changing a clip source does', () => {
    store().openEditor(asset('project-local'));
    store().addClip(videoTrackId(), { ...clip('L', 0), assetId: 'file:///C:/media/local.mp4' });
    store().markSaved();
    expect(dirty()).toBe(false);
    const id = store().tracks[0].clips[0].id;
    store().updateClip(id, { assetId: 'blob:other' } as Partial<VideoClip>);
    expect(dirty()).toBe(true);
  });

  it('markers are part of the project: adding one is dirty, removing it is clean again', () => {
    openSavedProject();
    const m = store().addMarker(1, 'note');
    expect(dirty()).toBe(true);
    store().removeMarker(m.id);
    expect(dirty()).toBe(false);
  });

  it('runtime-only clip data (waveform peaks) is not a change', () => {
    store().openEditor(asset('project-audio'));
    const audioTrack = store().tracks.find((t) => t.type === 'audio')!;
    const audio = store().addClip(audioTrack.id, {
      type: 'audio', assetId: 'a', name: 'aud', startTime: 0, endTime: 2, sourceStartTime: 0, sourceEndTime: 2,
      volume: 1, muted: false, fadeIn: 0, fadeOut: 0, effects: [], keyframes: [],
    } as never);
    store().markSaved();
    store().setClipWaveformData(audio.id, [0.1, 0.5, 0.2] as never);
    expect(dirty()).toBe(false);
  });
});

describe('history limit', () => {
  it('once the save point is trimmed off the 50-entry history the project stays dirty until saved', () => {
    const [a] = openSavedProject();
    rename(a, 60, 'n');
    expect(store().history.length).toBe(50);
    // Undo as far as possible: the opened state is gone from history.
    for (let i = 0; i < 60; i++) store().undo();
    expect(dirty()).toBe(true);
    store().markSaved();
    expect(dirty()).toBe(false);
  });

  it('trimming that keeps the save point reachable still finds it', () => {
    const [a] = openSavedProject();
    rename(a, 20, 'n');
    store().markSaved();
    rename(a, 40, 'm');
    expect(store().history.length).toBe(50);
    for (let i = 0; i < 40; i++) store().undo();
    expect(dirty()).toBe(false);
  });
});

describe('clearHistory', () => {
  it('keeps a clean project clean', () => {
    openSavedProject();
    store().clearHistory();
    expect(dirty()).toBe(false);
  });

  it('keeps a dirty project dirty', () => {
    const [a] = openSavedProject();
    store().removeClip(a);
    store().clearHistory();
    expect(dirty()).toBe(true);
  });
});

describe('save point capture', () => {
  it('a save point captured before an in-flight edit leaves that edit unsaved', () => {
    const [a] = openSavedProject();
    store().removeClip(a);
    const point = store().captureSavePoint();
    store().addMarker(2, 'during save'); // edit while the request is in flight
    store().markSaved(point);
    expect(dirty()).toBe(true);
  });
});

describe('background updates', () => {
  it('a background clip patch is applied to history and keeps a clean project clean', () => {
    // Non-placeholder asset: default tracks include the main video/audio clips.
    store().openEditor(asset('cloud-asset-1'));
    expect(store().tracks.some((t) => t.clips.some((c) => c.id === 'clip-audio-main'))).toBe(true);
    expect(dirty()).toBe(false);

    useEditorStore.setState(applyBackgroundClipPatch(store(), 'clip-audio-main', { assetId: 'C:/cache/audio.m4a' }));
    expect(dirty()).toBe(false);
    const inHistory = store().history[0].tracks.flatMap((t) => t.clips).find((c) => c.id === 'clip-audio-main');
    expect((inHistory as { assetId: string }).assetId).toBe('C:/cache/audio.m4a');

    // Undo/redo around it does not bring the old source back.
    store().removeClip('clip-video-main');
    store().undo();
    expect(dirty()).toBe(false);
  });
});

describe('view state between projects', () => {
  it('closing resets the timeline zoom and scroll', () => {
    openSavedProject();
    store().setZoom(200);
    useEditorStore.setState({ scrollLeft: 300 });
    store().closeEditor();
    expect(store().pixelsPerSecond).toBe(DEFAULT_PIXELS_PER_SECOND);
    expect(store().scrollLeft).toBe(0);
  });

  it('opening another project resets the zoom even without closing first', () => {
    openSavedProject();
    store().setZoom(10);
    store().openEditor(asset('project-other'));
    expect(store().pixelsPerSecond).toBe(DEFAULT_PIXELS_PER_SECOND);
    expect(dirty()).toBe(false);
  });
});
