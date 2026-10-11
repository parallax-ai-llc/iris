/**
 * Arrow-key nudge history: rapid presses become one entry, and a pending
 * entry is not lost when the canvas unmounts (tab switch / close).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

const captured: { handlers: Record<string, (e: KeyboardEvent) => unknown> } = { handlers: {} };
vi.mock('@/shared/lib/shortcuts', () => ({
  useKeymapLayer: (_layer: string, _keymap: unknown, handlers: Record<string, (e: KeyboardEvent) => unknown>) => {
    captured.handlers = handlers;
  },
}));

const { useImageEditorCanvasShortcuts } = await import('../useImageEditorCanvasShortcuts');

const s = () => useImageEditorStore.getState();
const labels = () => s().history.map((h) => h.label);

function openDoc() {
  const id = s().addLayer('data:image/png;base64,AAAA', 'Background', { history: false });
  s().pushHistory('Open', '', false);
  useImageEditorStore.setState({ editMode: 'move', activeLayerId: id });
  return id;
}

beforeEach(() => {
  setupImageEditorTestTab();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('nudge history', () => {
  it('rapid presses become one entry after the debounce', () => {
    const id = openDoc();
    const canvasRef = { current: document.createElement('canvas') };
    renderHook(() => useImageEditorCanvasShortcuts(canvasRef));
    const key = { shiftKey: false } as KeyboardEvent;
    captured.handlers.nudgeRight(key);
    captured.handlers.nudgeRight(key);
    captured.handlers.nudgeDown(key);
    expect(labels()).toEqual(['Open']);
    vi.advanceTimersByTime(400);
    expect(labels()).toEqual(['Open', 'Nudge Layer']);
    expect([s().layers[0].x, s().layers[0].y]).toEqual([2, 1]);
    expect(s().layers[0].id).toBe(id);
  });

  it('unmounting before the debounce fires still records the nudge', () => {
    openDoc();
    const canvasRef = { current: document.createElement('canvas') };
    const hook = renderHook(() => useImageEditorCanvasShortcuts(canvasRef));
    captured.handlers.nudgeLeft({ shiftKey: true } as KeyboardEvent);
    hook.unmount();
    expect(labels()).toEqual(['Open', 'Nudge Layer']);
    vi.advanceTimersByTime(1000);
    expect(labels()).toEqual(['Open', 'Nudge Layer']);
    expect(s().layers[0].x).toBe(-10);
    expect(s().isDirty).toBe(true);
  });
});
