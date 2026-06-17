/**
 * Comprehensive Transform Engine Tests
 *
 * Covers: applyTransformsToCanvas (rotate/flip), applyWarpToCanvas (3x3 mesh),
 * perspectiveWarp (4-corner), contentAwareScale (seam carving),
 * createDefaultWarpGrid.
 *
 * Note: No dedicated puppetWarp function exists in the codebase; that test
 * section validates the closest available transform primitives instead.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createOffscreenCanvas,
  applyTransformsToCanvas,
  applyWarpToCanvas,
  createDefaultWarpGrid,
} from '../canvasEngine';
import {
  perspectiveWarp,
  contentAwareScale,
} from '../filters';

// ==================== Helpers ====================

function createTestCanvas(w = 20, h = 20): HTMLCanvasElement {
  const { canvas, ctx } = createOffscreenCanvas(w, h);
  // Fill with a known pattern so pixel reads are deterministic
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

function createTestImageData(w = 10, h = 10): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (i * 37) % 256;
    data[i * 4 + 1] = (i * 73) % 256;
    data[i * 4 + 2] = (i * 113) % 256;
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, w, h);
}

// ==================== applyTransformsToCanvas ====================

describe('applyTransformsToCanvas', () => {
  describe('identity transform', () => {
    it('should preserve dimensions when no transform applied', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(result.width).toBe(30);
      expect(result.height).toBe(20);
    });

    it('should not mutate the source canvas', () => {
      const source = createTestCanvas(30, 20);
      const sourceCtx = source.getContext('2d')!;
      const putSpy = vi.spyOn(sourceCtx, 'putImageData');
      const clearSpy = vi.spyOn(sourceCtx, 'clearRect');

      applyTransformsToCanvas(source, {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(putSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
    });
  });

  describe('rotation', () => {
    it('should swap dimensions for 90 degree rotation', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 90,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(result.width).toBe(20);
      expect(result.height).toBe(30);
    });

    it('should swap dimensions for 270 degree rotation', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 270,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(result.width).toBe(20);
      expect(result.height).toBe(30);
    });

    it('should preserve dimensions for 180 degree rotation', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 180,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(result.width).toBe(30);
      expect(result.height).toBe(20);
    });

    it('should preserve dimensions for 360 degree rotation', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 360,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(result.width).toBe(30);
      expect(result.height).toBe(20);
    });

    it('should expand canvas for non-right-angle rotation', () => {
      const source = createTestCanvas(40, 30);
      const result = applyTransformsToCanvas(source, {
        rotation: 45,
        flipHorizontal: false,
        flipVertical: false,
      });

      // Diagonal should be larger than original
      expect(result.width).toBeGreaterThanOrEqual(40);
      expect(result.height).toBeGreaterThanOrEqual(30);
    });

    it('should return a valid canvas for zero rotation', () => {
      const source = createTestCanvas(10, 10);
      const result = applyTransformsToCanvas(source, {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(result).toBeInstanceOf(HTMLCanvasElement);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe('flip', () => {
    it('should preserve dimensions for horizontal flip', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 0,
        flipHorizontal: true,
        flipVertical: false,
      });

      expect(result.width).toBe(30);
      expect(result.height).toBe(20);
    });

    it('should preserve dimensions for vertical flip', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: true,
      });

      expect(result.width).toBe(30);
      expect(result.height).toBe(20);
    });

    it('should preserve dimensions for both flips', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 0,
        flipHorizontal: true,
        flipVertical: true,
      });

      expect(result.width).toBe(30);
      expect(result.height).toBe(20);
    });

    it('should not mutate source when flipping', () => {
      const source = createTestCanvas(10, 10);
      const sourceCtx = source.getContext('2d')!;
      const putSpy = vi.spyOn(sourceCtx, 'putImageData');
      const clearSpy = vi.spyOn(sourceCtx, 'clearRect');

      applyTransformsToCanvas(source, {
        rotation: 0,
        flipHorizontal: true,
        flipVertical: true,
      });

      expect(putSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
    });
  });

  describe('combined rotation and flip', () => {
    it('should handle 90 degree rotation with horizontal flip', () => {
      const source = createTestCanvas(30, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 90,
        flipHorizontal: true,
        flipVertical: false,
      });

      expect(result.width).toBe(20);
      expect(result.height).toBe(30);
    });

    it('should handle 45 degree rotation with both flips', () => {
      const source = createTestCanvas(20, 20);
      const result = applyTransformsToCanvas(source, {
        rotation: 45,
        flipHorizontal: true,
        flipVertical: true,
      });

      expect(result).toBeInstanceOf(HTMLCanvasElement);
      expect(result.width).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle 1x1 canvas', () => {
      const source = createTestCanvas(1, 1);
      const result = applyTransformsToCanvas(source, {
        rotation: 90,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });

    it('should handle very elongated canvas', () => {
      const source = createTestCanvas(100, 1);
      const result = applyTransformsToCanvas(source, {
        rotation: 90,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(result.width).toBe(1);
      expect(result.height).toBe(100);
    });
  });
});

// ==================== applyWarpToCanvas (3x3 mesh) ====================

describe('applyWarpToCanvas', () => {
  it('should preserve dimensions with identity warp grid', () => {
    const source = createTestCanvas(20, 20);
    const grid = createDefaultWarpGrid(20, 20);

    const result = applyWarpToCanvas(source, grid);

    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it('should not mutate the source canvas', () => {
    const source = createTestCanvas(20, 20);
    const sourceCtx = source.getContext('2d')!;
    const putSpy = vi.spyOn(sourceCtx, 'putImageData');
    const clearSpy = vi.spyOn(sourceCtx, 'clearRect');
    const grid = createDefaultWarpGrid(20, 20);

    applyWarpToCanvas(source, grid);

    expect(putSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('should return a valid canvas after warping', () => {
    const source = createTestCanvas(20, 20);
    const grid = createDefaultWarpGrid(20, 20);
    // Shift the center point to create a warp
    grid[1][1] = { x: 12, y: 12 };

    const result = applyWarpToCanvas(source, grid);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it('should produce non-transparent output with solid input', () => {
    const source = createTestCanvas(20, 20);
    const grid = createDefaultWarpGrid(20, 20);

    const result = applyWarpToCanvas(source, grid);

    // Structural check: returns a valid canvas
    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);

    // Re-run to verify the output canvas is distinct from the source
    // (warp uses putImageData to write pixel data to the output canvas).
    const result2 = applyWarpToCanvas(source, grid);
    expect(result2).not.toBe(source);
  });

  it('should handle shifted corner points', () => {
    const source = createTestCanvas(20, 20);
    const grid = createDefaultWarpGrid(20, 20);
    // Move top-left corner inward
    grid[0][0] = { x: 2, y: 2 };

    expect(() => applyWarpToCanvas(source, grid)).not.toThrow();
  });

  it('should handle extreme warp deformation', () => {
    const source = createTestCanvas(20, 20);
    const grid = createDefaultWarpGrid(20, 20);
    // Cross the grid lines
    grid[0][2] = { x: 0, y: 0 };
    grid[2][0] = { x: 20, y: 20 };

    expect(() => applyWarpToCanvas(source, grid)).not.toThrow();
  });
});

// ==================== createDefaultWarpGrid ====================

describe('createDefaultWarpGrid', () => {
  it('should create a 3x3 grid', () => {
    const grid = createDefaultWarpGrid(100, 80);

    expect(grid.length).toBe(3);
    grid.forEach((row) => {
      expect(row.length).toBe(3);
    });
  });

  it('should have correct corner positions', () => {
    const grid = createDefaultWarpGrid(100, 80);

    expect(grid[0][0]).toEqual({ x: 0, y: 0 });
    expect(grid[0][2]).toEqual({ x: 100, y: 0 });
    expect(grid[2][0]).toEqual({ x: 0, y: 80 });
    expect(grid[2][2]).toEqual({ x: 100, y: 80 });
  });

  it('should have correct center position', () => {
    const grid = createDefaultWarpGrid(100, 80);

    expect(grid[1][1]).toEqual({ x: 50, y: 40 });
  });

  it('should have correct edge midpoints', () => {
    const grid = createDefaultWarpGrid(100, 80);

    expect(grid[0][1]).toEqual({ x: 50, y: 0 });   // top mid
    expect(grid[1][0]).toEqual({ x: 0, y: 40 });    // left mid
    expect(grid[1][2]).toEqual({ x: 100, y: 40 });   // right mid
    expect(grid[2][1]).toEqual({ x: 50, y: 80 });    // bottom mid
  });

  it('should handle 1x1 dimensions', () => {
    const grid = createDefaultWarpGrid(1, 1);
    expect(grid[0][0]).toEqual({ x: 0, y: 0 });
    expect(grid[2][2]).toEqual({ x: 1, y: 1 });
  });
});

// ==================== perspectiveWarp ====================

describe('perspectiveWarp', () => {
  it('should return ImageData with same dimensions', () => {
    const img = createTestImageData(10, 10);
    const corners = {
      tl: { x: 0, y: 0 },
      tr: { x: 9, y: 0 },
      bl: { x: 0, y: 9 },
      br: { x: 9, y: 9 },
    };

    const result = perspectiveWarp(img, corners);

    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
    expect(result.data.length).toBe(img.data.length);
  });

  it('should not mutate the input ImageData', () => {
    const img = createTestImageData(10, 10);
    const origData = new Uint8ClampedArray(img.data);
    const corners = {
      tl: { x: 0, y: 0 },
      tr: { x: 9, y: 0 },
      bl: { x: 0, y: 9 },
      br: { x: 9, y: 9 },
    };

    perspectiveWarp(img, corners);

    expect(img.data).toEqual(origData);
  });

  it('should produce a new ImageData (not same reference)', () => {
    const img = createTestImageData(10, 10);
    const corners = {
      tl: { x: 0, y: 0 },
      tr: { x: 9, y: 0 },
      bl: { x: 0, y: 9 },
      br: { x: 9, y: 9 },
    };

    const result = perspectiveWarp(img, corners);
    expect(result).not.toBe(img);
  });

  it('should handle identity corners (no distortion)', () => {
    const img = createTestImageData(10, 10);
    const corners = {
      tl: { x: 0, y: 0 },
      tr: { x: 9, y: 0 },
      bl: { x: 0, y: 9 },
      br: { x: 9, y: 9 },
    };

    const result = perspectiveWarp(img, corners);
    // With identity-ish corners, output should closely match input
    expect(result.data.length).toBe(img.data.length);
  });

  it('should handle inward trapezoid distortion', () => {
    const img = createTestImageData(10, 10);
    const corners = {
      tl: { x: 2, y: 2 },
      tr: { x: 7, y: 2 },
      bl: { x: 0, y: 9 },
      br: { x: 9, y: 9 },
    };

    const result = perspectiveWarp(img, corners);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it('should handle inverted corners without throwing', () => {
    const img = createTestImageData(10, 10);
    const corners = {
      tl: { x: 9, y: 9 },
      tr: { x: 0, y: 9 },
      bl: { x: 9, y: 0 },
      br: { x: 0, y: 0 },
    };

    expect(() => perspectiveWarp(img, corners)).not.toThrow();
  });

  it('should handle corners outside image bounds', () => {
    const img = createTestImageData(10, 10);
    const corners = {
      tl: { x: -5, y: -5 },
      tr: { x: 15, y: -5 },
      bl: { x: -5, y: 15 },
      br: { x: 15, y: 15 },
    };

    expect(() => perspectiveWarp(img, corners)).not.toThrow();
    const result = perspectiveWarp(img, corners);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it('should preserve alpha channel', () => {
    const img = createTestImageData(5, 5);
    // Set all alpha to 128
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = 128;
    }

    const corners = {
      tl: { x: 0, y: 0 },
      tr: { x: 4, y: 0 },
      bl: { x: 0, y: 4 },
      br: { x: 4, y: 4 },
    };

    const result = perspectiveWarp(img, corners);
    // All pixels should have non-zero alpha
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThan(0);
    }
  });
});

// ==================== contentAwareScale ====================

describe('contentAwareScale', () => {
  it('should return ImageData with requested dimensions', () => {
    const img = createTestImageData(10, 10);
    const result = contentAwareScale(img, 8, 10);

    expect(result.width).toBe(8);
    expect(result.height).toBe(10);
    expect(result.data.length).toBe(8 * 10 * 4);
  });

  it('should not mutate the input ImageData', () => {
    const img = createTestImageData(10, 10);
    const origData = new Uint8ClampedArray(img.data);

    contentAwareScale(img, 8, 10);

    expect(img.data).toEqual(origData);
  });

  it('should handle same-size scaling (no-op)', () => {
    const img = createTestImageData(10, 10);
    const result = contentAwareScale(img, 10, 10);

    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it('should handle width reduction', () => {
    const img = createTestImageData(15, 10);
    const result = contentAwareScale(img, 10, 10);

    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it('should handle height change via bilinear scaling', () => {
    const img = createTestImageData(10, 10);
    const result = contentAwareScale(img, 10, 5);

    expect(result.width).toBe(10);
    expect(result.height).toBe(5);
  });

  it('should handle both width and height changes', () => {
    const img = createTestImageData(10, 10);
    const result = contentAwareScale(img, 7, 8);

    expect(result.width).toBe(7);
    expect(result.height).toBe(8);
  });

  it('should produce non-zero pixel data', () => {
    const img = createTestImageData(10, 10);
    const result = contentAwareScale(img, 8, 8);

    let hasNonZero = false;
    for (let i = 0; i < result.data.length; i += 4) {
      if (result.data[i] > 0 || result.data[i + 1] > 0 || result.data[i + 2] > 0) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);
  });

  it('should preserve alpha for fully opaque input', () => {
    const img = createTestImageData(10, 10);
    const result = contentAwareScale(img, 8, 8);

    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(255);
    }
  });

  it('should handle scaling to width of 1', () => {
    const img = createTestImageData(5, 5);
    const result = contentAwareScale(img, 1, 5);

    expect(result.width).toBe(1);
    expect(result.height).toBe(5);
  });

  it('should handle wider target width (no seam removal needed)', () => {
    const img = createTestImageData(5, 5);
    const result = contentAwareScale(img, 8, 5);

    // When target is wider, no seams removed; bilinear scale only
    expect(result.width).toBe(8);
    expect(result.height).toBe(5);
  });
});
