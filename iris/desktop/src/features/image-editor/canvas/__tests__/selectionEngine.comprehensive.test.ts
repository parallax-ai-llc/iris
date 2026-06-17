/**
 * selectionEngine — Comprehensive tests
 *
 * Covers all exported functions NOT already tested in:
 *   - selectionEngine.phase1.test.ts (smoothSelection, borderSelection, growSelection, similarSelection)
 *   - selectionEngine.refineEdge.test.ts (refineEdge, loadMaskAsSelection, loadSelectionMask)
 */

import { describe, it, expect } from 'vitest';
import {
  // Mask creation
  createEmptyMask,
  createFullMask,
  createRectangleMask,
  createEllipseMask,
  createPolygonMask,

  // Mask operations
  addToSelection,
  subtractFromSelection,
  intersectSelection,
  invertSelection,
  featherSelection,
  expandSelection,
  contractSelection,

  // Bounds
  getSelectionBounds,

  // Mask <-> Canvas conversions
  maskToCanvas,
  maskToDataUrl,
  canvasToMask,

  // Fill / Delete / Copy / Cut
  fillSelection,
  deleteSelection,
  copySelection,
  cutSelection,

  // Transform
  transformSelectionBounds,

  // Drawing (marching ants)
  drawMarchingAnts,
  drawSelectionOutline,

  // Utilities
  isPointInSelection,
  isSelectionEmpty,
  getSelectionArea,

  // Magnetic lasso
  computeEdgeMap,
  snapToEdge,
  createMagneticLassoMask,

  // Single row/column
  singleRowMarquee,
  singleColumnMarquee,

  // Types
  type SelectionBounds,
} from '../selectionEngine';

// ==================== Helpers ====================

function makeMask(w: number, h: number, pixels: number[], value = 255): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(w * h);
  for (const i of pixels) mask[i] = value;
  return mask;
}

function makeBlockMask(
  w: number,
  h: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(w * h);
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (x >= 0 && x < w && y >= 0 && y < h) mask[y * w + x] = 255;
    }
  }
  return mask;
}

function countAbove(mask: Uint8ClampedArray, threshold = 127): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > threshold) c++;
  return c;
}

function makeImageData(
  w: number,
  h: number,
  fill: [number, number, number, number] = [128, 128, 128, 255],
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}

// ==================== createEmptyMask ====================

describe('createEmptyMask', () => {
  it('returns correct length', () => {
    const mask = createEmptyMask(10, 20);
    expect(mask.length).toBe(200);
  });

  it('all values are 0', () => {
    const mask = createEmptyMask(5, 5);
    for (let i = 0; i < mask.length; i++) expect(mask[i]).toBe(0);
  });

  it('returns Uint8ClampedArray', () => {
    expect(createEmptyMask(1, 1)).toBeInstanceOf(Uint8ClampedArray);
  });
});

// ==================== createFullMask ====================

describe('createFullMask', () => {
  it('returns correct length', () => {
    expect(createFullMask(8, 4).length).toBe(32);
  });

  it('all values are 255', () => {
    const mask = createFullMask(3, 3);
    for (let i = 0; i < mask.length; i++) expect(mask[i]).toBe(255);
  });
});

// ==================== createRectangleMask ====================

describe('createRectangleMask', () => {
  it('selects only within bounds', () => {
    const mask = createRectangleMask(10, 10, { x: 2, y: 3, width: 4, height: 3 });
    expect(mask.length).toBe(100);
    // Inside
    expect(mask[3 * 10 + 2]).toBe(255);
    expect(mask[5 * 10 + 5]).toBe(255);
    // Outside
    expect(mask[0]).toBe(0);
    expect(mask[2 * 10 + 2]).toBe(0); // row 2, col 2 — above bounds
  });

  it('correct selected pixel count', () => {
    const mask = createRectangleMask(20, 20, { x: 5, y: 5, width: 10, height: 10 });
    expect(countAbove(mask)).toBe(100);
  });

  it('clamps to canvas boundaries', () => {
    const mask = createRectangleMask(10, 10, { x: -5, y: -5, width: 20, height: 20 });
    // Should select entire 10x10 canvas
    expect(countAbove(mask)).toBe(100);
  });

  it('returns empty mask for zero-size bounds', () => {
    const mask = createRectangleMask(10, 10, { x: 5, y: 5, width: 0, height: 0 });
    expect(countAbove(mask)).toBe(0);
  });
});

// ==================== createEllipseMask ====================

describe('createEllipseMask', () => {
  it('returns correct length', () => {
    const mask = createEllipseMask(20, 20, { x: 2, y: 2, width: 16, height: 16 });
    expect(mask.length).toBe(400);
  });

  it('center pixel is selected', () => {
    const mask = createEllipseMask(20, 20, { x: 5, y: 5, width: 10, height: 10 });
    // Center at (10, 10)
    expect(mask[10 * 20 + 10]).toBe(255);
  });

  it('corner pixels are not selected', () => {
    const mask = createEllipseMask(20, 20, { x: 5, y: 5, width: 10, height: 10 });
    expect(mask[0]).toBe(0);          // top-left corner
    expect(mask[19 * 20 + 19]).toBe(0); // bottom-right corner
  });

  it('selected area is less than bounding rectangle', () => {
    const bounds = { x: 2, y: 2, width: 16, height: 16 };
    const ellipse = countAbove(createEllipseMask(20, 20, bounds));
    const rect = countAbove(createRectangleMask(20, 20, bounds));
    expect(ellipse).toBeLessThan(rect);
    expect(ellipse).toBeGreaterThan(0);
  });
});

// ==================== createPolygonMask ====================

describe('createPolygonMask', () => {
  it('returns empty mask for fewer than 3 points', () => {
    const mask = createPolygonMask(10, 10, [{ x: 1, y: 1 }, { x: 5, y: 5 }]);
    expect(countAbove(mask)).toBe(0);
  });

  it('returns correct size', () => {
    const mask = createPolygonMask(10, 10, [
      { x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 8 },
    ]);
    expect(mask.length).toBe(100);
  });

  it('selects pixels inside a triangle', () => {
    const mask = createPolygonMask(20, 20, [
      { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 10, y: 15 },
    ]);
    // Center of triangle should be selected
    expect(mask[9 * 20 + 10]).toBe(255);
    expect(countAbove(mask)).toBeGreaterThan(0);
  });
});

// ==================== addToSelection ====================

describe('addToSelection', () => {
  it('returns max of two masks', () => {
    const a = makeMask(4, 4, [0, 1], 200);
    const b = makeMask(4, 4, [1, 2], 100);
    const result = addToSelection(a, b);
    expect(result[0]).toBe(200);
    expect(result[1]).toBe(200); // max(200, 100)
    expect(result[2]).toBe(100);
    expect(result[3]).toBe(0);
  });

  it('does not mutate inputs', () => {
    const a = makeMask(4, 4, [0]);
    const b = makeMask(4, 4, [1]);
    const aCopy = new Uint8ClampedArray(a);
    addToSelection(a, b);
    expect(Array.from(a)).toEqual(Array.from(aCopy));
  });

  it('returns same length', () => {
    const a = createEmptyMask(5, 5);
    const b = createFullMask(5, 5);
    expect(addToSelection(a, b).length).toBe(25);
  });
});

// ==================== subtractFromSelection ====================

describe('subtractFromSelection', () => {
  it('subtracts correctly', () => {
    const a = makeMask(4, 4, [0, 1, 2], 255);
    const b = makeMask(4, 4, [1], 255);
    const result = subtractFromSelection(a, b);
    expect(result[0]).toBe(255);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(255);
  });

  it('clamps to 0', () => {
    const a = makeMask(4, 4, [0], 50);
    const b = makeMask(4, 4, [0], 200);
    const result = subtractFromSelection(a, b);
    expect(result[0]).toBe(0);
  });

  it('does not mutate inputs', () => {
    const a = createFullMask(3, 3);
    const aCopy = new Uint8ClampedArray(a);
    subtractFromSelection(a, createFullMask(3, 3));
    expect(Array.from(a)).toEqual(Array.from(aCopy));
  });
});

// ==================== intersectSelection ====================

describe('intersectSelection', () => {
  it('returns min of two masks', () => {
    const a = makeMask(4, 4, [0, 1], 200);
    const b = makeMask(4, 4, [1, 2], 100);
    const result = intersectSelection(a, b);
    expect(result[0]).toBe(0);   // min(200, 0)
    expect(result[1]).toBe(100); // min(200, 100)
    expect(result[2]).toBe(0);   // min(0, 100)
  });

  it('does not mutate inputs', () => {
    const a = createFullMask(3, 3);
    const aCopy = new Uint8ClampedArray(a);
    intersectSelection(a, createFullMask(3, 3));
    expect(Array.from(a)).toEqual(Array.from(aCopy));
  });
});

// ==================== invertSelection ====================

describe('invertSelection', () => {
  it('inverts 0 to 255 and vice versa', () => {
    const mask = makeMask(4, 4, [0, 1]);
    const result = invertSelection(mask);
    expect(result[0]).toBe(0);
    expect(result[2]).toBe(255);
  });

  it('inverts intermediate values', () => {
    const mask = new Uint8ClampedArray([100]);
    const result = invertSelection(mask);
    expect(result[0]).toBe(155);
  });

  it('double invert returns original', () => {
    const mask = makeMask(5, 5, [3, 7, 12], 128);
    const result = invertSelection(invertSelection(mask));
    expect(Array.from(result)).toEqual(Array.from(mask));
  });

  it('does not mutate input', () => {
    const mask = makeMask(3, 3, [0]);
    const copy = new Uint8ClampedArray(mask);
    invertSelection(mask);
    expect(Array.from(mask)).toEqual(Array.from(copy));
  });
});

// ==================== featherSelection ====================

describe('featherSelection', () => {
  it('returns copy when radius is 0', () => {
    const mask = makeMask(8, 8, [27]); // center-ish
    const result = featherSelection(mask, 8, 8, 0);
    expect(Array.from(result)).toEqual(Array.from(mask));
  });

  it('returns correct length', () => {
    const mask = makeBlockMask(10, 10, 3, 3, 4, 4);
    const result = featherSelection(mask, 10, 10, 2);
    expect(result.length).toBe(100);
  });

  it('creates soft/intermediate values on edges', () => {
    const mask = makeBlockMask(20, 20, 5, 5, 10, 10);
    const result = featherSelection(mask, 20, 20, 3);
    let hasSoft = false;
    for (let i = 0; i < result.length; i++) {
      if (result[i] > 0 && result[i] < 255) { hasSoft = true; break; }
    }
    expect(hasSoft).toBe(true);
  });

  it('preserves center, zeroes far corners, softens edges spatially', () => {
    // Use a large canvas with a large centered block so center is far from edges
    const mask = makeBlockMask(40, 40, 10, 10, 20, 20);
    const result = featherSelection(mask, 40, 40, 2);
    // Center of block (20, 20) is 10px from any edge — should remain fully selected
    expect(result[20 * 40 + 20]).toBe(255);
    // Far corner (0, 0) is 10+ px from block — should still be unselected
    expect(result[0]).toBe(0);
    // Edge pixel just outside block boundary should have intermediate value
    // Pixel at (9, 20) is 1px outside left edge of block (x=10..29)
    const edgePixel = result[20 * 40 + 9];
    expect(edgePixel).toBeGreaterThan(0);
    expect(edgePixel).toBeLessThan(255);
  });

  it('does not mutate input', () => {
    const mask = makeBlockMask(10, 10, 2, 2, 6, 6);
    const copy = new Uint8ClampedArray(mask);
    featherSelection(mask, 10, 10, 2);
    expect(Array.from(mask)).toEqual(Array.from(copy));
  });

  it('all values remain in [0, 255]', () => {
    const mask = makeBlockMask(10, 10, 2, 2, 6, 6);
    const result = featherSelection(mask, 10, 10, 3);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ==================== expandSelection ====================

describe('expandSelection', () => {
  it('returns copy when amount is 0', () => {
    const mask = makeMask(8, 8, [27]);
    const result = expandSelection(mask, 8, 8, 0);
    expect(Array.from(result)).toEqual(Array.from(mask));
  });

  it('expands selection', () => {
    const mask = makeBlockMask(20, 20, 8, 8, 4, 4);
    const before = countAbove(mask);
    const result = expandSelection(mask, 20, 20, 2);
    const after = countAbove(result);
    expect(after).toBeGreaterThan(before);
  });

  it('spatially expands into neighboring pixels', () => {
    // Block at (8,8) size (4,4) → covers x=8..11, y=8..11
    const mask = makeBlockMask(20, 20, 8, 8, 4, 4);
    const result = expandSelection(mask, 20, 20, 2);
    // Pixel at (6, 8) is 2px left of block left edge — should now be selected
    expect(result[8 * 20 + 6]).toBeGreaterThan(127);
    // Pixel at (8, 6) is 2px above block top edge — should now be selected
    expect(result[6 * 20 + 8]).toBeGreaterThan(127);
    // Far corner (0, 0) should still be unselected
    expect(result[0]).toBe(0);
  });

  it('does not mutate input', () => {
    const mask = makeBlockMask(10, 10, 3, 3, 4, 4);
    const copy = new Uint8ClampedArray(mask);
    expandSelection(mask, 10, 10, 1);
    expect(Array.from(mask)).toEqual(Array.from(copy));
  });

  it('larger amount produces more selected pixels', () => {
    const mask = makeBlockMask(20, 20, 8, 8, 4, 4);
    const r1 = countAbove(expandSelection(mask, 20, 20, 1));
    const r2 = countAbove(expandSelection(mask, 20, 20, 3));
    expect(r2).toBeGreaterThan(r1);
  });

  it('expanding empty mask stays empty', () => {
    const mask = createEmptyMask(10, 10);
    const result = expandSelection(mask, 10, 10, 5);
    expect(countAbove(result)).toBe(0);
  });
});

// ==================== contractSelection ====================

describe('contractSelection', () => {
  it('returns copy when amount is 0', () => {
    const mask = makeBlockMask(10, 10, 2, 2, 6, 6);
    const result = contractSelection(mask, 10, 10, 0);
    expect(Array.from(result)).toEqual(Array.from(mask));
  });

  it('contracts selection', () => {
    const mask = makeBlockMask(20, 20, 4, 4, 12, 12);
    const before = countAbove(mask);
    const result = contractSelection(mask, 20, 20, 2);
    const after = countAbove(result);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it('does not mutate input', () => {
    const mask = makeBlockMask(10, 10, 2, 2, 6, 6);
    const copy = new Uint8ClampedArray(mask);
    contractSelection(mask, 10, 10, 1);
    expect(Array.from(mask)).toEqual(Array.from(copy));
  });

  it('contracting a single pixel removes it', () => {
    const mask = makeMask(10, 10, [55]); // single pixel
    const result = contractSelection(mask, 10, 10, 1);
    expect(countAbove(result)).toBe(0);
  });
});

// ==================== getSelectionBounds ====================

describe('getSelectionBounds', () => {
  it('returns null for empty mask', () => {
    const mask = createEmptyMask(10, 10);
    expect(getSelectionBounds(mask, 10, 10)).toBeNull();
  });

  it('returns correct bounds for a block', () => {
    const mask = makeBlockMask(20, 20, 5, 3, 8, 6);
    const bounds = getSelectionBounds(mask, 20, 20);
    expect(bounds).toEqual({ x: 5, y: 3, width: 8, height: 6 });
  });

  it('returns 1x1 bounds for single pixel', () => {
    const mask = makeMask(10, 10, [35]); // row 3, col 5
    const bounds = getSelectionBounds(mask, 10, 10);
    expect(bounds).toEqual({ x: 5, y: 3, width: 1, height: 1 });
  });

  it('returns full canvas for full mask', () => {
    const mask = createFullMask(8, 6);
    const bounds = getSelectionBounds(mask, 8, 6);
    expect(bounds).toEqual({ x: 0, y: 0, width: 8, height: 6 });
  });
});

// ==================== maskToCanvas ====================

describe('maskToCanvas', () => {
  it('returns an HTMLCanvasElement', () => {
    const mask = makeMask(4, 4, [0]);
    const canvas = maskToCanvas(mask, 4, 4);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(4);
  });

  it('does not throw with various mask values', () => {
    const mask = new Uint8ClampedArray([0, 128, 255, 50]);
    expect(() => maskToCanvas(mask, 2, 2)).not.toThrow();
  });
});

// ==================== maskToDataUrl ====================

describe('maskToDataUrl', () => {
  it('returns a data URL string', () => {
    const mask = makeMask(4, 4, [0]);
    const url = maskToDataUrl(mask, 4, 4);
    expect(typeof url).toBe('string');
    expect(url.startsWith('data:image/png')).toBe(true);
  });
});

// ==================== canvasToMask ====================

describe('canvasToMask', () => {
  it('returns a Uint8ClampedArray of correct length', () => {
    // jsdom canvas mock does not faithfully round-trip pixel data,
    // so we only verify the shape and type of the result.
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 3;
    const recovered = canvasToMask(canvas);
    expect(recovered).toBeInstanceOf(Uint8ClampedArray);
    expect(recovered.length).toBe(9);
  });

  it('does not throw', () => {
    const original = new Uint8ClampedArray([0, 64, 128, 255]);
    const canvas = maskToCanvas(original, 2, 2);
    expect(() => canvasToMask(canvas)).not.toThrow();
  });
});

// ==================== fillSelection ====================

describe('fillSelection', () => {
  it('does not throw with selected pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const mask = makeMask(4, 4, [0, 1]);
    expect(() => fillSelection(canvas, mask, '#ff0000')).not.toThrow();
  });

  it('does not throw with empty mask', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const mask = createEmptyMask(2, 2);
    expect(() => fillSelection(canvas, mask, '#ffffff')).not.toThrow();
  });

  it('does not throw with full mask', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const mask = createFullMask(4, 4);
    expect(() => fillSelection(canvas, mask, '#00ff00')).not.toThrow();
  });

  it('fills masked pixels with the specified color', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    // Start with black pixels
    const initial = ctx.createImageData(4, 4);
    for (let i = 0; i < 4 * 4; i++) {
      initial.data[i * 4 + 3] = 255; // opaque black
    }
    ctx.putImageData(initial, 0, 0);

    const mask = createFullMask(4, 4);
    fillSelection(canvas, mask, '#ff0000');

    const result = ctx.getImageData(0, 0, 4, 4);
    // Pixel 0 should now be red
    expect(result.data[0]).toBe(255); // R
    expect(result.data[1]).toBe(0);   // G
    expect(result.data[2]).toBe(0);   // B
  });
});

// ==================== deleteSelection ====================

describe('deleteSelection', () => {
  it('does not throw with selected pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const mask = makeMask(4, 4, [0]);
    expect(() => deleteSelection(canvas, mask)).not.toThrow();
  });

  it('does not throw with empty mask', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(() => deleteSelection(canvas, createEmptyMask(4, 4))).not.toThrow();
  });

  it('sets alpha to 0 in masked area', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    // Fill with opaque white
    const initial = ctx.createImageData(4, 4);
    for (let i = 0; i < 4 * 4; i++) {
      initial.data[i * 4] = 255;
      initial.data[i * 4 + 1] = 255;
      initial.data[i * 4 + 2] = 255;
      initial.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(initial, 0, 0);

    // Delete pixel 0 only
    const mask = makeMask(4, 4, [0]);
    deleteSelection(canvas, mask);

    const result = ctx.getImageData(0, 0, 4, 4);
    // Pixel 0 alpha should be 0 (deleted)
    expect(result.data[3]).toBe(0);
    // Pixel 1 alpha should remain 255 (unaffected)
    expect(result.data[7]).toBe(255);
  });
});

// ==================== copySelection ====================

describe('copySelection', () => {
  it('returns an HTMLCanvasElement of same dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const mask = makeMask(4, 4, [0]);
    const result = copySelection(canvas, mask);
    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('does not throw with full mask', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 3;
    expect(() => copySelection(canvas, createFullMask(3, 3))).not.toThrow();
  });

  it('does not throw with empty mask', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 3;
    expect(() => copySelection(canvas, createEmptyMask(3, 3))).not.toThrow();
  });

  it('copies masked pixels with non-zero alpha in masked area', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    // Fill with opaque red
    const initial = ctx.createImageData(4, 4);
    for (let i = 0; i < 4 * 4; i++) {
      initial.data[i * 4] = 255;     // R
      initial.data[i * 4 + 3] = 255; // A
    }
    ctx.putImageData(initial, 0, 0);

    // Copy with full mask — all pixels should be copied
    const result = copySelection(canvas, createFullMask(4, 4));
    const resultCtx = result.getContext('2d')!;
    const resultData = resultCtx.getImageData(0, 0, 4, 4);
    // Pixel 0 should have non-zero alpha (was copied)
    expect(resultData.data[3]).toBeGreaterThan(0);
    expect(resultData.data[0]).toBe(255); // R channel preserved
  });
});

// ==================== cutSelection ====================

describe('cutSelection', () => {
  it('returns an HTMLCanvasElement', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const mask = makeMask(4, 4, [0]);
    const copied = cutSelection(canvas, mask);
    expect(copied).toBeInstanceOf(HTMLCanvasElement);
    expect(copied.width).toBe(4);
    expect(copied.height).toBe(4);
  });

  it('does not throw with various masks', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 3;
    expect(() => cutSelection(canvas, createFullMask(3, 3))).not.toThrow();
    expect(() => cutSelection(canvas, createEmptyMask(3, 3))).not.toThrow();
  });

  it('modifies source canvas by clearing masked pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    // Fill with opaque white
    const initial = ctx.createImageData(4, 4);
    for (let i = 0; i < 4 * 4; i++) {
      initial.data[i * 4] = 255;
      initial.data[i * 4 + 1] = 255;
      initial.data[i * 4 + 2] = 255;
      initial.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(initial, 0, 0);

    // Cut pixel 0
    const mask = makeMask(4, 4, [0]);
    cutSelection(canvas, mask);

    // Source pixel 0 should now have alpha 0 (deleted by cut)
    const after = ctx.getImageData(0, 0, 4, 4);
    expect(after.data[3]).toBe(0);
    // Source pixel 1 should be unaffected
    expect(after.data[7]).toBe(255);
  });
});

// ==================== transformSelectionBounds ====================

describe('transformSelectionBounds', () => {
  const base: SelectionBounds = { x: 10, y: 20, width: 100, height: 50 };

  it('applies translation', () => {
    const result = transformSelectionBounds(base, { translateX: 5, translateY: -10 });
    expect(result.x).toBe(15);
    expect(result.y).toBe(10);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('applies scale', () => {
    const result = transformSelectionBounds(base, { scaleX: 2, scaleY: 0.5 });
    expect(result.width).toBe(200);
    expect(result.height).toBe(25);
    // Center should remain the same
    const origCx = base.x + base.width / 2;
    const resultCx = result.x + result.width / 2;
    expect(resultCx).toBeCloseTo(origCx, 5);
  });

  it('no-op with empty transform', () => {
    const result = transformSelectionBounds(base, {});
    expect(result).toEqual(base);
  });

  it('combines translate and scale', () => {
    const result = transformSelectionBounds(base, {
      translateX: 10,
      scaleX: 2,
    });
    expect(result.x).toBe(10 + 10 - 100 / 2); // translate first, then scale centers
    expect(result.width).toBe(200);
  });

  it('does not mutate input', () => {
    const copy = { ...base };
    transformSelectionBounds(base, { translateX: 50, scaleX: 3 });
    expect(base).toEqual(copy);
  });
});

// ==================== drawMarchingAnts ====================

describe('drawMarchingAnts', () => {
  it('does not throw with a simple mask', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d')!;
    const mask = makeBlockMask(10, 10, 2, 2, 6, 6);
    expect(() => drawMarchingAnts(ctx, mask, 10, 10, 0)).not.toThrow();
  });

  it('does not throw with empty mask', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 5;
    canvas.height = 5;
    const ctx = canvas.getContext('2d')!;
    const mask = createEmptyMask(5, 5);
    expect(() => drawMarchingAnts(ctx, mask, 5, 5)).not.toThrow();
  });

  it('does not throw with offset', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d')!;
    const mask = makeBlockMask(10, 10, 1, 1, 8, 8);
    expect(() => drawMarchingAnts(ctx, mask, 10, 10, 12)).not.toThrow();
  });
});

// ==================== drawSelectionOutline ====================

describe('drawSelectionOutline', () => {
  it('draws rectangle outline without error', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext('2d')!;
    expect(() =>
      drawSelectionOutline(ctx, { x: 2, y: 2, width: 16, height: 16 }, 0, 'rectangle')
    ).not.toThrow();
  });

  it('draws ellipse outline without error', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext('2d')!;
    expect(() =>
      drawSelectionOutline(ctx, { x: 2, y: 2, width: 16, height: 16 }, 4, 'ellipse')
    ).not.toThrow();
  });
});

// ==================== isPointInSelection ====================

describe('isPointInSelection', () => {
  it('returns true for selected pixel', () => {
    const mask = makeBlockMask(10, 10, 3, 3, 4, 4);
    expect(isPointInSelection(mask, 10, 5, 5)).toBe(true);
  });

  it('returns false for unselected pixel', () => {
    const mask = makeBlockMask(10, 10, 3, 3, 4, 4);
    expect(isPointInSelection(mask, 10, 0, 0)).toBe(false);
  });

  it('handles fractional coordinates by flooring', () => {
    const mask = makeMask(10, 10, [0]); // only pixel (0,0)
    expect(isPointInSelection(mask, 10, 0.9, 0.9)).toBe(true);
    expect(isPointInSelection(mask, 10, 1.0, 0)).toBe(false);
  });

  it('returns false for negative coordinates', () => {
    const mask = createFullMask(10, 10);
    expect(isPointInSelection(mask, 10, -1, -1)).toBe(false);
    expect(isPointInSelection(mask, 10, -1, 5)).toBe(false);
    expect(isPointInSelection(mask, 10, 5, -1)).toBe(false);
  });

  it('returns false for coordinates beyond width/height', () => {
    const mask = createFullMask(10, 10);
    expect(isPointInSelection(mask, 10, 10, 5)).toBe(false);  // x == width
    expect(isPointInSelection(mask, 10, 5, 10)).toBe(false);  // y == height
    expect(isPointInSelection(mask, 10, 11, 11)).toBe(false);  // beyond both
  });
});

// ==================== isSelectionEmpty ====================

describe('isSelectionEmpty', () => {
  it('returns true for empty mask', () => {
    expect(isSelectionEmpty(createEmptyMask(10, 10))).toBe(true);
  });

  it('returns false for non-empty mask', () => {
    expect(isSelectionEmpty(makeMask(10, 10, [5]))).toBe(false);
  });

  it('returns false even for very small value (1)', () => {
    expect(isSelectionEmpty(makeMask(4, 4, [0], 1))).toBe(false);
  });
});

// ==================== getSelectionArea ====================

describe('getSelectionArea', () => {
  it('returns 0 for empty mask', () => {
    expect(getSelectionArea(createEmptyMask(10, 10))).toBe(0);
  });

  it('counts pixels above 127', () => {
    const mask = new Uint8ClampedArray([0, 50, 127, 128, 200, 255]);
    // 128, 200, 255 are > 127
    expect(getSelectionArea(mask)).toBe(3);
  });

  it('returns full count for full mask', () => {
    expect(getSelectionArea(createFullMask(5, 5))).toBe(25);
  });
});

// ==================== computeEdgeMap ====================

describe('computeEdgeMap', () => {
  it('returns Float32Array of correct length', () => {
    const imgData = makeImageData(10, 10);
    const edges = computeEdgeMap(imgData);
    expect(edges).toBeInstanceOf(Float32Array);
    expect(edges.length).toBe(100);
  });

  it('border pixels are 0 (no Sobel on edges)', () => {
    const imgData = makeImageData(10, 10);
    const edges = computeEdgeMap(imgData);
    // First row, first column, last row, last column should be 0
    expect(edges[0]).toBe(0);
    expect(edges[9]).toBe(0);
    expect(edges[90]).toBe(0);
    expect(edges[99]).toBe(0);
  });

  it('uniform image produces zero edges in interior', () => {
    const imgData = makeImageData(10, 10, [100, 100, 100, 255]);
    const edges = computeEdgeMap(imgData);
    // All interior values should be 0 since uniform
    for (let y = 1; y < 9; y++) {
      for (let x = 1; x < 9; x++) {
        expect(edges[y * 10 + x]).toBeCloseTo(0, 5);
      }
    }
  });

  it('detects edges at color transitions', () => {
    const w = 10, h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    // Left half black, right half white
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const val = x < 5 ? 0 : 255;
        const i = (y * w + x) * 4;
        data[i] = val; data[i + 1] = val; data[i + 2] = val; data[i + 3] = 255;
      }
    }
    const imgData = { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
    const edges = computeEdgeMap(imgData);

    // Pixel at column 5 (transition) should have high edge value
    const edgeVal = edges[5 * w + 5]; // middle row, column 5
    expect(edgeVal).toBeGreaterThan(0);
  });

  it('does not mutate input', () => {
    const imgData = makeImageData(5, 5);
    const dataCopy = imgData.data.slice();
    computeEdgeMap(imgData);
    expect(Array.from(imgData.data)).toEqual(Array.from(dataCopy));
  });
});

// ==================== snapToEdge ====================

describe('snapToEdge', () => {
  it('returns nearest edge point within search radius', () => {
    const w = 10, h = 10;
    const edgeMap = new Float32Array(w * h);
    // Place a strong edge at (7, 5)
    edgeMap[5 * w + 7] = 500;
    const result = snapToEdge(edgeMap, w, h, 6, 5, 5);
    expect(result.x).toBe(7);
    expect(result.y).toBe(5);
  });

  it('returns original point when no edges in radius', () => {
    const w = 10, h = 10;
    const edgeMap = new Float32Array(w * h); // all zeros
    const result = snapToEdge(edgeMap, w, h, 5, 5, 3);
    expect(result.x).toBe(5);
    expect(result.y).toBe(5);
  });

  it('prefers closer edges with equal strength', () => {
    const w = 20, h = 20;
    const edgeMap = new Float32Array(w * h);
    edgeMap[10 * w + 9] = 100;  // distance 1 from (10,10)
    edgeMap[10 * w + 7] = 100;  // distance 3 from (10,10)
    const result = snapToEdge(edgeMap, w, h, 10, 10, 5);
    // Closer edge should win due to distance weighting
    expect(result.x).toBe(9);
  });
});

// ==================== createMagneticLassoMask ====================

describe('createMagneticLassoMask', () => {
  it('creates a polygon mask from points', () => {
    const mask = createMagneticLassoMask(20, 20, [
      { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 },
    ]);
    expect(mask.length).toBe(400);
    // Center should be selected
    expect(mask[10 * 20 + 10]).toBe(255);
  });

  it('returns empty mask for fewer than 3 points', () => {
    const mask = createMagneticLassoMask(10, 10, [{ x: 1, y: 1 }, { x: 5, y: 5 }]);
    expect(countAbove(mask)).toBe(0);
  });
});

// ==================== singleRowMarquee ====================

describe('singleRowMarquee', () => {
  it('selects exactly one row of pixels', () => {
    const mask = singleRowMarquee(10, 10, 5);
    expect(mask.length).toBe(100);
    // All 10 pixels in row 5
    expect(countAbove(mask)).toBe(10);
    for (let x = 0; x < 10; x++) {
      expect(mask[5 * 10 + x]).toBe(255);
    }
  });

  it('clamps row to valid range (below 0)', () => {
    const mask = singleRowMarquee(8, 8, -5);
    // Should clamp to row 0
    expect(countAbove(mask)).toBe(8);
    for (let x = 0; x < 8; x++) {
      expect(mask[0 * 8 + x]).toBe(255);
    }
  });

  it('clamps row to valid range (above max)', () => {
    const mask = singleRowMarquee(8, 8, 100);
    // Should clamp to row 7 (last row)
    expect(countAbove(mask)).toBe(8);
    for (let x = 0; x < 8; x++) {
      expect(mask[7 * 8 + x]).toBe(255);
    }
  });

  it('rounds fractional row', () => {
    const mask = singleRowMarquee(6, 6, 2.7);
    // Round(2.7) = 3
    expect(countAbove(mask)).toBe(6);
    for (let x = 0; x < 6; x++) {
      expect(mask[3 * 6 + x]).toBe(255);
    }
  });

  it('other rows are unselected', () => {
    const mask = singleRowMarquee(5, 5, 2);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (y === 2) expect(mask[y * 5 + x]).toBe(255);
        else expect(mask[y * 5 + x]).toBe(0);
      }
    }
  });
});

// ==================== singleColumnMarquee ====================

describe('singleColumnMarquee', () => {
  it('selects exactly one column of pixels', () => {
    const mask = singleColumnMarquee(10, 10, 3);
    expect(mask.length).toBe(100);
    expect(countAbove(mask)).toBe(10);
    for (let y = 0; y < 10; y++) {
      expect(mask[y * 10 + 3]).toBe(255);
    }
  });

  it('clamps column to valid range (below 0)', () => {
    const mask = singleColumnMarquee(8, 8, -3);
    expect(countAbove(mask)).toBe(8);
    for (let y = 0; y < 8; y++) {
      expect(mask[y * 8 + 0]).toBe(255);
    }
  });

  it('clamps column to valid range (above max)', () => {
    const mask = singleColumnMarquee(8, 8, 50);
    expect(countAbove(mask)).toBe(8);
    for (let y = 0; y < 8; y++) {
      expect(mask[y * 8 + 7]).toBe(255);
    }
  });

  it('rounds fractional column', () => {
    const mask = singleColumnMarquee(6, 6, 1.4);
    // Round(1.4) = 1
    expect(countAbove(mask)).toBe(6);
    for (let y = 0; y < 6; y++) {
      expect(mask[y * 6 + 1]).toBe(255);
    }
  });

  it('other columns are unselected', () => {
    const mask = singleColumnMarquee(5, 5, 4);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (x === 4) expect(mask[y * 5 + x]).toBe(255);
        else expect(mask[y * 5 + x]).toBe(0);
      }
    }
  });
});

// ==================== Combined operations ====================

describe('combined selection operations', () => {
  it('expand then contract approximately restores original for large selections', () => {
    const mask = makeBlockMask(30, 30, 10, 10, 10, 10);
    const expanded = expandSelection(mask, 30, 30, 2);
    const restored = contractSelection(expanded, 30, 30, 2);
    // Should be approximately the same as original (within some tolerance for circular morphology)
    const origCount = countAbove(mask);
    const restoredCount = countAbove(restored);
    expect(Math.abs(restoredCount - origCount)).toBeLessThan(origCount * 0.15);
  });

  it('add + subtract removes the added region', () => {
    const a = makeBlockMask(10, 10, 0, 0, 5, 10);
    const b = makeBlockMask(10, 10, 5, 0, 5, 10);
    const combined = addToSelection(a, b);
    expect(countAbove(combined)).toBe(100);
    const subtracted = subtractFromSelection(combined, b);
    // Should be back to approximately a
    expect(countAbove(subtracted)).toBe(50);
  });

  it('invert of invert equals original', () => {
    const mask = makeBlockMask(10, 10, 2, 2, 6, 6);
    const doubleInverted = invertSelection(invertSelection(mask));
    expect(Array.from(doubleInverted)).toEqual(Array.from(mask));
  });

  it('intersect with itself returns same mask', () => {
    const mask = makeBlockMask(10, 10, 3, 3, 4, 4);
    const result = intersectSelection(mask, new Uint8ClampedArray(mask));
    expect(Array.from(result)).toEqual(Array.from(mask));
  });
});
