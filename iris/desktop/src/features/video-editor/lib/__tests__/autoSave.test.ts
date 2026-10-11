/**
 * Auto-save: driven by hasUnsavedChanges(), only for projects that already
 * exist in the cloud, 30 s after the last edit, one save at a time, backoff on
 * failure, timer cleared on close / project switch / unmount.
 * The project API is mocked: nothing is written anywhere.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
import { setupAutoSave, autoSaveDelay, AUTO_SAVE_MAX_BACKOFF_MS, AUTO_SAVE_MAX_RETRIES } from '../autoSave';
import { saveEditorTimeline } from '../saveEditorTimeline';
import type { IrisAsset } from '@/shared/api/types';
import type { VideoProject } from '@/types/videoProject.types';

const now = new Date().toISOString();
const asset: IrisAsset = {
  id: 'project-autosave-test', userId: '', name: 'autosave', storagePath: '', currentVersion: 1,
  assetType: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 0, isPublic: false, createdAt: now, updatedAt: now,
};

function storedProject(id: string): VideoProject {
  return {
    id, userId: 'u', name: 'autosave', description: null, width: 1920, height: 1080, frameRate: 30,
    timelineData: { version: 1, settings: { backgroundColor: '#000000', defaultTransitionDuration: 0.5, audioFadeDefault: 0.3 }, tracks: [] },
    duration: 4, thumbnailUrl: null, status: 'draft', lastExportedAt: null, exportedVideoId: null,
    createdAt: now, updatedAt: now, mediaPool: [],
  } as VideoProject;
}

// A local file clip: the manual save writes it as is, so auto-save does too.
const clip: Omit<VideoClip, 'id' | 'trackId'> = {
  type: 'video', assetId: 'file:///C:/media/a.mp4', name: 'A', startTime: 0, endTime: 4, sourceStartTime: 0, sourceEndTime: 4,
  transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 }, volume: 1, muted: false, speed: 1, blendMode: 'normal',
  effects: [], keyframes: [],
};

const SEC = 1000;
const editor = () => useEditorStore.getState();
const project = () => useVideoProjectStore.getState();
const edit = (label = 'edit') => editor().addMarker(editor().markers.length + 1, label);

let dispose: (() => void) | null = null;

function closeAll() {
  editor().closeEditor();
  project().closeProject();
}

/** Open a project that exists in the cloud, clean, with one local clip. */
async function openCloudProject() {
  closeAll();
  await project().createProject({ name: 'autosave' });
  editor().openEditor(asset);
  editor().addClip(editor().tracks.find((t) => t.type === 'video')!.id, clip);
  editor().markSaved();
  expect(editor().hasUnsavedChanges()).toBe(false);
}

function openProvisionalProject() {
  closeAll();
  editor().openEditor(asset);
  project().initProvisionalProject('autosave', 1920, 1080, 30);
}

function start() {
  dispose = setupAutoSave();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  api.getProjects.mockResolvedValue({ success: true, data: { projects: [], total: 0 } });
  api.createProject.mockResolvedValue({ success: true, data: storedProject('p-1') });
  api.addMedia.mockResolvedValue({ success: true, data: {} });
  api.saveTimeline.mockResolvedValue({ success: true, data: storedProject('p-1') });
});

afterEach(() => {
  dispose?.();
  dispose = null;
  closeAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('auto-save', () => {
  it('saves once, 30 s after an edit, and the project is clean afterwards', async () => {
    await openCloudProject();
    start();
    edit();
    expect(editor().hasUnsavedChanges()).toBe(true);

    await vi.advanceTimersByTimeAsync(29 * SEC);
    expect(api.saveTimeline).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1);
    const [projectId, input] = api.saveTimeline.mock.calls[0];
    expect(projectId).toBe('p-1');
    // The local (file://) clip is written like the manual save writes it.
    const clips = input.timelineData.tracks.flatMap((t: { clips: { sourceUrl?: string }[] }) => t.clips);
    expect(clips).toHaveLength(1);
    expect(editor().hasUnsavedChanges()).toBe(false);

    // Nothing left to save: no further requests.
    await vi.advanceTimersByTimeAsync(10 * 60 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1);
  });

  it('does nothing while there are no unsaved changes', async () => {
    await openCloudProject();
    start();
    await vi.advanceTimersByTimeAsync(10 * 60 * SEC);
    expect(api.saveTimeline).not.toHaveBeenCalled();
  });

  it('keeps postponing while edits continue (debounce from the last edit)', async () => {
    await openCloudProject();
    start();
    edit('a');
    await vi.advanceTimersByTimeAsync(20 * SEC);
    edit('b');
    await vi.advanceTimersByTimeAsync(20 * SEC); // 40 s after the first edit
    expect(api.saveTimeline).not.toHaveBeenCalled();
    edit('c');
    await vi.advanceTimersByTimeAsync(29 * SEC);
    expect(api.saveTimeline).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1);
    expect(api.saveTimeline.mock.calls[0][1].timelineData.markers).toHaveLength(3);
  });

  it('never auto-saves a provisional (never saved) project, so no cloud project is created', async () => {
    openProvisionalProject();
    start();
    editor().addClip(editor().tracks.find((t) => t.type === 'video')!.id, clip);
    edit();
    expect(editor().hasUnsavedChanges()).toBe(true);

    await vi.advanceTimersByTimeAsync(10 * 60 * SEC);
    expect(api.createProject).not.toHaveBeenCalled();
    expect(api.addMedia).not.toHaveBeenCalled();
    expect(api.saveTimeline).not.toHaveBeenCalled();
  });

  it('does not start a second save while one is in flight; edits made meanwhile are saved next', async () => {
    await openCloudProject();
    start();
    let resolveFirst!: (v: unknown) => void;
    api.saveTimeline.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }));

    edit('a');
    await vi.advanceTimersByTimeAsync(30 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1);

    edit('during-save');
    await vi.advanceTimersByTimeAsync(5 * 60 * SEC); // timer fires again while the request hangs
    expect(api.saveTimeline).toHaveBeenCalledTimes(1);

    resolveFirst({ success: true, data: storedProject('p-1') });
    await vi.advanceTimersByTimeAsync(0);
    expect(editor().hasUnsavedChanges()).toBe(true); // the late edit is not part of save 1

    await vi.advanceTimersByTimeAsync(30 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(2);
    expect(api.saveTimeline.mock.calls[1][1].timelineData.markers).toHaveLength(2);
    expect(editor().hasUnsavedChanges()).toBe(false);
  });

  it('does not race a manual save that is in flight', async () => {
    await openCloudProject();
    start();
    let resolveManual!: (v: unknown) => void;
    api.saveTimeline.mockReturnValueOnce(new Promise((r) => { resolveManual = r; }));

    edit('a');
    const manual = saveEditorTimeline();
    await vi.advanceTimersByTimeAsync(30 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1); // only the manual one

    resolveManual({ success: true, data: storedProject('p-1') });
    await manual;
    await vi.advanceTimersByTimeAsync(5 * 60 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1); // manual save made it clean
    expect(editor().hasUnsavedChanges()).toBe(false);
  });

  it('retries a failed save with exponential backoff, then waits for the next edit', async () => {
    await openCloudProject();
    start();
    api.saveTimeline.mockResolvedValue({ success: false, error: 'offline' });

    edit();
    await vi.advanceTimersByTimeAsync(30 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1);
    expect(editor().hasUnsavedChanges()).toBe(true);

    // 2nd attempt 60 s later (not 30 s)
    await vi.advanceTimersByTimeAsync(30 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(2);

    // 3rd after 120 s, 4th after 240 s, 5th after 300 s (cap)
    await vi.advanceTimersByTimeAsync(120 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(240 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(300 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(AUTO_SAVE_MAX_RETRIES);

    // Retry limit reached: no more requests on its own.
    await vi.advanceTimersByTimeAsync(60 * 60 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(AUTO_SAVE_MAX_RETRIES);

    // The next edit schedules one more attempt at the capped delay, which succeeds.
    api.saveTimeline.mockResolvedValue({ success: true, data: storedProject('p-1') });
    edit('again');
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_MAX_BACKOFF_MS - SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(AUTO_SAVE_MAX_RETRIES);
    await vi.advanceTimersByTimeAsync(SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(AUTO_SAVE_MAX_RETRIES + 1);
    expect(editor().hasUnsavedChanges()).toBe(false);

    // Success resets the backoff: the next edit is saved after 30 s again.
    edit('after-success');
    await vi.advanceTimersByTimeAsync(30 * SEC);
    expect(api.saveTimeline).toHaveBeenCalledTimes(AUTO_SAVE_MAX_RETRIES + 2);
  });

  it('autoSaveDelay doubles per failure and caps at 5 minutes', () => {
    expect(autoSaveDelay(30 * SEC, 0)).toBe(30 * SEC);
    expect(autoSaveDelay(30 * SEC, 1)).toBe(60 * SEC);
    expect(autoSaveDelay(30 * SEC, 3)).toBe(240 * SEC);
    expect(autoSaveDelay(30 * SEC, 4)).toBe(AUTO_SAVE_MAX_BACKOFF_MS);
    expect(autoSaveDelay(30 * SEC, 50)).toBe(AUTO_SAVE_MAX_BACKOFF_MS);
  });

  it('closing the editor and project clears the pending auto-save', async () => {
    await openCloudProject();
    start();
    edit();
    await vi.advanceTimersByTimeAsync(10 * SEC);
    closeAll();

    await vi.advanceTimersByTimeAsync(10 * 60 * SEC);
    expect(api.saveTimeline).not.toHaveBeenCalled();
  });

  it('switching to a provisional project clears the pending auto-save', async () => {
    await openCloudProject();
    start();
    edit();
    await vi.advanceTimersByTimeAsync(10 * SEC);
    project().initProvisionalProject('other', 1920, 1080, 30);

    await vi.advanceTimersByTimeAsync(10 * 60 * SEC);
    expect(api.saveTimeline).not.toHaveBeenCalled();
  });

  it('unmounting (cleanup) clears the pending auto-save', async () => {
    await openCloudProject();
    start();
    edit();
    await vi.advanceTimersByTimeAsync(10 * SEC);
    dispose?.();
    dispose = null;

    await vi.advanceTimersByTimeAsync(10 * 60 * SEC);
    expect(api.saveTimeline).not.toHaveBeenCalled();
  });

  it('respects autoSaveEnabled = false', async () => {
    await openCloudProject();
    project().setAutoSave(false);
    start();
    edit();
    await vi.advanceTimersByTimeAsync(10 * 60 * SEC);
    expect(api.saveTimeline).not.toHaveBeenCalled();
    project().setAutoSave(true);
  });
});
