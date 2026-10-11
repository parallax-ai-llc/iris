import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveIsDirty,
  shiftSavedIndexOnPush,
  CLEAN_TRANSFORM,
} from '@/features/image-editor/stores/dirtyTracking';
import { setupImageEditorTestTab, mockSourceAsset } from '@/test-utils/imageEditorHelpers';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';

const layer = (id: string): Layer => ({
  id,
  name: id,
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal',
  imageData: 'data:image/png;base64,AAAA',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
});

describe('deriveIsDirty', () => {
  const base = {
    historyIndex: 2,
    savedHistoryIndex: 2,
    savedTransform: CLEAN_TRANSFORM,
    hasUntrackedChanges: false,
    ...CLEAN_TRANSFORM,
  };

  it('is clean at the saved index', () => {
    expect(deriveIsDirty(base)).toBe(false);
  });
  it('is dirty away from the saved index, or when the saved state is gone', () => {
    expect(deriveIsDirty({ ...base, historyIndex: 3 })).toBe(true);
    expect(deriveIsDirty({ ...base, savedHistoryIndex: null })).toBe(true);
  });
  it('is dirty when the render-time transform differs from the saved one', () => {
    expect(deriveIsDirty({ ...base, rotation: 90 })).toBe(true);
    expect(deriveIsDirty({ ...base, flipHorizontal: true })).toBe(true);
  });
  it('is dirty after an untracked change', () => {
    expect(deriveIsDirty({ ...base, hasUntrackedChanges: true })).toBe(true);
  });
});

describe('shiftSavedIndexOnPush', () => {
  it('keeps the index when nothing is trimmed', () => {
    expect(shiftSavedIndexOnPush(1, 3, 0)).toBe(1);
    expect(shiftSavedIndexOnPush(-1, -1, 0)).toBe(-1);
  });
  it('shifts the index when old entries are trimmed', () => {
    expect(shiftSavedIndexOnPush(5, 49, 1)).toBe(4);
  });
  it('loses the saved state when it is trimmed away', () => {
    expect(shiftSavedIndexOnPush(0, 49, 1)).toBeNull();
    expect(shiftSavedIndexOnPush(-1, 49, 1)).toBeNull();
  });
  it('loses the saved state when it was in the discarded redo branch', () => {
    expect(shiftSavedIndexOnPush(4, 2, 0)).toBeNull();
  });
});

describe('image editor store: isDirty is derived from history', () => {
  let store: ImageEditorStoreApi;
  beforeEach(() => {
    store = setupImageEditorTestTab();
  });

  it('cloud open: baseline entry is clean, edit is dirty, undo back is clean, redo is dirty', () => {
    const s = () => store.getState();
    s().openEditor(mockSourceAsset);
    expect(s().isDirty).toBe(false);
    s().pushHistory('Open', 'data:open', false); // canvas baseline
    expect(s().isDirty).toBe(false);
    s().pushHistory('Brush Stroke', 'data:1');
    expect(s().isDirty).toBe(true);
    s().undo();
    expect(s().historyIndex).toBe(0);
    expect(s().isDirty).toBe(false);
    s().redo();
    expect(s().isDirty).toBe(true);
    s().goToHistoryState(0);
    expect(s().isDirty).toBe(false);
  });

  it('save makes the current state clean; undo past the save is dirty again', () => {
    const s = () => store.getState();
    s().openEditor(mockSourceAsset);
    s().pushHistory('Open', 'data:open', false);
    s().pushHistory('Brush Stroke', 'data:1');
    s().clearDirty();
    expect(s().isDirty).toBe(false);
    s().undo();
    expect(s().isDirty).toBe(true);
    s().redo();
    expect(s().isDirty).toBe(false);
  });

  it('an edit after undo discards the saved branch: never clean again by index', () => {
    const s = () => store.getState();
    s().openEditor(mockSourceAsset);
    s().pushHistory('Open', 'data:open', false);
    s().pushHistory('A', 'data:a');
    s().pushHistory('B', 'data:b');
    s().clearDirty(); // saved at index 2
    s().undo();
    s().undo();
    s().pushHistory('C', 'data:c'); // index 1, saved state (B) discarded
    expect(s().savedHistoryIndex).toBeNull();
    s().pushHistory('D', 'data:d'); // index 2 again, but not the saved B
    expect(s().isDirty).toBe(true);
  });

  it('history trimming shifts the saved index', () => {
    const s = () => store.getState();
    s().openEditor(mockSourceAsset);
    store.setState({ maxHistoryStates: 3 });
    s().pushHistory('Open', 'data:open', false); // [Open] saved 0
    s().pushHistory('A', 'data:a');
    s().pushHistory('B', 'data:b');
    s().goToHistoryState(1);
    s().clearDirty(); // saved at A (index 1)
    s().redo();
    s().pushHistory('C', 'data:c'); // [A, B, C] -> A is index 0
    expect(s().history.map((h) => h.label)).toEqual(['A', 'B', 'C']);
    expect(s().savedHistoryIndex).toBe(0);
    s().goToHistoryState(0);
    expect(s().isDirty).toBe(false);
  });

  it('layered open starts with a baseline entry, clean, and the first edit can be undone', () => {
    const s = () => store.getState();
    s().openEditorWithLayers(mockSourceAsset, [layer('bg')], 'data:composite', 10, 10);
    expect(s().history.map((h) => h.label)).toEqual(['Open']);
    expect(s().historyIndex).toBe(0);
    expect(s().isDirty).toBe(false);
    s().pushHistory('Brush Stroke', 'data:1');
    expect(s().canUndo()).toBe(true);
    s().undo();
    expect(s().isDirty).toBe(false);
  });

  it('rotation/flip are dirty only while they differ from the saved transform', () => {
    const s = () => store.getState();
    s().openEditor(mockSourceAsset);
    s().toggleFlipHorizontal();
    expect(s().isDirty).toBe(true);
    s().toggleFlipHorizontal();
    expect(s().isDirty).toBe(false);
    s().setRotation(90);
    expect(s().isDirty).toBe(true);
    s().clearDirty();
    expect(s().isDirty).toBe(false);
  });

  it('non-document actions do not make the document dirty', () => {
    const s = () => store.getState();
    s().openEditor(mockSourceAsset);
    s().setZoom(250);
    s().setPanOffset({ x: 10, y: 5 });
    s().setAdjustment('brightness', 20); // preview until Apply
    expect(s().isDirty).toBe(false);
  });

  it('legacy `isDirty: true` patches count as untracked changes until the next save', () => {
    const s = () => store.getState();
    s().openEditor(mockSourceAsset);
    s().markDirty();
    expect(s().isDirty).toBe(true);
    s().undo(); // nothing to undo; untracked change is still there
    expect(s().isDirty).toBe(true);
    s().clearDirty();
    expect(s().isDirty).toBe(false);
    store.setState({ isDirty: true }); // external setState goes through the same rule
    expect(s().isDirty).toBe(true);
    expect(s().hasUntrackedChanges).toBe(true);
  });
});
