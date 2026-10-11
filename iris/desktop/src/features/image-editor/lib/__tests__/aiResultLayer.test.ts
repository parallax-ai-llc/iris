import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupImageEditorTestTab, mockSelection } from '@/test-utils/imageEditorHelpers';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import { addResultLayer, applyAIResultLayer, getCanvasSize } from '../aiResultLayer';

const BASE_LAYER = {
  id: 'base',
  name: 'Background',
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal' as const,
  imageData: 'data:image/png;base64,BASE',
  x: 0,
  y: 0,
  width: 1200,
  height: 800,
};

let store: ImageEditorStoreApi;

beforeEach(() => {
  store = setupImageEditorTestTab();
  store.setState({ layers: [BASE_LAYER], activeLayerId: 'base', canvasWidth: 1200, canvasHeight: 800 });
  // Baseline entry, like the one pushed when a document opens.
  store.getState().pushHistory('Open', '', false);
});

describe('addResultLayer', () => {
  it('adds one layer over the whole canvas with the given opacity and one undoable history entry', () => {
    const historyBefore = store.getState().history.length;

    const id = addResultLayer(store, {
      dataUrl: 'data:image/png;base64,RESULT',
      name: 'Relight',
      width: 1200,
      height: 800,
      opacity: 60,
      historyLabel: 'Relight',
    });

    const state = store.getState();
    const layer = state.layers.find((l) => l.id === id);
    expect(state.layers).toHaveLength(2);
    expect(state.activeLayerId).toBe(id);
    expect(layer).toMatchObject({ name: 'Relight', x: 0, y: 0, width: 1200, height: 800, opacity: 60 });
    expect(layer?.mask).toBeUndefined();
    expect(state.history).toHaveLength(historyBefore + 1);
    expect(state.history[state.historyIndex].label).toBe('Relight');

    state.undo();
    expect(store.getState().layers.map((l) => l.id)).toEqual(['base']);

    store.getState().redo();
    expect(store.getState().layers.find((l) => l.id === id)?.opacity).toBe(60);
  });

  it('clamps opacity to 0..100', () => {
    const id = addResultLayer(store, {
      dataUrl: 'data:image/png;base64,R',
      name: 'Relight',
      width: 10,
      height: 10,
      opacity: 140,
      historyLabel: 'Relight',
    });
    expect(store.getState().layers.find((l) => l.id === id)?.opacity).toBe(100);
  });

  it('attaches the mask as an enabled layer mask', () => {
    const id = addResultLayer(store, {
      dataUrl: 'data:image/png;base64,R',
      name: 'Relight',
      width: 1200,
      height: 800,
      opacity: 100,
      maskDataUrl: 'data:image/png;base64,MASK',
      historyLabel: 'Relight',
    });
    expect(store.getState().layers.find((l) => l.id === id)?.mask).toMatchObject({
      data: 'data:image/png;base64,MASK',
      enabled: true,
    });
  });
});

describe('getCanvasSize', () => {
  it('uses the stored canvas size', () => {
    expect(getCanvasSize(store)).toEqual({ width: 1200, height: 800 });
  });

  it('falls back to the layer bounds when the canvas size is unknown', () => {
    store.setState({ canvasWidth: 0, canvasHeight: 0 });
    expect(getCanvasSize(store)).toEqual({ width: 1200, height: 800 });
  });
});

describe('applyAIResultLayer', () => {
  it('scales the result to the canvas and masks it by the selection when asked', async () => {
    store.setState({ selection: mockSelection });
    const deps = {
      renderUrlToSize: vi.fn().mockResolvedValue('data:image/png;base64,SCALED'),
      selectionToLayerMask: vi.fn().mockResolvedValue('data:image/png;base64,SELMASK'),
    };

    const id = await applyAIResultLayer(
      store,
      'https://example.com/relit.png',
      { name: 'Relight', historyLabel: 'Relight', opacity: 80, maskToSelection: true },
      deps,
    );

    expect(deps.renderUrlToSize).toHaveBeenCalledWith('https://example.com/relit.png', 1200, 800);
    expect(deps.selectionToLayerMask).toHaveBeenCalledWith(mockSelection, 1200, 800);
    const layer = store.getState().layers.find((l) => l.id === id);
    expect(layer).toMatchObject({ imageData: 'data:image/png;base64,SCALED', opacity: 80, width: 1200, height: 800 });
    expect(layer?.mask?.data).toBe('data:image/png;base64,SELMASK');
  });

  it('skips the mask when maskToSelection is off or there is no selection', async () => {
    const deps = {
      renderUrlToSize: vi.fn().mockResolvedValue('data:image/png;base64,SCALED'),
      selectionToLayerMask: vi.fn(),
    };

    store.setState({ selection: mockSelection });
    const a = await applyAIResultLayer(store, 'u', { name: 'R', historyLabel: 'Relight', opacity: 100, maskToSelection: false }, deps);
    store.setState({ selection: null });
    const b = await applyAIResultLayer(store, 'u', { name: 'R', historyLabel: 'Relight', opacity: 100, maskToSelection: true }, deps);

    expect(deps.selectionToLayerMask).not.toHaveBeenCalled();
    const layers = store.getState().layers;
    expect(layers.find((l) => l.id === a)?.mask).toBeUndefined();
    expect(layers.find((l) => l.id === b)?.mask).toBeUndefined();
  });

  it('adds nothing when the result cannot be loaded', async () => {
    const deps = {
      renderUrlToSize: vi.fn().mockRejectedValue(new Error('decode failed')),
      selectionToLayerMask: vi.fn(),
    };
    const historyBefore = store.getState().history.length;

    await expect(
      applyAIResultLayer(store, 'u', { name: 'R', historyLabel: 'Relight', opacity: 100, maskToSelection: true }, deps),
    ).rejects.toThrow('decode failed');

    expect(store.getState().layers).toHaveLength(1);
    expect(store.getState().history).toHaveLength(historyBefore);
  });
});
