/**
 * Canvas pixel edits on the active layer:
 *  #1  the adjustments flush never re-selects a layer (no recursion) and an
 *      empty layer has nothing to adjust
 *  #2  a stroke on a moved layer keeps the layer where it is
 *  #11 a filter on an empty active layer paints that layer, not Background
 *  #13 quick successive strokes are merged one after another
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore, type Layer } from '@/features/image-editor/stores/imageEditor.store';
import { useLayerPixelEdits } from '../useLayerPixelEdits';

const IMG = 'data:image/png;base64,AAAA';
const s = () => useImageEditorStore.getState();
const labels = () => s().history.map((h) => h.label);
const layer = (id: string) => s().layers.find((l) => l.id === id)!;
const settle = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));

function mountCanvas(width = 120, height = 120) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ref = { current: canvas };
  const hook = renderHook(() => useLayerPixelEdits(ref));
  return { canvas, hook };
}

function openDoc(width = 120, height = 120) {
  useImageEditorStore.setState({ canvasWidth: width, canvasHeight: height });
  const id = s().addLayer(IMG, 'Background', { history: false });
  s().updateLayer(id, { width: 100, height: 100 });
  s().pushHistory('Open', '', false);
  return id;
}

beforeEach(() => {
  setupImageEditorTestTab();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
});

describe('#1 adjustments on an empty layer', () => {
  it('switching away from an empty layer with pending adjustments neither recurses nor edits Background', async () => {
    const bg = openDoc();
    const empty = s().addLayer('', 'Empty', { history: false });
    s().setActiveLayer(empty);
    mountCanvas();
    s().setEditMode('adjust');
    const setActive = vi.spyOn(s(), 'setActiveLayer');

    s().setAdjustment('brightness', 40);
    expect(() => act(() => s().setEditMode('move'))).not.toThrow();
    await settle();

    expect(setActive).not.toHaveBeenCalled();
    expect(layer(bg).imageData).toBe(IMG);
    expect(layer(empty).imageData).toBe('');
    expect(s().adjustments.brightness).toBe(0);
    expect(labels()).toEqual(['Open']);
  });

  it('adjustments on a raster layer are applied with one entry', async () => {
    const bg = openDoc();
    s().setActiveLayer(bg);
    mountCanvas();
    s().setAdjustment('brightness', 40);
    act(() => s().applyAdjustments());
    await settle();
    expect(labels()).toEqual(['Open', 'Adjustments']);
    expect(s().adjustments.brightness).toBe(0);
  });
});

describe('#11 filter on an empty active layer', () => {
  it('paints the empty layer (document size), not Background', async () => {
    const bg = openDoc(120, 120);
    const empty = s().addLayer('', 'Empty', { history: false });
    s().setActiveLayer(empty);
    mountCanvas();

    act(() => s().applyCanvasFilter((d) => d, 'Clouds'));
    await settle();

    expect(s().activeLayerId).toBe(empty);
    expect(layer(bg).imageData).toBe(IMG);
    const e = layer(empty);
    expect(e.imageData).not.toBe('');
    expect({ x: e.x, y: e.y, w: e.width, h: e.height }).toEqual({ x: 0, y: 0, w: 120, h: 120 });
    expect(labels()).toEqual(['Open', 'Clouds']);
  });
});

describe('#2 / #13 stroke commits', () => {
  it('a stroke on a moved layer keeps it in place (offset applied once)', async () => {
    openDoc(120, 120);
    const moved = s().addLayer(IMG, 'Moved', { history: false });
    s().updateLayer(moved, { x: 50, y: 30, width: 100, height: 100 });
    s().setActiveLayer(moved);
    const { canvas, hook } = mountCanvas();

    act(() => hook.result.current.commitStroke(canvas));
    await settle();

    const l = layer(moved);
    // covers the layer (50..150, 30..130) and the document (0..120)
    expect({ x: l.x, y: l.y, w: l.width, h: l.height }).toEqual({ x: 0, y: 0, w: 150, h: 130 });
    expect(labels()).toEqual(['Open', 'Brush Stroke']);
  });

  it('two quick strokes both land: the second merges onto the first result', async () => {
    openDoc();
    const target = s().addLayer(IMG, 'Paint', { history: false });
    s().setActiveLayer(target);
    const { canvas, hook } = mountCanvas();

    const seen: string[] = [];
    const update = s().updateLayer;
    let n = 0;
    useImageEditorStore.setState({
      updateLayer: (id: string, patch: Partial<Layer>) => {
        if (patch.imageData) {
          seen.push(layer(id).imageData);
          patch = { ...patch, imageData: `data:image/png;base64,STROKE${++n}` };
        }
        update(id, patch);
      },
    });

    act(() => {
      hook.result.current.commitStroke(canvas);
      hook.result.current.commitStroke(canvas);
    });
    await settle(40);

    // The second merge started from the first merge's pixels.
    expect(seen).toEqual([IMG, 'data:image/png;base64,STROKE1']);
    expect(layer(target).imageData).toBe('data:image/png;base64,STROKE2');
    expect(labels()).toEqual(['Open', 'Brush Stroke', 'Brush Stroke']);
  });

  it('a stroke with a group or adjustment layer active changes nothing', async () => {
    openDoc();
    const adj = s().addAdjustmentLayer('brightness-contrast');
    const { canvas, hook } = mountCanvas();
    const before = labels();
    act(() => hook.result.current.commitShape(canvas));
    await settle();
    expect(layer(adj).imageData).toBe('');
    expect(labels()).toEqual(before);
  });
});
