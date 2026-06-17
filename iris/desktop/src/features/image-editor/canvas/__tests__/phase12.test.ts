/**
 * Phase 12 Tests — Calculations, Apply Image, Perspective Warp,
 * Content-Aware Scale, Color Lookup (LUT)
 */
import { describe, it, expect } from 'vitest';
import {
  calculations,
  applyImage,
  perspectiveWarp,
  contentAwareScale,
} from '../filters';
import { colorLookup, type LutPreset } from '../adjustments';

function createTestImageData(width = 20, height = 20, fillR = 128, fillG = 128, fillB = 128): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillR; data[i + 1] = fillG; data[i + 2] = fillB; data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function createGradientImageData(width = 20, height = 20): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.floor(x / width * 255);
      data[i + 1] = Math.floor(y / height * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

// ==================== Calculations ====================

describe('Calculations', () => {
  it('should return correct dimensions', () => {
    const img = createTestImageData(12, 8);
    const result = calculations(img, 'gray', null, 'gray', 'multiply');
    expect(result.width).toBe(12);
    expect(result.height).toBe(8);
  });

  it('should not mutate input', () => {
    const img = createTestImageData();
    const orig = new Uint8ClampedArray(img.data);
    calculations(img, 'red', null, 'blue', 'add');
    expect(img.data).toEqual(orig);
  });

  const blendModes = ['add', 'subtract', 'multiply', 'screen', 'difference'] as const;
  for (const mode of blendModes) {
    it(`should support blend mode: ${mode}`, () => {
      const img = createGradientImageData();
      const result = calculations(img, 'red', null, 'green', mode);
      expect(result.width).toBe(20);
    });
  }

  const channels = ['red', 'green', 'blue', 'gray'] as const;
  for (const ch of channels) {
    it(`should support channel: ${ch}`, () => {
      const img = createGradientImageData();
      const result = calculations(img, ch, null, 'gray', 'multiply');
      expect(result.width).toBe(20);
    });
  }

  it('should accept two different images', () => {
    const img1 = createTestImageData(10, 10, 200, 100, 50);
    const img2 = createTestImageData(10, 10, 50, 200, 100);
    const result = calculations(img1, 'red', img2, 'green', 'screen');
    expect(result.width).toBe(10);
  });
});

// ==================== Apply Image ====================

describe('Apply Image', () => {
  it('should return correct dimensions', () => {
    const target = createTestImageData(15, 10);
    const source = createTestImageData(15, 10);
    const result = applyImage(target, source, 'normal', 100);
    expect(result.width).toBe(15);
    expect(result.height).toBe(10);
  });

  it('should not mutate inputs', () => {
    const target = createTestImageData();
    const source = createGradientImageData();
    const origT = new Uint8ClampedArray(target.data);
    const origS = new Uint8ClampedArray(source.data);
    applyImage(target, source, 'multiply', 50);
    expect(target.data).toEqual(origT);
    expect(source.data).toEqual(origS);
  });

  const modes = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light'] as const;
  for (const mode of modes) {
    it(`should support blend mode: ${mode}`, () => {
      const target = createGradientImageData();
      const source = createTestImageData(20, 20, 200, 100, 50);
      const result = applyImage(target, source, mode, 80);
      expect(result.width).toBe(20);
    });
  }

  it('should respect opacity', () => {
    const target = createTestImageData(5, 5, 0, 0, 0);
    const source = createTestImageData(5, 5, 255, 255, 255);
    const r50 = applyImage(target, source, 'normal', 50);
    const r100 = applyImage(target, source, 'normal', 100);
    // At 50% opacity, should be roughly 128
    expect(r50.data[0]).toBeGreaterThan(100);
    expect(r50.data[0]).toBeLessThan(160);
    // At 100% opacity, should be 255
    expect(r100.data[0]).toBe(255);
  });
});

// ==================== Perspective Warp ====================

describe('Perspective Warp', () => {
  it('should return correct dimensions', () => {
    const img = createTestImageData(20, 20);
    const result = perspectiveWarp(img, {
      tl: { x: 0, y: 0 }, tr: { x: 19, y: 0 },
      bl: { x: 0, y: 19 }, br: { x: 19, y: 19 },
    });
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it('should not mutate input', () => {
    const img = createGradientImageData(10, 10);
    const orig = new Uint8ClampedArray(img.data);
    perspectiveWarp(img, {
      tl: { x: 2, y: 2 }, tr: { x: 8, y: 0 },
      bl: { x: 0, y: 8 }, br: { x: 9, y: 9 },
    });
    expect(img.data).toEqual(orig);
  });

  it('identity transform should preserve pixel values', () => {
    const img = createGradientImageData(10, 10);
    const result = perspectiveWarp(img, {
      tl: { x: 0, y: 0 }, tr: { x: 9, y: 0 },
      bl: { x: 0, y: 9 }, br: { x: 9, y: 9 },
    });
    // Center pixel should be similar
    const ci = (5 * 10 + 5) * 4;
    expect(Math.abs(result.data[ci] - img.data[ci])).toBeLessThan(30);
  });
});

// ==================== Content-Aware Scale ====================

describe('Content-Aware Scale', () => {
  it('should return requested dimensions', () => {
    const img = createGradientImageData(20, 20);
    const result = contentAwareScale(img, 15, 20);
    expect(result.width).toBe(15);
    expect(result.height).toBe(20);
  });

  it('should not mutate input', () => {
    const img = createTestImageData(10, 10);
    const orig = new Uint8ClampedArray(img.data);
    contentAwareScale(img, 8, 10);
    expect(img.data).toEqual(orig);
  });

  it('should handle height scaling', () => {
    const img = createTestImageData(10, 10);
    const result = contentAwareScale(img, 10, 8);
    expect(result.width).toBe(10);
    expect(result.height).toBe(8);
  });
});

// ==================== Color Lookup (LUT) ====================

describe('Color Lookup (LUT)', () => {
  it('should return correct dimensions', () => {
    const img = createTestImageData(12, 8);
    const result = colorLookup(img, 'warm', 100);
    expect(result.width).toBe(12);
    expect(result.height).toBe(8);
  });

  it('should not mutate input', () => {
    const img = createGradientImageData();
    const orig = new Uint8ClampedArray(img.data);
    colorLookup(img, 'cool', 50);
    expect(img.data).toEqual(orig);
  });

  it('should preserve alpha', () => {
    const img = createTestImageData(5, 5);
    const result = colorLookup(img, 'vintage', 100);
    expect(result.data[3]).toBe(255);
  });

  const presets: LutPreset[] = ['warm', 'cool', 'vintage', 'cinematic', 'noir', 'cross-process', 'bleach-bypass', 'teal-orange'];
  for (const preset of presets) {
    it(`should support preset: ${preset}`, () => {
      const img = createGradientImageData(10, 10);
      const result = colorLookup(img, preset, 80);
      expect(result.width).toBe(10);
    });
  }

  it('should respect intensity 0 (no change)', () => {
    const img = createTestImageData(5, 5, 100, 150, 200);
    const result = colorLookup(img, 'warm', 0);
    expect(result.data[0]).toBe(100);
    expect(result.data[1]).toBe(150);
    expect(result.data[2]).toBe(200);
  });

  it('should accept custom LUT', () => {
    const img = createTestImageData(5, 5, 100, 100, 100);
    const customLut = new Uint8ClampedArray(256 * 3);
    // Invert LUT
    for (let i = 0; i < 256; i++) {
      customLut[i * 3] = 255 - i;
      customLut[i * 3 + 1] = 255 - i;
      customLut[i * 3 + 2] = 255 - i;
    }
    const result = colorLookup(img, 'warm', 100, customLut);
    // Should be inverted: 100 → 155
    expect(result.data[0]).toBe(155);
  });
});
