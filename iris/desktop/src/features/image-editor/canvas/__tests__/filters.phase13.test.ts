/**
 * Phase 13: Remaining Filters Tests
 * Tests for blur, sharpenMore, sharpenEdges, maximumFilter, minimumFilter,
 * offsetFilter, extrude, shear, pictureFrame
 */
import { describe, it, expect } from 'vitest';
import {
  blur,
  sharpenMore,
  sharpenEdges,
  maximumFilter,
  minimumFilter,
  offsetFilter,
  extrude,
  shear,
  pictureFrame,
} from '../filters';

function createTestImageData(width: number, height: number, fill?: number[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill ? fill[0] : 128;
    data[i + 1] = fill ? fill[1] : 128;
    data[i + 2] = fill ? fill[2] : 128;
    data[i + 3] = fill ? (fill[3] ?? 255) : 255;
  }
  return new ImageData(data, width, height);
}

function standardTests(filterFn: (img: ImageData) => ImageData, name: string) {
  it(`${name}: preserves dimensions`, () => {
    const img = createTestImageData(10, 10);
    const result = filterFn(img);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it(`${name}: preserves alpha`, () => {
    const img = createTestImageData(10, 10, [128, 128, 128, 200]);
    const result = filterFn(img);
    // At least some pixels should preserve alpha
    let hasAlpha = false;
    for (let i = 3; i < result.data.length; i += 4) {
      if (result.data[i] > 0) { hasAlpha = true; break; }
    }
    expect(hasAlpha).toBe(true);
  });

  it(`${name}: does not modify input`, () => {
    const img = createTestImageData(5, 5);
    const originalData = new Uint8ClampedArray(img.data);
    filterFn(img);
    expect(img.data).toEqual(originalData);
  });
}

describe('Phase 13: Remaining Filters', () => {
  // ============ blur ============
  describe('blur (basic 3x3)', () => {
    standardTests(blur, 'blur');

    it('smooths pixel values', () => {
      const img = createTestImageData(5, 5, [0, 0, 0, 255]);
      // Set center pixel to white
      const center = (2 * 5 + 2) * 4;
      img.data[center] = 255;
      img.data[center + 1] = 255;
      img.data[center + 2] = 255;

      const result = blur(img);
      // Center should be averaged down (255/9 ≈ 28)
      expect(result.data[center]).toBeLessThan(255);
      expect(result.data[center]).toBeGreaterThan(0);
    });

    it('uniform image stays uniform', () => {
      const img = createTestImageData(5, 5, [100, 100, 100, 255]);
      const result = blur(img);
      const center = (2 * 5 + 2) * 4;
      expect(result.data[center]).toBe(100);
    });
  });

  // ============ sharpenMore ============
  describe('sharpenMore', () => {
    standardTests(sharpenMore, 'sharpenMore');

    it('enhances contrast at edges', () => {
      const img = createTestImageData(5, 5, [100, 100, 100, 255]);
      const center = (2 * 5 + 2) * 4;
      img.data[center] = 200;

      const result = sharpenMore(img);
      // Center should be even brighter due to sharpening
      expect(result.data[center]).toBeGreaterThanOrEqual(200);
    });

    it('uniform image stays unchanged', () => {
      const img = createTestImageData(5, 5, [128, 128, 128, 255]);
      const result = sharpenMore(img);
      const center = (2 * 5 + 2) * 4;
      expect(result.data[center]).toBe(128);
    });
  });

  // ============ sharpenEdges ============
  describe('sharpenEdges', () => {
    standardTests(sharpenEdges, 'sharpenEdges');

    it('sharpens edges selectively', () => {
      const img = createTestImageData(10, 10, [50, 50, 50, 255]);
      // Create an edge: right half is bright
      for (let y = 0; y < 10; y++) {
        for (let x = 5; x < 10; x++) {
          const idx = (y * 10 + x) * 4;
          img.data[idx] = 200;
          img.data[idx + 1] = 200;
          img.data[idx + 2] = 200;
        }
      }

      const result = sharpenEdges(img);
      // Pixels near edge (x=4 or x=5) should differ from input
      const edgeIdx = (5 * 10 + 4) * 4;
      const changed = result.data[edgeIdx] !== img.data[edgeIdx];
      expect(changed).toBe(true);
    });
  });

  // ============ maximumFilter ============
  describe('maximumFilter', () => {
    standardTests((img) => maximumFilter(img, 1), 'maximumFilter');

    it('expands bright pixel', () => {
      const img = createTestImageData(5, 5, [0, 0, 0, 255]);
      const center = (2 * 5 + 2) * 4;
      img.data[center] = 255;
      img.data[center + 1] = 255;
      img.data[center + 2] = 255;

      const result = maximumFilter(img, 1);
      // Neighbors should become 255
      const neighbor = (2 * 5 + 3) * 4;
      expect(result.data[neighbor]).toBe(255);
    });

    it('pure black stays black', () => {
      const img = createTestImageData(5, 5, [0, 0, 0, 255]);
      const result = maximumFilter(img, 1);
      expect(result.data[0]).toBe(0);
    });
  });

  // ============ minimumFilter ============
  describe('minimumFilter', () => {
    standardTests((img) => minimumFilter(img, 1), 'minimumFilter');

    it('expands dark pixel', () => {
      const img = createTestImageData(5, 5, [255, 255, 255, 255]);
      const center = (2 * 5 + 2) * 4;
      img.data[center] = 0;
      img.data[center + 1] = 0;
      img.data[center + 2] = 0;

      const result = minimumFilter(img, 1);
      // Neighbors should become 0
      const neighbor = (2 * 5 + 3) * 4;
      expect(result.data[neighbor]).toBe(0);
    });

    it('pure white stays white', () => {
      const img = createTestImageData(5, 5, [255, 255, 255, 255]);
      const result = minimumFilter(img, 1);
      expect(result.data[0]).toBe(255);
    });
  });

  // ============ offsetFilter ============
  describe('offsetFilter', () => {
    standardTests((img) => offsetFilter(img, 0, 0), 'offsetFilter');

    it('zero offset produces identical output', () => {
      const img = createTestImageData(5, 5, [100, 100, 100, 255]);
      const result = offsetFilter(img, 0, 0);
      for (let i = 0; i < img.data.length; i++) {
        expect(result.data[i]).toBe(img.data[i]);
      }
    });

    it('wraps horizontally', () => {
      const img = createTestImageData(5, 5, [0, 0, 0, 255]);
      // Set first column to white
      for (let y = 0; y < 5; y++) {
        const idx = (y * 5) * 4;
        img.data[idx] = 255;
      }

      const result = offsetFilter(img, 1, 0, true);
      // White column should now be at x=1
      expect(result.data[(0 * 5 + 1) * 4]).toBe(255);
      // And x=0 should wrap from last column (black)
      expect(result.data[0]).toBe(0);
    });

    it('clamps without wrap-around', () => {
      const img = createTestImageData(5, 5, [128, 128, 128, 255]);
      img.data[0] = 50; // top-left pixel
      const result = offsetFilter(img, 2, 0, false);
      // At x=0, src would be x=-2, clamped to 0 → gets value of pixel[0]
      expect(result.data[0]).toBe(50);
    });
  });

  // ============ extrude ============
  describe('extrude', () => {
    standardTests((img) => extrude(img, 'blocks', 5, 10), 'extrude-blocks');
    standardTests((img) => extrude(img, 'pyramids', 5, 10), 'extrude-pyramids');

    it('blocks mode changes pixels', () => {
      const img = createTestImageData(20, 20, [128, 128, 128, 255]);
      // Set some variation
      for (let i = 0; i < 400; i++) {
        img.data[i * 4] = i % 256;
      }
      const result = extrude(img, 'blocks', 5, 20);
      let changed = false;
      for (let i = 0; i < result.data.length; i += 4) {
        if (result.data[i] !== img.data[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('pyramids mode changes pixels', () => {
      const img = createTestImageData(20, 20);
      for (let i = 0; i < 400; i++) {
        img.data[i * 4] = i % 256;
      }
      const result = extrude(img, 'pyramids', 5, 20);
      let changed = false;
      for (let i = 0; i < result.data.length; i += 4) {
        if (result.data[i] !== img.data[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });
  });

  // ============ shear ============
  describe('shear', () => {
    standardTests((img) => shear(img, [{ y: 0, x: 0 }, { y: 1, x: 0 }]), 'shear');

    it('zero offset produces identical output', () => {
      const img = createTestImageData(5, 5, [100, 100, 100, 255]);
      const result = shear(img, [{ y: 0, x: 0 }, { y: 1, x: 0 }]);
      for (let i = 0; i < img.data.length; i++) {
        expect(result.data[i]).toBe(img.data[i]);
      }
    });

    it('applies horizontal shift based on Y position', () => {
      const img = createTestImageData(10, 10, [0, 0, 0, 255]);
      // Set first column to white
      for (let y = 0; y < 10; y++) {
        img.data[(y * 10) * 4] = 255;
      }

      const result = shear(img, [{ y: 0, x: 0 }, { y: 1, x: 0.3 }], true);
      // Bottom row should have white pixel shifted right
      const lastRow = 9;
      const offset = Math.round(0.3 * 10); // 3 pixels
      expect(result.data[(lastRow * 10 + offset) * 4]).toBe(255);
    });
  });

  // ============ pictureFrame ============
  describe('pictureFrame', () => {
    standardTests((img) => pictureFrame(img, 5, 'simple'), 'pictureFrame-simple');

    it('simple frame colors border pixels', () => {
      const img = createTestImageData(20, 20, [255, 255, 255, 255]);
      const result = pictureFrame(img, 5, 'simple', [139, 90, 43]);
      // Top-left corner should be frame-colored, not white
      expect(result.data[0]).not.toBe(255);
    });

    it('shadow frame darkens edges', () => {
      const img = createTestImageData(20, 20, [200, 200, 200, 255]);
      const result = pictureFrame(img, 5, 'shadow');
      // Corner pixel should be darker
      expect(result.data[0]).toBeLessThan(200);
    });

    it('ornate frame has bevel effect', () => {
      const img = createTestImageData(20, 20, [200, 200, 200, 255]);
      const result = pictureFrame(img, 8, 'ornate', [139, 90, 43]);
      // Outer edge pixel and inner edge pixel should differ
      const outer = result.data[0]; // very edge
      const inner = result.data[(7 * 20 + 7) * 4]; // near inner edge
      expect(outer).not.toBe(inner);
    });

    it('double frame creates two borders', () => {
      const img = createTestImageData(40, 40, [200, 200, 200, 255]);
      const result = pictureFrame(img, 8, 'double', [139, 90, 43]);
      // Center should still be original
      const center = (20 * 40 + 20) * 4;
      expect(result.data[center]).toBe(200);
      // Edge should be frame colored
      expect(result.data[0]).not.toBe(200);
    });
  });
});
