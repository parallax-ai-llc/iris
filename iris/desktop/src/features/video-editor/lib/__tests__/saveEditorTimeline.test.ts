/**
 * Save -> save point: a successful save of the editor timeline records the save
 * point (closing afterwards does not warn); a failed save leaves the project
 * dirty; an edit made while the request is in flight stays unsaved.
 * The project API is mocked: nothing is written anywhere.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createProject: vi.fn(),
  addMedia: vi.fn(),
  saveTimeline: vi.fn(),
  getProjects: vi.fn(),
}));
vi.mock('@/shared/api/videoProject.api', () => api);

import { useEditorStore } from '../../stores/editor.store';
import type { VideoClip } from '../../stores/editor.store';
import { useVideoProjectStore } from '../../stores/videoProject.store';
import { saveEditorTimeline } from '../saveEditorTimeline';
import type { IrisAsset } from '@/shared/api/types';
import type { VideoProject } from '@/types/videoProject.types';

const now = new Date().toISOString();
const asset: IrisAsset = {
  id: 'project-save-test', userId: '', name: 'save-test', storagePath: '', currentVersion: 1,
  assetType: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 0, isPublic: false, createdAt: now, updatedAt: now,
};

function storedProject(id: string): VideoProject {
  return {
    id, userId: 'u', name: 'save-test', description: null, width: 1920, height: 1080, frameRate: 30,
    timelineData: { version: 1, settings: { backgroundColor: '#000000', defaultTransitionDuration: 0.5, audioFadeDefault: 0.3 }, tracks: [] },
    duration: 4, thumbnailUrl: null, status: 'draft', lastExportedAt: null, exportedVideoId: null,
    createdAt: now, updatedAt: now, mediaPool: [],
  } as VideoProject;
}

const clip: Omit<VideoClip, 'id' | 'trackId'> = {
  type: 'video', assetId: 'file:///C:/media/a.mp4', name: 'A', startTime: 0, endTime: 4, sourceStartTime: 0, sourceEndTime: 4,
  transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 }, volume: 1, muted: false, speed: 1, blendMode: 'normal',
  effects: [], keyframes: [],
};

const editor = () => useEditorStore.getState();

function openAndEdit() {
  editor().closeEditor();
  useVideoProjectStore.getState().closeProject();
  editor().openEditor(asset);
  useVideoProjectStore.getState().initProvisionalProject('save-test', 1920, 1080, 30);
  const track = editor().tracks.find((t) => t.type === 'video')!;
  editor().addClip(track.id, clip);
  expect(editor().hasUnsavedChanges()).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getProjects.mockResolvedValue({ success: true, data: { projects: [], total: 0 } });
  api.createProject.mockResolvedValue({ success: true, data: storedProject('p-1') });
  api.addMedia.mockResolvedValue({ success: true, data: {} });
});

describe('saveEditorTimeline', () => {
  it('a successful first save of a provisional project records the save point', async () => {
    openAndEdit();
    api.saveTimeline.mockResolvedValue({ success: true, data: storedProject('p-1') });

    const saved = await saveEditorTimeline();

    expect(saved).toBe(true);
    expect(api.createProject).toHaveBeenCalledTimes(1);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1);
    const [projectId, input] = api.saveTimeline.mock.calls[0];
    expect(projectId).toBe('p-1');
    expect(input.timelineData.tracks.flatMap((t: { clips: unknown[] }) => t.clips)).toHaveLength(1);
    expect(editor().hasUnsavedChanges()).toBe(false);
    expect(useVideoProjectStore.getState().isProvisional).toBe(false);
  });

  it('a later save of a stored project records the save point again', async () => {
    openAndEdit();
    api.saveTimeline.mockResolvedValue({ success: true, data: storedProject('p-1') });
    await saveEditorTimeline();
    editor().removeClip(editor().tracks.find((t) => t.type === 'video')!.clips[0].id);
    expect(editor().hasUnsavedChanges()).toBe(true);

    await saveEditorTimeline({ thumbnail: 'data:image/jpeg;base64,AAA' });

    expect(api.createProject).toHaveBeenCalledTimes(1); // not created twice
    expect(api.saveTimeline.mock.calls[1][1].thumbnail).toBe('data:image/jpeg;base64,AAA');
    expect(editor().hasUnsavedChanges()).toBe(false);
  });

  it('a failed save leaves the project dirty', async () => {
    openAndEdit();
    api.saveTimeline.mockResolvedValue({ success: false, error: 'boom' });

    const saved = await saveEditorTimeline();

    expect(saved).toBe(false);
    expect(editor().hasUnsavedChanges()).toBe(true);
  });

  it('an edit made while the save is in flight stays unsaved', async () => {
    openAndEdit();
    let resolve!: (v: unknown) => void;
    api.saveTimeline.mockReturnValue(new Promise((r) => { resolve = r; }));

    const pending = saveEditorTimeline();
    await vi.waitFor(() => expect(api.saveTimeline).toHaveBeenCalled());
    editor().addMarker(1, 'late');
    resolve({ success: true, data: storedProject('p-1') });
    await pending;

    expect(editor().hasUnsavedChanges()).toBe(true);
    // ...and the save point is the state that was written: removing the late marker is clean.
    editor().removeMarker(editor().markers[0].id);
    expect(editor().hasUnsavedChanges()).toBe(false);
  });

  it('a save that finishes after the project was closed and another opened leaves the new one alone', async () => {
    openAndEdit();
    api.saveTimeline.mockResolvedValue({ success: true, data: storedProject('p-1') });
    await saveEditorTimeline(); // now a stored project p-1
    editor().addMarker(1, 'edit');
    let resolve!: (v: unknown) => void;
    api.saveTimeline.mockReturnValue(new Promise((r) => { resolve = r; }));

    const pending = saveEditorTimeline();
    await vi.waitFor(() => expect(api.saveTimeline).toHaveBeenCalledTimes(2));
    // Discard and open another (provisional) project while the request hangs.
    editor().closeEditor();
    useVideoProjectStore.getState().closeProject();
    editor().openEditor({ ...asset, id: 'project-other' });
    useVideoProjectStore.getState().initProvisionalProject('other', 1920, 1080, 30);
    editor().addMarker(2, 'other-edit');
    resolve({ success: true, data: storedProject('p-1') });
    await pending;

    expect(useVideoProjectStore.getState().currentProject?.name).toBe('other');
    expect(useVideoProjectStore.getState().isProvisional).toBe(true);
    expect(editor().hasUnsavedChanges()).toBe(true); // old save point not applied here
  });

  it('a second save waits for the one in flight (no parallel timeline writes)', async () => {
    openAndEdit();
    api.saveTimeline.mockResolvedValue({ success: true, data: storedProject('p-1') });
    await saveEditorTimeline();
    let resolve!: (v: unknown) => void;
    api.saveTimeline.mockReturnValueOnce(new Promise((r) => { resolve = r; }));

    editor().addMarker(1, 'a');
    const first = saveEditorTimeline();
    await vi.waitFor(() => expect(api.saveTimeline).toHaveBeenCalledTimes(2));
    editor().addMarker(2, 'b');
    const second = saveEditorTimeline();
    await Promise.resolve();
    expect(api.saveTimeline).toHaveBeenCalledTimes(2);

    resolve({ success: true, data: storedProject('p-1') });
    await Promise.all([first, second]);
    expect(api.saveTimeline).toHaveBeenCalledTimes(3);
    expect(api.saveTimeline.mock.calls[2][1].timelineData.markers).toHaveLength(2);
    expect(editor().hasUnsavedChanges()).toBe(false);
  });

  it('when the timeline write fails after the cloud project was created, the retry does not create it again', async () => {
    openAndEdit();
    api.saveTimeline.mockResolvedValueOnce({ success: false, error: 'boom' });
    expect(await saveEditorTimeline()).toBe(false);
    expect(useVideoProjectStore.getState().isProvisional).toBe(false);
    expect(useVideoProjectStore.getState().currentProject?.id).toBe('p-1');

    api.saveTimeline.mockResolvedValueOnce({ success: true, data: storedProject('p-1') });
    expect(await saveEditorTimeline()).toBe(true);
    expect(api.createProject).toHaveBeenCalledTimes(1);
    expect(api.saveTimeline.mock.calls[1][0]).toBe('p-1');
  });
});
