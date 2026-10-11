/**
 * Document edits that used to bypass history / dirty tracking:
 *  - pending adjustments flushed by setActiveLayer must not recurse (#1)
 *  - layer property changes (opacity, blend, visibility, lock) record history (#3)
 *  - warp, fill/stroke path and content-aware fill record history (#4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

vi.mock('@/shared/api/image.api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // POST answers 202 with a pending asset; the result is polled
    contentAwareFill: vi.fn(async () => ({ id: 'job-1', previewUrl: '' })),
    waitForEditResult: vi.fn(async () => ({ id: 'job-1', previewUrl: 'https://example.com/filled.png' })),
  };
});

vi.mock('@/features/image-editor/lib/aiSource', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, resolveAIInputAssetId: vi.fn(async () => 'asset-1') };
});

const IMG = 'data:image/png;base64,AAAA';
const s = () => useImageEditorStore.getState();
const labels = () => s().history.map((h) => h.label);
/** Let async image loads (mock Image fires onload on a 0ms timer) settle. */
const settle = () => new Promise<void>((r) => setTimeout(r, 5));

/** Open a document: one Background layer and the clean 'Open' baseline. */
function openDoc(width = 120, height = 120) {
  useImageEditorStore.setState({ canvasWidth: width, canvasHeight: height });
  const id = s().addLayer(IMG, 'Background', { history: false });
  s().updateLayer(id, { width, height });
  s().pushHistory('Open', '', false);
  return id;
}

beforeEach(() => {
  setupImageEditorTestTab();
});

describe('#1 pending adjustments flush does not recurse', () => {
  it('a flush callback that switches the active layer does not overflow the stack', () => {
    const bg = openDoc();
    const empty = s().addLayer('', 'Empty', { history: false });
    s().setActiveLayer(empty);
    // The canvas handler used to re-select the first raster layer when the
    // active layer was empty, which re-entered setActiveLayer -> callback.
    const callback = vi.fn(() => {
      const st = s();
      const active = st.layers.find((l) => l.id === st.activeLayerId);
      if (!active?.imageData) st.setActiveLayer(bg);
    });
    s().registerAdjustmentsApplyCallback(callback);
    s().setAdjustment('brightness', 30);

    expect(() => s().setActiveLayer(bg)).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(s().activeLayerId).toBe(bg);
  });

  it('setEditMode leaving adjust flushes once even if the callback changes mode', () => {
    openDoc();
    s().setEditMode('adjust');
    const callback = vi.fn(() => s().setEditMode('none'));
    s().registerAdjustmentsApplyCallback(callback);
    s().setAdjustment('contrast', 20);

    expect(() => s().setEditMode('move')).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('#3 layer property changes record history', () => {
  it('visibility, lock and blend each add one entry and make the document dirty', () => {
    const bg = openDoc();
    expect(s().isDirty).toBe(false);

    s().setLayerProperties(bg, { visible: false });
    expect(labels()).toEqual(['Open', 'Hide Layer']);
    expect(s().isDirty).toBe(true);

    s().setLayerProperties(bg, { blendMode: 'multiply' });
    s().setLayerProperties(bg, { locked: true });
    expect(labels()).toEqual(['Open', 'Hide Layer', 'Blending Change', 'Lock Layer']);

    s().undo();
    s().undo();
    s().undo();
    const layer = s().layers.find((l) => l.id === bg)!;
    expect(layer.visible).toBe(true);
    expect(layer.blendMode).toBe('normal');
    expect(layer.locked).toBe(false);
    expect(s().isDirty).toBe(false);
  });

  it('a slider gesture (many opacity changes) becomes one entry', () => {
    const bg = openDoc();
    for (const v of [90, 80, 70, 55]) s().setLayerProperties(bg, { opacity: v });
    expect(labels()).toEqual(['Open', 'Layer Opacity']);
    expect(s().layers[0].opacity).toBe(55);

    s().undo();
    expect(s().layers[0].opacity).toBe(100);
    s().redo();
    expect(s().layers[0].opacity).toBe(55);
  });

  it('a new opacity gesture after another edit starts a new entry', () => {
    const bg = openDoc();
    s().setLayerProperties(bg, { opacity: 80 });
    s().setLayerProperties(bg, { visible: false });
    s().setLayerProperties(bg, { opacity: 60 });
    expect(labels()).toEqual(['Open', 'Layer Opacity', 'Hide Layer', 'Layer Opacity']);
  });

  it('an unchanged value records nothing', () => {
    const bg = openDoc();
    s().setLayerProperties(bg, { opacity: 100, visible: true });
    expect(labels()).toEqual(['Open']);
    expect(s().isDirty).toBe(false);
  });

  it('coalescing into the saved entry keeps the document dirty', () => {
    const bg = openDoc();
    s().setLayerProperties(bg, { opacity: 80 });
    s().clearDirty();
    expect(s().isDirty).toBe(false);
    s().setLayerProperties(bg, { opacity: 70 });
    expect(labels()).toEqual(['Open', 'Layer Opacity']);
    expect(s().isDirty).toBe(true);
  });
});

describe('#4 pixel operations record history', () => {
  it('applyWarp pushes a Warp entry and marks dirty', async () => {
    openDoc();
    s().resetWarpGrid();
    useImageEditorStore.setState({ isWarpMode: true });
    await s().applyWarp();
    expect(labels()).toEqual(['Open', 'Warp']);
    expect(s().isDirty).toBe(true);
    expect(s().isWarpMode).toBe(false);
  });

  it('fillPath paints an empty layer as a document-size layer and records history', async () => {
    openDoc(120, 120);
    const empty = s().addLayer('', 'Empty', { history: false });
    s().setActiveLayer(empty);
    const pathId = s().addPath('P');
    s().addPathPoint(pathId, { x: 0, y: 0 } as never);
    s().addPathPoint(pathId, { x: 50, y: 0 } as never);
    s().addPathPoint(pathId, { x: 50, y: 50 } as never);

    await s().fillPath(pathId);
    await settle();
    const layer = s().layers.find((l) => l.id === empty)!;
    expect(layer.imageData).not.toBe('');
    expect({ x: layer.x, y: layer.y, w: layer.width, h: layer.height }).toEqual({ x: 0, y: 0, w: 120, h: 120 });
    expect(labels()).toEqual(['Open', 'Fill Path']);
  });

  it('strokePath keeps an offset layer in place (covers layer and document)', async () => {
    openDoc(120, 120);
    const moved = s().addLayer(IMG, 'Moved', { history: false });
    s().updateLayer(moved, { x: 50, y: 50, width: 100, height: 100 });
    s().setActiveLayer(moved);
    const pathId = s().addPath('P');
    s().addPathPoint(pathId, { x: 0, y: 0 } as never);
    s().addPathPoint(pathId, { x: 100, y: 100 } as never);

    await s().strokePath(pathId);
    await settle();
    const layer = s().layers.find((l) => l.id === moved)!;
    expect({ x: layer.x, y: layer.y, w: layer.width, h: layer.height }).toEqual({ x: 0, y: 0, w: 150, h: 150 });
    expect(labels()).toEqual(['Open', 'Stroke Path']);
  });

  it('contentAwareFill sets isProcessing while running and records history', async () => {
    const bg = openDoc();
    useImageEditorStore.setState({
      sourceAsset: { id: 'asset-1' } as never,
      selection: { maskDataUrl: IMG, isInverted: false } as never,
    });
    s().setActiveLayer(bg);
    const running = s().contentAwareFill();
    expect(s().isProcessing).toBe(true);
    await running;
    expect(s().isProcessing).toBe(false);
    expect(labels()).toEqual(['Open', 'Content-Aware Fill']);
    expect(s().selection).toBeNull();
    expect(s().isDirty).toBe(true);
  });
});
