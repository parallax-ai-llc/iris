/**
 * Phase 14: Camera Raw Extensions + Auto Selection + Utilities + Color Modes
 */
import { describe, it, expect } from 'vitest';
import {
  applyDehaze,
  applyTexture,
  applyHdrToning,
  selectSky,
  selectFocusArea,
  fitImage,
  contactSheet,
  detectStraightenAngle,
  rgbToLab,
  labToRgb,
  toIndexedColor,
} from '../adjustments';

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

describe('Phase 14: Camera Raw Extensions', () => {
  describe('applyDehaze', () => {
    immutabilityCheck((img) => applyDehaze(img, 50), 'dehaze');

    it('preserves dimensions', () => {
      const r = applyDehaze(createTestImage(10, 10), 50);
      expect(r.width).toBe(10);
      expect(r.height).toBe(10);
    });

    it('positive amount increases contrast', () => {
      // Non-uniform image so dark channel prior produces varying transmissions
      const img = createTestImage(10, 10, [180, 180, 200, 255]);
      // Add darker region to create non-uniform dark channel
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 10; x++) {
          const idx = (y * 10 + x) * 4;
          img.data[idx] = 60; img.data[idx + 1] = 80; img.data[idx + 2] = 90;
        }
      }
      const r = applyDehaze(img, 80);
      let changed = false;
      for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i] !== img.data[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('negative amount adds haze (blends toward atmosphere)', () => {
      // Non-uniform: dark pixels + bright atmospheric light region
      const img = createTestImage(10, 10, [50, 50, 50, 255]);
      // Add bright region so atmospheric light differs from dark pixels
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 10; x++) {
          const idx = (y * 10 + x) * 4;
          img.data[idx] = 220; img.data[idx + 1] = 220; img.data[idx + 2] = 230;
        }
      }
      const r = applyDehaze(img, -50);
      // Dark pixels should shift toward atmospheric light (lighten)
      const darkIdx = (5 * 10 + 5) * 4; // A pixel in the dark region
      expect(r.data[darkIdx]).toBeGreaterThan(50);
    });

    it('zero amount produces near-identical output', () => {
      const img = createTestImage(5, 5, [100, 100, 100, 255]);
      const r = applyDehaze(img, 0);
      // With strength=0, remove-haze path uses 1-0*darkCh = 1 → identity
      for (let i = 0; i < r.data.length; i += 4) {
        expect(Math.abs(r.data[i] - img.data[i])).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('applyTexture', () => {
    immutabilityCheck((img) => applyTexture(img, 50), 'texture');

    it('preserves dimensions', () => {
      const r = applyTexture(createTestImage(10, 10), 50);
      expect(r.width).toBe(10);
    });

    it('uniform image stays uniform', () => {
      const img = createTestImage(10, 10, [100, 100, 100, 255]);
      const r = applyTexture(img, 50);
      const center = (5 * 10 + 5) * 4;
      expect(r.data[center]).toBe(100);
    });

    it('positive amount enhances detail', () => {
      const img = createTestImage(10, 10, [100, 100, 100, 255]);
      // Add a bright spot
      const ci = (5 * 10 + 5) * 4;
      img.data[ci] = 200; img.data[ci + 1] = 200; img.data[ci + 2] = 200;
      const r = applyTexture(img, 80);
      // Bright spot should be brighter
      expect(r.data[ci]).toBeGreaterThanOrEqual(200);
    });
  });

  describe('applyHdrToning', () => {
    immutabilityCheck((img) => applyHdrToning(img, 50, 50, 0), 'hdrToning');

    it('preserves dimensions', () => {
      const r = applyHdrToning(createTestImage(10, 10), 50, 50, 0);
      expect(r.width).toBe(10);
    });

    it('modifies pixel values', () => {
      const img = createTestImage(20, 20);
      for (let i = 0; i < 400; i++) img.data[i * 4] = i % 256;
      const r = applyHdrToning(img, 70, 70, 0);
      let changed = false;
      for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i] !== img.data[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('saturation parameter affects colors', () => {
      const img = createTestImage(10, 10, [200, 100, 50, 255]);
      const desat = applyHdrToning(img, 30, 30, -50);
      const sat = applyHdrToning(img, 30, 30, 50);
      // Saturated version should have more color spread
      const center = (5 * 10 + 5) * 4;
      const desatRange = Math.abs(desat.data[center] - desat.data[center + 2]);
      const satRange = Math.abs(sat.data[center] - sat.data[center + 2]);
      expect(satRange).toBeGreaterThanOrEqual(desatRange);
    });
  });
});

describe('Phase 14: Auto Selection', () => {
  describe('selectSky', () => {
    it('returns mask of correct size', () => {
      const mask = selectSky(createTestImage(10, 10));
      expect(mask.length).toBe(100);
    });

    it('detects blue sky pixels in upper region', () => {
      const img = createTestImage(10, 10, [100, 150, 220, 255]); // Bluish
      const mask = selectSky(img);
      // Top pixels should score higher
      expect(mask[0]).toBeGreaterThan(0);
    });

    it('rejects dark pixels', () => {
      const img = createTestImage(10, 10, [20, 20, 20, 255]);
      const mask = selectSky(img);
      // Dark pixels should not be detected as sky
      expect(mask[0]).toBe(0);
    });

    it('does not modify input', () => {
      const img = createTestImage(10, 10, [100, 150, 220, 255]);
      const copy = new Uint8ClampedArray(img.data);
      selectSky(img);
      expect(img.data).toEqual(copy);
    });
  });

  describe('selectFocusArea', () => {
    it('returns mask of correct size', () => {
      const mask = selectFocusArea(createTestImage(10, 10), 50);
      expect(mask.length).toBe(100);
    });

    it('detects sharp edges as in-focus', () => {
      const img = createTestImage(20, 20, [100, 100, 100, 255]);
      // Create sharp edge at center
      for (let y = 8; y < 12; y++) {
        for (let x = 10; x < 20; x++) {
          const idx = (y * 20 + x) * 4;
          img.data[idx] = 200; img.data[idx + 1] = 200; img.data[idx + 2] = 200;
        }
      }
      const mask = selectFocusArea(img, 30);
      // Near the edge, density should be non-zero
      const edgePixel = 10 * 20 + 10;
      expect(mask[edgePixel]).toBeGreaterThan(0);
    });

    it('uniform image produces low focus scores', () => {
      const mask = selectFocusArea(createTestImage(10, 10, [128, 128, 128, 255]), 50);
      // No edges → no focus
      let maxVal = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i] > maxVal) maxVal = mask[i];
      expect(maxVal).toBe(0);
    });
  });
});

describe('Phase 14: Utilities', () => {
  describe('fitImage', () => {
    it('returns copy if already fits', () => {
      const img = createTestImage(10, 10);
      const r = fitImage(img, 20, 20);
      expect(r.width).toBe(10);
      expect(r.height).toBe(10);
    });

    it('scales down to fit width', () => {
      const img = createTestImage(20, 10);
      const r = fitImage(img, 10, 10);
      expect(r.width).toBe(10);
      expect(r.height).toBe(5);
    });

    it('scales down to fit height', () => {
      const img = createTestImage(10, 20);
      const r = fitImage(img, 10, 10);
      expect(r.width).toBe(5);
      expect(r.height).toBe(10);
    });

    it('preserves aspect ratio', () => {
      const img = createTestImage(100, 50);
      const r = fitImage(img, 40, 40);
      expect(r.width).toBe(40);
      expect(r.height).toBe(20);
    });
  });

  describe('contactSheet', () => {
    it('returns valid image for multiple inputs', () => {
      const imgs = [
        createTestImage(10, 10, [255, 0, 0, 255]),
        createTestImage(10, 10, [0, 255, 0, 255]),
        createTestImage(10, 10, [0, 0, 255, 255]),
      ];
      const r = contactSheet(imgs, 2, 50, 50, 5);
      expect(r.width).toBe(2 * 50 + 3 * 5); // 115
      expect(r.height).toBe(2 * 50 + 3 * 5); // 115 (2 rows for 3 images / 2 cols)
    });

    it('returns 1x1 for empty input', () => {
      const r = contactSheet([], 4);
      expect(r.width).toBe(1);
    });

    it('places thumbnails on background', () => {
      const imgs = [createTestImage(10, 10, [255, 0, 0, 255])];
      const r = contactSheet(imgs, 1, 50, 50, 10, [255, 255, 255]);
      // Background at (0,0) should be white
      expect(r.data[0]).toBe(255);
      // Thumbnail area should be red
      const thumbIdx = (10 * r.width + 10) * 4;
      expect(r.data[thumbIdx]).toBeGreaterThan(200); // Red
    });
  });

  describe('detectStraightenAngle', () => {
    it('returns angle between -15 and 15', () => {
      const img = createTestImage(20, 20);
      const angle = detectStraightenAngle(img);
      expect(angle).toBeGreaterThanOrEqual(-15);
      expect(angle).toBeLessThanOrEqual(15);
    });

    it('detects horizontal lines as 0 degrees', () => {
      const img = createTestImage(20, 20, [50, 50, 50, 255]);
      // Draw horizontal line
      for (let x = 0; x < 20; x++) {
        const idx = (10 * 20 + x) * 4;
        img.data[idx] = 200; img.data[idx + 1] = 200; img.data[idx + 2] = 200;
      }
      const angle = detectStraightenAngle(img);
      expect(Math.abs(angle)).toBeLessThanOrEqual(5);
    });
  });
});

describe('Phase 14: Color Mode Conversions', () => {
  describe('rgbToLab / labToRgb', () => {
    it('round-trips approximately', () => {
      const img = createTestImage(5, 5, [180, 100, 50, 255]);
      const lab = rgbToLab(img);
      expect(lab.length).toBe(75); // 5*5*3
      const back = labToRgb(lab, 5, 5);
      // Should be approximately the same
      for (let i = 0; i < img.data.length; i += 4) {
        expect(Math.abs(back.data[i] - img.data[i])).toBeLessThanOrEqual(2);
        expect(Math.abs(back.data[i + 1] - img.data[i + 1])).toBeLessThanOrEqual(2);
        expect(Math.abs(back.data[i + 2] - img.data[i + 2])).toBeLessThanOrEqual(2);
      }
    });

    it('pure white has L=100', () => {
      const img = createTestImage(1, 1, [255, 255, 255, 255]);
      const lab = rgbToLab(img);
      expect(lab[0]).toBeCloseTo(100, 0);
      expect(Math.abs(lab[1])).toBeLessThan(1); // a ≈ 0
      expect(Math.abs(lab[2])).toBeLessThan(1); // b ≈ 0
    });

    it('pure black has L=0', () => {
      const img = createTestImage(1, 1, [0, 0, 0, 255]);
      const lab = rgbToLab(img);
      expect(lab[0]).toBeCloseTo(0, 0);
    });

    it('preserves alpha when provided', () => {
      const lab = new Float32Array([50, 0, 0]);
      const alpha = new Uint8ClampedArray([200]);
      const r = labToRgb(lab, 1, 1, alpha);
      expect(r.data[3]).toBe(200);
    });
  });

  describe('toIndexedColor', () => {
    it('reduces to specified palette size', () => {
      const img = createTestImage(10, 10);
      // Vary colors
      for (let i = 0; i < 100; i++) {
        img.data[i * 4] = i * 2;
        img.data[i * 4 + 1] = 255 - i * 2;
      }
      const { imageData, palette } = toIndexedColor(img, 4);
      expect(palette.length).toBeLessThanOrEqual(4);
      expect(imageData.width).toBe(10);
    });

    it('preserves dimensions and alpha', () => {
      const img = createTestImage(5, 5, [100, 150, 200, 180]);
      const { imageData } = toIndexedColor(img, 8);
      expect(imageData.width).toBe(5);
      expect(imageData.height).toBe(5);
      expect(imageData.data[3]).toBe(180);
    });

    it('single color produces palette of 1', () => {
      const img = createTestImage(5, 5, [100, 100, 100, 255]);
      const { palette } = toIndexedColor(img, 16);
      // All same color → 1 bucket after median cut
      expect(palette.length).toBeGreaterThanOrEqual(1);
      expect(palette[0][0]).toBe(100);
    });

    it('maps all pixels to palette colors', () => {
      const img = createTestImage(10, 10);
      for (let i = 0; i < 100; i++) img.data[i * 4] = i * 2;
      const { imageData, palette } = toIndexedColor(img, 4);
      const paletteSet = new Set(palette.map(p => `${p[0]},${p[1]},${p[2]}`));
      for (let i = 0; i < imageData.data.length; i += 4) {
        const key = `${imageData.data[i]},${imageData.data[i+1]},${imageData.data[i+2]}`;
        expect(paletteSet.has(key)).toBe(true);
      }
    });
  });
});
