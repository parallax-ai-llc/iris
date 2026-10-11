/**
 * Select > Expand / Contract / Smooth / Border / Grow / Similar used to be
 * placeholders that did nothing. They now change the selection mask.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';

const W = 10;
const H = 10;

/** A 4x4 selected square at (3,3). */
function squareMask(): Uint8ClampedArray {
  const m = new Uint8ClampedArray(W * H);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) m[y * W + x] = 255;
  return m;
}

let stored: Uint8ClampedArray | null = null;

vi.mock('@/features/image-editor/canvas/selectionEngine', async () => {
  const actual = await vi.importActual<typeof import('@/features/image-editor/canvas/selectionEngine')>(
    '@/features/image-editor/canvas/selectionEngine',
  );
  return {
    ...actual,
    loadSelectionMask: vi.fn(async () => squareMask()),
    maskToDataUrl: vi.fn((mask: Uint8ClampedArray) => {
      stored = new Uint8ClampedArray(mask);
      return 'data:image/png;base64,MODIFIED';
    }),
  };
});

vi.mock('@/features/image-editor/canvas/layerCompositor', () => ({
  compositeLayers: vi.fn(async (_l: unknown, w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    // every pixel the same colour → "similar" selects everything
    const data = new Uint8ClampedArray(w * h * 4).fill(200);
    c.getContext('2d')!.putImageData(new ImageData(data, w, h), 0, 0);
    return c;
  }),
}));

const count = (m: Uint8ClampedArray | null) => (m ? m.reduce((n, v) => n + (v > 127 ? 1 : 0), 0) : 0);

let store: ImageEditorStoreApi;

beforeEach(() => {
  stored = null;
  store = setupImageEditorTestTab();
  store.setState({
    canvasWidth: W,
    canvasHeight: H,
    layers: [
      { id: 'bg', name: 'bg', visible: true, locked: false, opacity: 100, blendMode: 'normal', imageData: 'data:bg', x: 0, y: 0, width: W, height: H },
    ],
    selection: { maskDataUrl: 'data:image/png;base64,SQUARE', bounds: { x: 3, y: 3, width: 4, height: 4 }, feather: 2, isInverted: false },
  });
  store.getState().pushHistory('Open', '', false);
});

describe('selection modify actions', () => {
  it('Expand grows the selection and updates the bounds, without dirtying the document', async () => {
    await store.getState().expandSelectionBy(1);
    expect(count(stored)).toBe(36); // 6x6
    const sel = store.getState().selection!;
    expect(sel.maskDataUrl).toBe('data:image/png;base64,MODIFIED');
    expect(sel.bounds).toEqual({ x: 2, y: 2, width: 6, height: 6 });
    expect(sel.feather).toBe(2);
    expect(store.getState().isDirty).toBe(false);
  });

  it('Contract shrinks it', async () => {
    await store.getState().contractSelectionBy(1);
    expect(count(stored)).toBe(4); // 2x2
  });

  it('Contract past the size clears the selection', async () => {
    await store.getState().contractSelectionBy(3);
    expect(store.getState().selection).toBeNull();
  });

  it('Border keeps only a ring around the edge', async () => {
    await store.getState().borderSelectionBy(1);
    const ring = stored!;
    expect(ring[5 * W + 5]).toBe(0); // centre no longer selected
    expect(ring[3 * W + 3]).toBe(255); // the old edge is
    expect(ring[2 * W + 2]).toBe(255); // and one pixel outside
  });

  it('Smooth keeps a clean square selected', async () => {
    await store.getState().smoothSelectionBy(1);
    expect(count(stored)).toBeGreaterThan(0);
  });

  it('works on the effective selection when it is inverted', async () => {
    store.setState({ selection: { ...store.getState().selection!, isInverted: true } });
    await store.getState().expandSelectionBy(1);
    // inverted square = everything but the 4x4; expanded by 1 = everything but the inner 2x2
    expect(count(stored)).toBe(W * H - 4);
    expect(store.getState().selection!.isInverted).toBe(false);
  });

  it('Similar adds every pixel of a similar colour; Grow adds adjacent ones', async () => {
    await store.getState().selectSimilar();
    expect(count(stored)).toBe(W * H);
    stored = null;
    await store.getState().growSelectionByColor();
    expect(count(stored)).toBe(W * H);
  });

  it('does nothing without a selection', async () => {
    store.setState({ selection: null });
    await store.getState().expandSelectionBy(2);
    expect(stored).toBeNull();
    expect(store.getState().selection).toBeNull();
  });
});
