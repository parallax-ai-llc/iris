/**
 * Layer geometry rules (#2 offset once, #11 empty layer = document, #12 mask
 * cut to the layer, #8 group visibility / layer mask placement).
 */

import { describe, it, expect } from 'vitest';
import {
  cropMaskToRect,
  editSurfaceRect,
  isEffectivelyVisible,
  isPaintableLayer,
  layerMaskRect,
  layerRect,
  unionRect,
} from '../layerRegion';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';

function layer(over: Partial<Layer>): Layer {
  return {
    id: 'l', name: 'L', visible: true, locked: false, opacity: 100, blendMode: 'normal',
    imageData: 'data:x', x: 0, y: 0, width: 10, height: 10, ...over,
  };
}

describe('layerRect / editSurfaceRect', () => {
  it('an empty layer covers the document at (0, 0)', () => {
    expect(layerRect(layer({ imageData: '', x: 30, y: 30, width: 0, height: 0 }), 200, 100))
      .toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('the edit surface of a moved layer covers the layer and the document', () => {
    expect(editSurfaceRect(layer({ x: 150, y: 50, width: 100, height: 100 }), 200, 100))
      .toEqual({ x: 0, y: 0, width: 250, height: 150 });
    expect(editSurfaceRect(layer({ x: -20, y: -10, width: 50, height: 50 }), 200, 100))
      .toEqual({ x: -20, y: -10, width: 220, height: 110 });
  });

  it('unionRect', () => {
    expect(unionRect({ x: 0, y: 0, width: 5, height: 5 }, { x: 3, y: -2, width: 5, height: 5 }))
      .toEqual({ x: 0, y: -2, width: 8, height: 7 });
  });
});

describe('cropMaskToRect', () => {
  it('cuts the document mask at the layer offset, zero outside the document', () => {
    // 4x2 document mask: row 0 = 1 2 3 4, row 1 = 5 6 7 8
    const mask = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
    // A 3x2 layer at (2, 1): covers doc (2..4, 1..2)
    const cut = cropMaskToRect(mask, 4, 2, { x: 2, y: 1, width: 3, height: 2 });
    expect(Array.from(cut)).toEqual([7, 8, 0, 0, 0, 0]);
  });

  it('a layer at the origin with the document size gets the mask unchanged', () => {
    const mask = new Uint8ClampedArray([9, 8, 7, 6]);
    expect(Array.from(cropMaskToRect(mask, 2, 2, { x: 0, y: 0, width: 2, height: 2 }))).toEqual([9, 8, 7, 6]);
  });
});

describe('layerMaskRect', () => {
  it('a document-size mask sits at the document origin', () => {
    expect(layerMaskRect(200, 100, { x: 20, y: 10, width: 50, height: 50 }, 200, 100))
      .toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('a layer-size mask sits at the layer offset (PSD rule)', () => {
    expect(layerMaskRect(50, 50, { x: 20, y: 10, width: 50, height: 50 }, 200, 100))
      .toEqual({ x: 20, y: 10, width: 50, height: 50 });
  });
});

describe('isEffectivelyVisible', () => {
  it('a layer inside a hidden group (or nested group) is hidden', () => {
    const outer = layer({ id: 'g1', type: 'group', visible: false });
    const inner = layer({ id: 'g2', type: 'group', parentId: 'g1' });
    const child = layer({ id: 'c', parentId: 'g2' });
    const loose = layer({ id: 'x' });
    const byId = new Map([outer, inner, child, loose].map((l) => [l.id, l]));
    expect(isEffectivelyVisible(child, byId)).toBe(false);
    expect(isEffectivelyVisible(loose, byId)).toBe(true);
    byId.set('g1', { ...outer, visible: true });
    expect(isEffectivelyVisible(child, byId)).toBe(true);
  });

  it('a parent cycle does not loop forever', () => {
    const a = layer({ id: 'a', parentId: 'b' });
    const b = layer({ id: 'b', parentId: 'a', type: 'group' });
    expect(isEffectivelyVisible(a, new Map([[a.id, a], [b.id, b]]))).toBe(true);
  });
});

describe('isPaintableLayer', () => {
  it('raster and untyped layers only', () => {
    expect(isPaintableLayer(layer({}))).toBe(true);
    expect(isPaintableLayer(layer({ type: 'raster' }))).toBe(true);
    expect(isPaintableLayer(layer({ type: 'group' }))).toBe(false);
    expect(isPaintableLayer(layer({ type: 'adjustment' }))).toBe(false);
    expect(isPaintableLayer(layer({ type: 'fill' }))).toBe(false);
    expect(isPaintableLayer(null)).toBe(false);
  });
});
