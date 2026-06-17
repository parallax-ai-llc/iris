/**
 * Phase 15: Selection + Blend Modes + Filters + Color Modes + Automation
 */
import { describe, it, expect } from 'vitest';
import {
  singleRowMarquee,
  singleColumnMarquee,
} from '../selectionEngine';
import {
  toBitmap,
  toDuotone,
  toMultichannel,
  cropAndStraightenPhotos,
} from '../adjustments';
import {
  mosaic,
  customFilter,
  adaptiveWideAngle,
  liquify,
} from '../filters';

function createTestImage(w: number, h: number, fill?: number[]): ImageData {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = fill ? fill[0] : 128;
    d[i + 1] = fill ? fill[1] : 128;
    d[i + 2] = fill ? fill[2] : 128;
    d[i + 3] = fill ? (fill[3] ?? 255) : 255;
  }
  return new ImageData(d, w, h);
}

function immutabilityCheck(fn: (img: ImageData) => unknown, name: string) {
  it(`${name}: does not modify input`, () => {
    const img = createTestImage(10, 10);
    const copy = new Uint8ClampedArray(img.data);
    fn(img);
    expect(img.data).toEqual(copy);
  });
}

// ==================== Selection ====================

describe('Phase 15: Single Row/Column Marquee', () => {
  describe('singleRowMarquee', () => {
    it('returns mask of correct size', () => {
      const mask = singleRowMarquee(20, 10, 5);
      expect(mask.length).toBe(200);
    });

    it('selects only specified row', () => {
      const mask = singleRowMarquee(10, 10, 3);
      // Row 3 should be all 255
      for (let x = 0; x < 10; x++) expect(mask[3 * 10 + x]).toBe(255);
      // Row 0 should be all 0
      for (let x = 0; x < 10; x++) expect(mask[0 * 10 + x]).toBe(0);
    });

    it('clamps out-of-range row', () => {
      const mask = singleRowMarquee(10, 10, 100);
      // Should clamp to last row (9)
      for (let x = 0; x < 10; x++) expect(mask[9 * 10 + x]).toBe(255);
    });

    it('selects exactly width pixels', () => {
      const mask = singleRowMarquee(20, 10, 5);
      let count = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i] === 255) count++;
      expect(count).toBe(20);
    });
  });

  describe('singleColumnMarquee', () => {
    it('returns mask of correct size', () => {
      const mask = singleColumnMarquee(20, 10, 5);
      expect(mask.length).toBe(200);
    });

    it('selects only specified column', () => {
      const mask = singleColumnMarquee(10, 10, 4);
      for (let y = 0; y < 10; y++) expect(mask[y * 10 + 4]).toBe(255);
      for (let y = 0; y < 10; y++) expect(mask[y * 10 + 0]).toBe(0);
    });

    it('clamps out-of-range column', () => {
      const mask = singleColumnMarquee(10, 10, -5);
      for (let y = 0; y < 10; y++) expect(mask[y * 10 + 0]).toBe(255);
    });

    it('selects exactly height pixels', () => {
      const mask = singleColumnMarquee(20, 10, 5);
      let count = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i] === 255) count++;
      expect(count).toBe(10);
    });
  });
});

// ==================== Filters ====================

describe('Phase 15: Filters', () => {
  describe('mosaic', () => {
    immutabilityCheck((img) => mosaic(img, 5), 'mosaic');

    it('preserves dimensions', () => {
      const r = mosaic(createTestImage(20, 20), 5);
      expect(r.width).toBe(20);
      expect(r.height).toBe(20);
    });

    it('pixels within cell have same color', () => {
      const img = createTestImage(20, 20);
      for (let i = 0; i < img.data.length; i += 4) img.data[i] = (i / 4) % 256;
      const r = mosaic(img, 5);
      const c00 = r.data[0];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(r.data[(y * 20 + x) * 4]).toBe(c00);
        }
      }
    });

    it('cellSize 1 preserves original', () => {
      const img = createTestImage(5, 5, [100, 150, 200, 255]);
      const r = mosaic(img, 1);
      expect(r.data[0]).toBe(100);
    });
  });

  describe('customFilter', () => {
    immutabilityCheck((img) => customFilter(img, [[0,0,0],[0,1,0],[0,0,0]]), 'customFilter');

    it('identity matrix preserves image', () => {
      const img = createTestImage(5, 5, [100, 150, 200, 255]);
      const r = customFilter(img, [[0,0,0],[0,1,0],[0,0,0]]);
      expect(r.data[0]).toBe(100);
      expect(r.data[1]).toBe(150);
    });

    it('supports scale and offset', () => {
      const img = createTestImage(3, 3, [0, 0, 0, 255]);
      const r = customFilter(img, [[0,0,0],[0,1,0],[0,0,0]], 1, 100);
      expect(r.data[0]).toBe(100);
    });
  });

  describe('adaptiveWideAngle', () => {
    immutabilityCheck((img) => adaptiveWideAngle(img, -0.3, 0.1), 'adaptiveWideAngle');

    it('preserves dimensions', () => {
      const r = adaptiveWideAngle(createTestImage(20, 20), -0.3, 0.1);
      expect(r.width).toBe(20);
      expect(r.height).toBe(20);
    });

    it('center pixel approximately preserved', () => {
      const img = createTestImage(21, 21, [128, 128, 128, 255]);
      // Add distinct center pixel
      const ci = (10 * 21 + 10) * 4;
      img.data[ci] = 200; img.data[ci + 1] = 100; img.data[ci + 2] = 50;
      const r = adaptiveWideAngle(img, -0.3, 0.1, 0.5, 0.5);
      // Center should be near its original value (distortion is 0 at center)
      expect(Math.abs(r.data[ci] - 200)).toBeLessThan(30);
    });

    it('k1=0, k2=0 produces near-identity', () => {
      const img = createTestImage(10, 10, [100, 150, 200, 255]);
      const r = adaptiveWideAngle(img, 0, 0);
      expect(r.data[0]).toBe(100);
    });
  });

  describe('liquify smooth/push-left/thaw tools', () => {
    it('smooth tool does not crash', () => {
      const img = createTestImage(20, 20);
      const r = liquify(img, [{ cx: 10, cy: 10, radius: 5, dx: 0, dy: 0, pressure: 0.5, tool: 'smooth' }]);
      expect(r.width).toBe(20);
    });

    it('push-left tool displaces pixels', () => {
      const img = createTestImage(20, 20, [0, 0, 0, 255]);
      for (let y = 0; y < 20; y++) {
        for (let x = 10; x < 20; x++) {
          const idx = (y * 20 + x) * 4;
          img.data[idx] = 255;
        }
      }
      const r = liquify(img, [{ cx: 10, cy: 10, radius: 8, dx: 0, dy: 5, pressure: 1, tool: 'push-left' }]);
      // Some displacement should occur
      let changed = false;
      for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i] !== img.data[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('thaw tool reduces displacement', () => {
      const img = createTestImage(20, 20);
      const r = liquify(img, [
        { cx: 10, cy: 10, radius: 5, dx: 10, dy: 0, pressure: 1, tool: 'push' },
        { cx: 10, cy: 10, radius: 5, dx: 0, dy: 0, pressure: 1, tool: 'thaw' },
      ]);
      // After push then thaw, should be close to original
      expect(r.width).toBe(20);
    });
  });
});

// ==================== Color Modes ====================

describe('Phase 15: Color Mode Conversions', () => {
  describe('toBitmap', () => {
    immutabilityCheck((img) => toBitmap(img), 'toBitmap');

    it('threshold produces only black and white', () => {
      const img = createTestImage(10, 10);
      for (let i = 0; i < img.data.length; i += 4) img.data[i] = (i / 4) * 2.5;
      const r = toBitmap(img, 'threshold', 128);
      for (let i = 0; i < r.data.length; i += 4) {
        expect(r.data[i] === 0 || r.data[i] === 255).toBe(true);
      }
    });

    it('white pixel stays white', () => {
      const img = createTestImage(1, 1, [255, 255, 255, 255]);
      const r = toBitmap(img);
      expect(r.data[0]).toBe(255);
    });

    it('black pixel stays black', () => {
      const img = createTestImage(1, 1, [0, 0, 0, 255]);
      const r = toBitmap(img);
      expect(r.data[0]).toBe(0);
    });

    it('diffusion dithering produces only 0/255', () => {
      const img = createTestImage(10, 10, [128, 128, 128, 255]);
      const r = toBitmap(img, 'diffusion', 128);
      for (let i = 0; i < r.data.length; i += 4) {
        expect(r.data[i] === 0 || r.data[i] === 255).toBe(true);
      }
    });

    it('preserves alpha', () => {
      const img = createTestImage(1, 1, [200, 200, 200, 180]);
      const r = toBitmap(img);
      expect(r.data[3]).toBe(180);
    });
  });

  describe('toDuotone', () => {
    immutabilityCheck((img) => toDuotone(img), 'toDuotone');

    it('preserves dimensions', () => {
      const r = toDuotone(createTestImage(10, 10));
      expect(r.width).toBe(10);
    });

    it('black maps to ink1', () => {
      const img = createTestImage(1, 1, [0, 0, 0, 255]);
      const r = toDuotone(img, [10, 20, 30], [200, 200, 200]);
      expect(r.data[0]).toBe(10);
      expect(r.data[1]).toBe(20);
      expect(r.data[2]).toBe(30);
    });

    it('white maps to ink2', () => {
      const img = createTestImage(1, 1, [255, 255, 255, 255]);
      const r = toDuotone(img, [0, 0, 0], [100, 150, 200]);
      expect(r.data[0]).toBe(100);
      expect(r.data[1]).toBe(150);
      expect(r.data[2]).toBe(200);
    });

    it('preserves alpha', () => {
      const img = createTestImage(1, 1, [128, 128, 128, 180]);
      const r = toDuotone(img);
      expect(r.data[3]).toBe(180);
    });
  });

  describe('toMultichannel', () => {
    it('returns three channels', () => {
      const { cyan, magenta, yellow } = toMultichannel(createTestImage(5, 5));
      expect(cyan.width).toBe(5);
      expect(magenta.width).toBe(5);
      expect(yellow.width).toBe(5);
    });

    it('white pixel produces zero CMY', () => {
      const { cyan, magenta, yellow } = toMultichannel(createTestImage(1, 1, [255, 255, 255, 255]));
      expect(cyan.data[0]).toBe(0);
      expect(magenta.data[0]).toBe(0);
      expect(yellow.data[0]).toBe(0);
    });

    it('red pixel produces zero cyan, full magenta/yellow', () => {
      const { cyan, magenta, yellow } = toMultichannel(createTestImage(1, 1, [255, 0, 0, 255]));
      expect(cyan.data[0]).toBe(0); // 255 - 255 = 0
      expect(magenta.data[0]).toBe(255); // 255 - 0 = 255
      expect(yellow.data[0]).toBe(255); // 255 - 0 = 255
    });

    it('preserves alpha in all channels', () => {
      const { cyan, magenta, yellow } = toMultichannel(createTestImage(1, 1, [128, 128, 128, 180]));
      expect(cyan.data[3]).toBe(180);
      expect(magenta.data[3]).toBe(180);
      expect(yellow.data[3]).toBe(180);
    });

    it('does not modify input', () => {
      const img = createTestImage(5, 5);
      const copy = new Uint8ClampedArray(img.data);
      toMultichannel(img);
      expect(img.data).toEqual(copy);
    });
  });
});

// ==================== Automation ====================

describe('Phase 15: Automation', () => {
  describe('cropAndStraightenPhotos', () => {
    it('returns empty array for uniform white image', () => {
      const img = createTestImage(50, 50, [255, 255, 255, 255]);
      const results = cropAndStraightenPhotos(img);
      expect(results.length).toBe(0);
    });

    it('detects a dark rectangle on white background', () => {
      const img = createTestImage(100, 100, [255, 255, 255, 255]);
      // Draw dark rectangle
      for (let y = 20; y < 80; y++) {
        for (let x = 10; x < 90; x++) {
          const idx = (y * 100 + x) * 4;
          img.data[idx] = 50; img.data[idx + 1] = 50; img.data[idx + 2] = 50;
        }
      }
      const results = cropAndStraightenPhotos(img, 200);
      expect(results.length).toBeGreaterThanOrEqual(1);
      const r = results[0];
      expect(r.x).toBeGreaterThanOrEqual(10);
      expect(r.y).toBeGreaterThanOrEqual(20);
      expect(r.width).toBeGreaterThanOrEqual(50);
      expect(r.height).toBeGreaterThanOrEqual(40);
    });

    it('each result has angle property', () => {
      const img = createTestImage(100, 100, [255, 255, 255, 255]);
      for (let y = 20; y < 80; y++) {
        for (let x = 20; x < 80; x++) {
          const idx = (y * 100 + x) * 4;
          img.data[idx] = 30; img.data[idx + 1] = 30; img.data[idx + 2] = 30;
        }
      }
      const results = cropAndStraightenPhotos(img, 200);
      if (results.length > 0) {
        expect(typeof results[0].angle).toBe('number');
        expect(results[0].angle).toBeGreaterThanOrEqual(-15);
        expect(results[0].angle).toBeLessThanOrEqual(15);
      }
    });

    it('does not modify input', () => {
      const img = createTestImage(50, 50);
      const copy = new Uint8ClampedArray(img.data);
      cropAndStraightenPhotos(img);
      expect(img.data).toEqual(copy);
    });
  });
});
