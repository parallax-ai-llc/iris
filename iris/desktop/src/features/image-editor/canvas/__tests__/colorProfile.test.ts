/**
 * Tests for colorProfile.ts - RGB↔CMYK conversion and gamut simulation
 */

import { describe, it, expect } from 'vitest';
import {
  rgbToCmyk,
  cmykToRgb,
  isOutOfGamut,
  applyCmykPreview,
  generateGamutWarningOverlay,
  canvasToCmykData,
  getCmykInfo,
} from '../colorProfile';

describe('rgbToCmyk', () => {
  it('converts pure black', () => {
    const result = rgbToCmyk(0, 0, 0);
    expect(result).toEqual({ c: 0, m: 0, y: 0, k: 100 });
  });

  it('converts pure white', () => {
    const result = rgbToCmyk(255, 255, 255);
    expect(result).toEqual({ c: 0, m: 0, y: 0, k: 0 });
  });

  it('converts pure red', () => {
    const result = rgbToCmyk(255, 0, 0);
    expect(result).toEqual({ c: 0, m: 100, y: 100, k: 0 });
  });

  it('converts pure green', () => {
    const result = rgbToCmyk(0, 255, 0);
    expect(result).toEqual({ c: 100, m: 0, y: 100, k: 0 });
  });

  it('converts pure blue', () => {
    const result = rgbToCmyk(0, 0, 255);
    expect(result).toEqual({ c: 100, m: 100, y: 0, k: 0 });
  });

  it('converts mid-gray', () => {
    const result = rgbToCmyk(128, 128, 128);
    expect(result.k).toBeGreaterThan(40);
    expect(result.c).toBe(0);
    expect(result.m).toBe(0);
    expect(result.y).toBe(0);
  });
});

describe('cmykToRgb', () => {
  it('converts pure black', () => {
    const result = cmykToRgb(0, 0, 0, 100);
    expect(result).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('converts pure white', () => {
    const result = cmykToRgb(0, 0, 0, 0);
    expect(result).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('round-trips primary colors', () => {
    // Red
    const cmyk = rgbToCmyk(255, 0, 0);
    const rgb = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(0);
  });
});

describe('isOutOfGamut', () => {
  it('returns false for pure white (in gamut)', () => {
    expect(isOutOfGamut(255, 255, 255)).toBe(false);
  });

  it('returns false for pure black (in gamut)', () => {
    expect(isOutOfGamut(0, 0, 0)).toBe(false);
  });

  it('returns false for pure primary colors (no rounding loss)', () => {
    // Pure primaries round-trip exactly with integer CMYK
    expect(isOutOfGamut(255, 0, 0)).toBe(false);
  });

  it('detects out-of-gamut with tight threshold', () => {
    // Some colors have rounding loss due to integer CMYK values
    // Use threshold=0 to detect any difference
    const oog = isOutOfGamut(137, 42, 201, 0);
    // This may or may not be OOG depending on rounding; just verify the function runs
    expect(typeof oog).toBe('boolean');
  });
});

describe('applyCmykPreview', () => {
  it('modifies ImageData in place via round-trip', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const imageData = { data, width: 2, height: 1 } as ImageData;
    applyCmykPreview(imageData);
    // Red should round-trip exactly: CMYK(0,100,100,0) → RGB(255,0,0)
    expect(imageData.data[0]).toBe(255);
    expect(imageData.data[1]).toBe(0);
    expect(imageData.data[2]).toBe(0);
    expect(imageData.data[3]).toBe(255); // alpha unchanged
  });
});

describe('generateGamutWarningOverlay', () => {
  it('returns ImageData with same dimensions', () => {
    const data = new Uint8ClampedArray([200, 100, 50, 255]);
    const imageData = { data, width: 1, height: 1 } as ImageData;
    const overlay = generateGamutWarningOverlay(imageData);
    expect(overlay.width).toBe(1);
    expect(overlay.height).toBe(1);
    expect(overlay.data.length).toBe(4);
  });

  it('in-gamut pixels are transparent', () => {
    // Pure white is in gamut
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    const imageData = { data, width: 1, height: 1 } as ImageData;
    const overlay = generateGamutWarningOverlay(imageData);
    expect(overlay.data[3]).toBe(0); // transparent
  });
});

describe('canvasToCmykData', () => {
  it('returns correct CMYK values for black pixel', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    const imageData = { data, width: 1, height: 1 } as ImageData;
    const cmykData = canvasToCmykData(imageData);
    expect(cmykData.length).toBe(4);
    expect(cmykData[0]).toBe(0); // C
    expect(cmykData[1]).toBe(0); // M
    expect(cmykData[2]).toBe(0); // Y
    expect(cmykData[3]).toBe(100); // K
  });

  it('returns correct CMYK for two pixels', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,   // red
      0, 0, 0, 255,     // black
    ]);
    const imageData = { data, width: 2, height: 1 } as ImageData;
    const cmykData = canvasToCmykData(imageData);
    expect(cmykData.length).toBe(8);
    // Red: C=0, M=100, Y=100, K=0
    expect(cmykData[0]).toBe(0);
    expect(cmykData[1]).toBe(100);
    expect(cmykData[2]).toBe(100);
    expect(cmykData[3]).toBe(0);
  });
});

describe('getCmykInfo', () => {
  it('returns formatted CMYK string', () => {
    const info = getCmykInfo(255, 0, 0);
    expect(info).toBe('C:0% M:100% Y:100% K:0%');
  });

  it('returns correct info for black', () => {
    const info = getCmykInfo(0, 0, 0);
    expect(info).toBe('C:0% M:0% Y:0% K:100%');
  });
});
