/**
 * One gate for leaving the open video project: ask only when there are unsaved
 * changes; Discard / Cancel / Save & Continue (incl. a deferred name-save).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useProjectLeaveGuard, type ProjectLeaveAction } from '../useProjectLeaveGuard';
import { useEditorStore } from '../../stores/editor.store';
import type { VideoClip } from '../../stores/editor.store';
import type { IrisAsset } from '@/shared/api/types';

const now = new Date().toISOString();
const asset: IrisAsset = {
  id: 'project-guard-test', userId: '', name: 'guard', storagePath: '', currentVersion: 1,
  assetType: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 0, isPublic: false, createdAt: now, updatedAt: now,
};
const clip: Omit<VideoClip, 'id' | 'trackId'> = {
  type: 'video', assetId: 'blob:local', name: 'A', startTime: 0, endTime: 4, sourceStartTime: 0, sourceEndTime: 4,
  transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 }, volume: 1, muted: false, speed: 1, blendMode: 'normal',
  effects: [], keyframes: [],
};

const editor = () => useEditorStore.getState();

function openProject({ edited }: { edited: boolean }) {
  editor().closeEditor();
  editor().openEditor(asset);
  // A project whose clip is a local (blob:) file: that alone must not ask.
  editor().addClip(editor().tracks.find((t) => t.type === 'video')!.id, clip);
  editor().markSaved();
  if (edited) editor().addMarker(1, 'edit');
}

function setup() {
  const proceed = vi.fn<(action: ProjectLeaveAction) => void>();
  const hook = renderHook(() => useProjectLeaveGuard(proceed));
  return { proceed, hook };
}

beforeEach(() => editor().closeEditor());

describe('useProjectLeaveGuard', () => {
  it('leaves at once when nothing is unsaved (local clips included)', () => {
    openProject({ edited: false });
    const { proceed, hook } = setup();
    act(() => hook.result.current.requestLeave('close'));
    expect(proceed).toHaveBeenCalledWith('close');
    expect(hook.result.current.pendingAction).toBeNull();
  });

  it.each<ProjectLeaveAction>(['close', 'new', 'open'])('asks before "%s" when there are unsaved changes', (action) => {
    openProject({ edited: true });
    const { proceed, hook } = setup();
    act(() => hook.result.current.requestLeave(action));
    expect(proceed).not.toHaveBeenCalled();
    expect(hook.result.current.pendingAction).toBe(action);
  });

  it('Discard leaves, Cancel stays', () => {
    openProject({ edited: true });
    const { proceed, hook } = setup();
    act(() => hook.result.current.requestLeave('close'));
    act(() => hook.result.current.cancelLeave());
    expect(proceed).not.toHaveBeenCalled();
    expect(hook.result.current.pendingAction).toBeNull();

    act(() => hook.result.current.requestLeave('close'));
    act(() => hook.result.current.discardAndLeave());
    expect(proceed).toHaveBeenCalledWith('close');
  });

  it('Save & Continue leaves only after a successful save', async () => {
    openProject({ edited: true });
    const { proceed, hook } = setup();

    act(() => hook.result.current.requestLeave('open'));
    await act(() => hook.result.current.saveAndLeave(async () => false));
    expect(proceed).not.toHaveBeenCalled();

    act(() => hook.result.current.requestLeave('open'));
    await act(() => hook.result.current.saveAndLeave(async () => true));
    expect(proceed).toHaveBeenCalledWith('open');
  });

  it('a save that first asks for a name parks the action for the name-save', async () => {
    openProject({ edited: true });
    const { proceed, hook } = setup();
    act(() => hook.result.current.requestLeave('close'));
    await act(() => hook.result.current.saveAndLeave(async () => 'deferred'));
    expect(proceed).not.toHaveBeenCalled();
    expect(hook.result.current.takeParkedAction()).toBe('close');
    expect(hook.result.current.takeParkedAction()).toBeNull();
  });
});
