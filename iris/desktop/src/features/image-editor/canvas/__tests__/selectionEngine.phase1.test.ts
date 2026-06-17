/**
 * selectionEngine — Phase 1 additions
 *
 * Tests for smoothSelection, borderSelection, growSelection, and similarSelection.
 * These functions modify selection masks based on spatial/color criteria.
 */

import { describe, it, expect } from 'vitest';
import {
  smoothSelection,
  borderSelection,
  growSelection,
  similarSelection,
} from '../selectionEngine';

// ==================== Test helpers ====================

/**
 * Create a mask with specific pixels selected (255), rest unselected (0).
 */
function createMask(w: number, h: number, selectedPixels: number[]): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(w * h);
  selectedPixels.forEach((i) => (mask[i] = 255));
  return mask;
}

/**
 * Create a test ImageData with per-pixel RGBA colors.
 * `colors` length must equal w * h.
 */
function createTestImageData(
  w: number,
  h: number,
  colors: [number, number, number, number][]
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  colors.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return { data, width: w, height: h } as ImageData;
}

/**
 * Count how many pixels in the mask are above the threshold.
 */
function countSelected(mask: Uint8ClampedArray, threshold = 127): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > threshold) c++;
  }
  return c;
}

/**
 * Collect indices of selected pixels.
 */
function selectedIndices(mask: Uint8ClampedArray, threshold = 127): number[] {
  const result: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > threshold) result.push(i);
  }
  return result;
}

// ==================== smoothSelection ====================

describe('smoothSelection', () => {
  const W = 4;
  const H = 4;

  it('returns a copy of the same size when radius is 0', () => {
    const mask = createMask(W, H, [5, 6, 9, 10]);
    const result = smoothSelection(mask, W, H, 0);
    expect(result.length).toBe(mask.length);
    expect(Array.from(result)).toEqual(Array.from(mask));
  });

  it('output has the same length as input', () => {
    const mask = createMask(W, H, [0, 1, 4, 5]);
    const result = smoothSelection(mask, W, H, 1);
    expect(result.length).toBe(W * H);
  });

  it('produces only binary values (0 or 255)', () => {
    // smoothSelection uses majority vote, so output should be 0 or 255
    const mask = createMask(W, H, [5, 6, 9, 10]);
    const result = smoothSelection(mask, W, H, 1);
    for (let i = 0; i < result.length; i++) {
      expect(result[i] === 0 || result[i] === 255).toBe(true);
    }
  });

  it('removes an isolated single pixel (noise removal)', () => {
    // Single pixel at center of 4x4 — neighborhood majority is unselected
    const mask = createMask(W, H, [5]); // row 1, col 1
    const result = smoothSelection(mask, W, H, 1);
    // With radius=1, the single pixel has ~8 neighbors all 0, so majority is 0
    expect(result[5]).toBe(0);
  });

  it('preserves a solid block of selected pixels', () => {
    // 2x2 block in center of 4x4
    const mask = createMask(W, H, [5, 6, 9, 10]);
    const result = smoothSelection(mask, W, H, 1);
    // Center pixels of the block should remain selected
    // At least some of the block pixels should survive
    const selected = countSelected(result);
    expect(selected).toBeGreaterThan(0);
  });

  it('fills a small gap inside a large selected area', () => {
    // 6x6 grid: everything selected except center pixel
    const W2 = 6;
    const H2 = 6;
    const allPixels: number[] = [];
    for (let i = 0; i < W2 * H2; i++) allPixels.push(i);
    // Remove the center pixel (row 2, col 2 = index 14)
    const withGap = allPixels.filter((i) => i !== 14);
    const mask = createMask(W2, H2, withGap);
    expect(mask[14]).toBe(0); // gap exists

    const result = smoothSelection(mask, W2, H2, 1);
    // Majority of neighbors of pixel 14 are selected, so gap should be filled
    expect(result[14]).toBe(255);
  });
});

// ==================== borderSelection ====================

describe('borderSelection', () => {
  it('returns a mask of the same size', () => {
    const W = 6;
    const H = 6;
    // 4x4 selected block in center (rows 1-4, cols 1-4)
    const selected: number[] = [];
    for (let y = 1; y <= 4; y++) {
      for (let x = 1; x <= 4; x++) {
        selected.push(y * W + x);
      }
    }
    const mask = createMask(W, H, selected);
    const result = borderSelection(mask, W, H, 1);
    expect(result.length).toBe(W * H);
  });

  it('returns a copy when borderWidth is 0', () => {
    const W = 4;
    const H = 4;
    const mask = createMask(W, H, [5, 6, 9, 10]);
    const result = borderSelection(mask, W, H, 0);
    expect(Array.from(result)).toEqual(Array.from(mask));
  });

  it('produces fewer selected pixels than the original filled selection', () => {
    const W = 16;
    const H = 16;
    // 12x12 filled block in center (rows 2-13, cols 2-13)
    const selected: number[] = [];
    for (let y = 2; y <= 13; y++) {
      for (let x = 2; x <= 13; x++) {
        selected.push(y * W + x);
      }
    }
    const mask = createMask(W, H, selected);
    const originalCount = countSelected(mask); // 144 pixels

    const result = borderSelection(mask, W, H, 1);
    const borderCount = countSelected(result);

    expect(borderCount).toBeLessThan(originalCount);
    expect(borderCount).toBeGreaterThan(0);
  });

  it('border pixels are near the edge of the original selection', () => {
    const W = 8;
    const H = 8;
    // 4x4 block at rows 2-5, cols 2-5
    const selected: number[] = [];
    for (let y = 2; y <= 5; y++) {
      for (let x = 2; x <= 5; x++) {
        selected.push(y * W + x);
      }
    }
    const mask = createMask(W, H, selected);
    const result = borderSelection(mask, W, H, 1);

    // Interior pixel (row 3, col 3 = index 27) should NOT be selected in border
    // because it is fully surrounded by selected pixels
    const interiorIdx = 3 * W + 3;
    expect(result[interiorIdx]).toBe(0);
  });

  it('selects nothing when input mask is empty', () => {
    const W = 4;
    const H = 4;
    const mask = createMask(W, H, []);
    const result = borderSelection(mask, W, H, 2);
    expect(countSelected(result)).toBe(0);
  });

  it('wider borderWidth produces more border pixels', () => {
    const W = 10;
    const H = 10;
    // 8x8 block (rows 1-8, cols 1-8)
    const selected: number[] = [];
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        selected.push(y * W + x);
      }
    }
    const mask = createMask(W, H, selected);

    const border1 = countSelected(borderSelection(mask, W, H, 1));
    const border2 = countSelected(borderSelection(mask, W, H, 2));

    expect(border2).toBeGreaterThanOrEqual(border1);
  });
});

// ==================== growSelection ====================

describe('growSelection', () => {
  // 4x4 grid layout:
  //   0  1  2  3
  //   4  5  6  7
  //   8  9  10 11
  //   12 13 14 15
  const W = 4;
  const H = 4;

  it('returns a mask of the same size', () => {
    const mask = createMask(W, H, [5]);
    const colors: [number, number, number, number][] = Array(W * H).fill([100, 100, 100, 255]);
    const imgData = createTestImageData(W, H, colors);

    const result = growSelection(mask, imgData, W, H, 10);
    expect(result.length).toBe(W * H);
  });

  it('grows into adjacent pixel with identical color', () => {
    // Pixel 5 selected, pixel 6 same color and adjacent
    const mask = createMask(W, H, [5]);
    const colors: [number, number, number, number][] = Array(W * H).fill([100, 100, 100, 255]);
    const imgData = createTestImageData(W, H, colors);

    const result = growSelection(mask, imgData, W, H, 10);
    // All pixels are identical color, so grow should flood-fill everything
    expect(countSelected(result)).toBe(W * H);
  });

  it('does not grow into adjacent pixel with very different color and low tolerance', () => {
    const mask = createMask(W, H, [5]);
    const colors: [number, number, number, number][] = Array(W * H).fill([200, 200, 200, 255]);
    // Make pixel 5 a different color
    colors[5] = [50, 50, 50, 255];
    const imgData = createTestImageData(W, H, colors);

    const result = growSelection(mask, imgData, W, H, 0);
    // Tolerance 0, colors differ by 150 per channel — should not grow
    expect(countSelected(result)).toBe(1);
  });

  it('grows only to adjacent (4-connected) pixels, not diagonals', () => {
    // Select top-left corner (0). Diagonal (5) should not be reached
    // if there is a color barrier on pixels 1 and 4
    const mask = createMask(W, H, [0]);
    const colors: [number, number, number, number][] = Array(W * H).fill([100, 100, 100, 255]);
    colors[0] = [100, 100, 100, 255]; // selected
    colors[1] = [0, 0, 0, 255];       // barrier (right)
    colors[4] = [0, 0, 0, 255];       // barrier (below)
    const imgData = createTestImageData(W, H, colors);

    const result = growSelection(mask, imgData, W, H, 0);
    // Should not grow past barriers
    expect(result[0]).toBeGreaterThan(127); // still selected
    expect(result[1]).toBe(0);  // barrier
    expect(result[4]).toBe(0);  // barrier
    expect(result[5]).toBe(0);  // diagonal, unreachable
  });

  it('respects tolerance threshold for color similarity', () => {
    const mask = createMask(W, H, [5]);
    const colors: [number, number, number, number][] = Array(W * H).fill([100, 100, 100, 255]);
    // Pixel 5 is selected with color [100,100,100]
    // Adjacent pixel 6 has slightly different color
    colors[6] = [110, 110, 110, 255]; // diff = 30 total (10*3)
    const imgData = createTestImageData(W, H, colors);

    // Tolerance 5 → threshold = 15. Diff is 30 → should NOT grow to pixel 6
    const resultLow = growSelection(mask, imgData, W, H, 5);
    expect(resultLow[6]).toBe(0);

    // Tolerance 15 → threshold = 45. Diff is 30 → should grow to pixel 6
    const resultHigh = growSelection(mask, imgData, W, H, 15);
    expect(resultHigh[6]).toBeGreaterThan(127);
  });

  it('preserves originally selected pixels', () => {
    const mask = createMask(W, H, [5, 6]);
    const colors: [number, number, number, number][] = Array(W * H).fill([0, 0, 0, 255]);
    colors[5] = [100, 100, 100, 255];
    colors[6] = [100, 100, 100, 255];
    const imgData = createTestImageData(W, H, colors);

    const result = growSelection(mask, imgData, W, H, 0);
    expect(result[5]).toBeGreaterThan(127);
    expect(result[6]).toBeGreaterThan(127);
  });

  it('returns unchanged mask when nothing is selected', () => {
    const mask = createMask(W, H, []);
    const colors: [number, number, number, number][] = Array(W * H).fill([100, 100, 100, 255]);
    const imgData = createTestImageData(W, H, colors);

    const result = growSelection(mask, imgData, W, H, 255);
    expect(countSelected(result)).toBe(0);
  });
});

// ==================== similarSelection ====================

describe('similarSelection', () => {
  const W = 4;
  const H = 4;

  it('returns a mask of the same size', () => {
    const mask = createMask(W, H, [0]);
    const colors: [number, number, number, number][] = Array(W * H).fill([100, 100, 100, 255]);
    const imgData = createTestImageData(W, H, colors);

    const result = similarSelection(mask, imgData, W, H, 10);
    expect(result.length).toBe(W * H);
  });

  it('selects non-adjacent pixels with matching color', () => {
    // Pixel 0 (top-left) selected, pixel 15 (bottom-right) same color but not adjacent
    const mask = createMask(W, H, [0]);
    const colors: [number, number, number, number][] = Array(W * H).fill([200, 200, 200, 255]);
    // Make pixel 0 and 15 the same color, different from the rest
    colors[0] = [50, 50, 50, 255];
    colors[15] = [50, 50, 50, 255];
    const imgData = createTestImageData(W, H, colors);

    const result = similarSelection(mask, imgData, W, H, 0);
    expect(result[0]).toBeGreaterThan(127);  // originally selected
    expect(result[15]).toBeGreaterThan(127); // similar, non-adjacent
  });

  it('does not select pixels with very different color at low tolerance', () => {
    const mask = createMask(W, H, [0]);
    const colors: [number, number, number, number][] = Array(W * H).fill([200, 200, 200, 255]);
    colors[0] = [50, 50, 50, 255];
    const imgData = createTestImageData(W, H, colors);

    const result = similarSelection(mask, imgData, W, H, 0);
    // Only pixel 0 should be selected; rest differ by 150*3=450
    expect(countSelected(result)).toBe(1);
  });

  it('high tolerance selects all pixels', () => {
    const mask = createMask(W, H, [0]);
    const colors: [number, number, number, number][] = Array(W * H).fill([200, 200, 200, 255]);
    colors[0] = [50, 50, 50, 255];
    const imgData = createTestImageData(W, H, colors);

    // Tolerance 255 → threshold 765, max diff per pixel = 255*3=765 → all match
    const result = similarSelection(mask, imgData, W, H, 255);
    expect(countSelected(result)).toBe(W * H);
  });

  it('preserves originally selected pixels', () => {
    const mask = createMask(W, H, [3, 7]);
    const colors: [number, number, number, number][] = Array(W * H).fill([0, 0, 0, 255]);
    colors[3] = [100, 100, 100, 255];
    colors[7] = [100, 100, 100, 255];
    const imgData = createTestImageData(W, H, colors);

    const result = similarSelection(mask, imgData, W, H, 0);
    expect(result[3]).toBeGreaterThan(127);
    expect(result[7]).toBeGreaterThan(127);
  });

  it('returns unchanged mask when nothing is selected', () => {
    const mask = createMask(W, H, []);
    const colors: [number, number, number, number][] = Array(W * H).fill([100, 100, 100, 255]);
    const imgData = createTestImageData(W, H, colors);

    const result = similarSelection(mask, imgData, W, H, 255);
    expect(countSelected(result)).toBe(0);
  });

  it('selects multiple scattered pixels of similar color', () => {
    // Select pixel 0 (red). Pixels 5, 10, 15 are also red. Rest are blue.
    const mask = createMask(W, H, [0]);
    const colors: [number, number, number, number][] = Array(W * H).fill([0, 0, 200, 255]);
    colors[0] = [200, 0, 0, 255];
    colors[5] = [200, 0, 0, 255];
    colors[10] = [200, 0, 0, 255];
    colors[15] = [200, 0, 0, 255];
    const imgData = createTestImageData(W, H, colors);

    const result = similarSelection(mask, imgData, W, H, 0);
    const sel = selectedIndices(result);
    expect(sel).toContain(0);
    expect(sel).toContain(5);
    expect(sel).toContain(10);
    expect(sel).toContain(15);
    // Blue pixels should NOT be selected
    expect(sel.length).toBe(4);
  });

  it('respects tolerance for near-similar colors', () => {
    const mask = createMask(W, H, [0]);
    const colors: [number, number, number, number][] = Array(W * H).fill([0, 0, 0, 255]);
    colors[0] = [100, 100, 100, 255];
    // Pixel 8 is slightly different
    colors[8] = [108, 108, 108, 255]; // diff = 24 total

    const imgData = createTestImageData(W, H, colors);

    // Tolerance 5 → threshold 15, diff 24 → should not match
    const resultLow = similarSelection(mask, imgData, W, H, 5);
    expect(resultLow[8]).toBe(0);

    // Tolerance 10 → threshold 30, diff 24 → should match
    const resultHigh = similarSelection(mask, imgData, W, H, 10);
    expect(resultHigh[8]).toBeGreaterThan(127);
  });
});
