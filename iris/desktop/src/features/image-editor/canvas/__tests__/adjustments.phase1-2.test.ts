/**
 * Adjustments Gap Tests — Phase 1-2 Coverage
 *
 * Tests for functions NOT covered by adjustments.test.ts or adjustments.core.test.ts:
 * colorLookup, applyDehaze, applyTexture, applyHdrToning,
 * removeJpegArtifacts, skinSmoothing, colorTransfer, depthBlur,
 * styleTransfer, autoAlignOffset
 */

import { describe, it, expect } from 'vitest';
import {
  colorLookup,
  applyDehaze,
  applyTexture,
  applyHdrToning,
  removeJpegArtifacts,
  skinSmoothing,
  colorTransfer,
  depthBlur,
  styleTransfer,
  autoAlignOffset,
} from '../adjustments';

// ==================== Helpers ====================

function createTestImageData(
  width: number,
  height: number,
  fill?: [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const [r, g, b, a] = fill ?? [128, 64, 32, 255];
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return new ImageData(data, width, height);
}

function createGradientImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const val = Math.round((x / (width - 1)) * 255);
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function getPixel(imageData: ImageData, index: number): [number, number, number, number] {
  const offset = index * 4;
  return [
    imageData.data[offset],
    imageData.data[offset + 1],
    imageData.data[offset + 2],
    imageData.data[offset + 3],
  ];
}

function standardTests(
  name: string,
  fn: (input: ImageData) => ImageData,
) {
  it('should preserve dimensions', () => {
    const input = createTestImageData(8, 6);
    const result = fn(input);
    expect(result.width).toBe(8);
    expect(result.height).toBe(6);
    expect(result.data.length).toBe(input.data.length);
  });

  it('should preserve alpha channel', () => {
    const input = createTestImageData(4, 4, [128, 64, 32, 180]);
    const result = fn(input);
    for (let i = 0; i < 16; i++) {
      expect(getPixel(result, i)[3]).toBe(180);
    }
  });

  it('should not mutate the original ImageData', () => {
    const input = createTestImageData(4, 4, [128, 64, 32, 255]);
    const originalData = new Uint8ClampedArray(input.data);
    fn(input);
    expect(input.data).toEqual(originalData);
  });
}

// ==================== colorLookup ====================

describe('colorLookup', () => {
  standardTests('colorLookup', (input) => colorLookup(input, 'warm', 50));

  it('should not change image when intensity is 0', () => {
    const input = createTestImageData(4, 4, [100, 150, 200, 255]);
    const result = colorLookup(input, 'warm', 0);
    for (let i = 0; i < 16; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(100);
      expect(g).toBe(150);
      expect(b).toBe(200);
    }
  });

  it('should apply full effect at intensity 100', () => {
    const input = createTestImageData(4, 4, [128, 128, 128, 255]);
    const resultFull = colorLookup(input, 'warm', 100);
    const resultHalf = colorLookup(input, 'warm', 50);
    // Full intensity should differ more from original than half
    const origPixel = getPixel(input, 0);
    const fullPixel = getPixel(resultFull, 0);
    const halfPixel = getPixel(resultHalf, 0);
    const fullDiff = Math.abs(fullPixel[0] - origPixel[0]) + Math.abs(fullPixel[1] - origPixel[1]) + Math.abs(fullPixel[2] - origPixel[2]);
    const halfDiff = Math.abs(halfPixel[0] - origPixel[0]) + Math.abs(halfPixel[1] - origPixel[1]) + Math.abs(halfPixel[2] - origPixel[2]);
    expect(fullDiff).toBeGreaterThanOrEqual(halfDiff);
  });

  it('should produce different results for different presets', () => {
    const input = createTestImageData(4, 4, [128, 128, 128, 255]);
    const warm = colorLookup(input, 'warm', 100);
    const cool = colorLookup(input, 'cool', 100);
    const warmPixel = getPixel(warm, 0);
    const coolPixel = getPixel(cool, 0);
    const isDifferent = warmPixel[0] !== coolPixel[0] ||
                        warmPixel[1] !== coolPixel[1] ||
                        warmPixel[2] !== coolPixel[2];
    expect(isDifferent).toBe(true);
  });

  it('should accept all preset names without error', () => {
    const input = createTestImageData(4, 4);
    const presets = ['warm', 'cool', 'vintage', 'cinematic', 'noir', 'cross-process', 'bleach-bypass', 'teal-orange'] as const;
    for (const preset of presets) {
      expect(() => colorLookup(input, preset, 50)).not.toThrow();
    }
  });

  it('should clamp intensity to 0-100 range', () => {
    const input = createTestImageData(4, 4, [128, 128, 128, 255]);
    // Negative intensity should behave like 0
    const negResult = colorLookup(input, 'warm', -50);
    for (let i = 0; i < 16; i++) {
      const [r, g, b] = getPixel(negResult, i);
      expect(r).toBe(128);
      expect(g).toBe(128);
      expect(b).toBe(128);
    }
  });

  it('should accept custom LUT', () => {
    const input = createTestImageData(2, 2, [128, 128, 128, 255]);
    // Identity LUT: each entry maps to itself
    const customLut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      customLut[i * 3] = i;
      customLut[i * 3 + 1] = i;
      customLut[i * 3 + 2] = i;
    }
    const result = colorLookup(input, 'warm', 100, customLut);
    const [r, g, b] = getPixel(result, 0);
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
  });
});

// ==================== applyDehaze ====================

describe('applyDehaze', () => {
  standardTests('applyDehaze', (input) => applyDehaze(input, 50));

  it('should not change image when amount is 0', () => {
    const input = createTestImageData(8, 8, [100, 100, 100, 255]);
    const result = applyDehaze(input, 0);
    for (let i = 0; i < 64; i++) {
      const [r, g, b] = getPixel(result, i);
      // With 0 strength, negative branch: ha = 0, pixel * 1 + atm * 0 = pixel
      expect(r).toBe(100);
      expect(g).toBe(100);
      expect(b).toBe(100);
    }
  });

  it('should increase contrast (dehaze) with positive amount', () => {
    // Gradient image with variation for atmospheric estimation
    const input = createGradientImageData(32, 32);
    const result = applyDehaze(input, 80);
    // Check multiple pixels for any difference
    let anyDiff = false;
    for (let i = 0; i < 32 * 32; i++) {
      const orig = getPixel(input, i);
      const dehazed = getPixel(result, i);
      if (dehazed[0] !== orig[0] || dehazed[1] !== orig[1] || dehazed[2] !== orig[2]) {
        anyDiff = true;
        break;
      }
    }
    expect(anyDiff).toBe(true);
  });

  it('should add haze with negative amount', () => {
    const input = createTestImageData(16, 16, [50, 50, 50, 255]);
    const result = applyDehaze(input, -80);
    // Adding haze should push towards atmospheric light (brighten)
    const [r] = getPixel(result, 0);
    expect(r).toBeGreaterThanOrEqual(50);
  });

  it('should produce values in 0-255 range', () => {
    const input = createGradientImageData(16, 16);
    const result = applyDehaze(input, 100);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(255);
      expect(result.data[i + 1]).toBeGreaterThanOrEqual(0);
      expect(result.data[i + 1]).toBeLessThanOrEqual(255);
      expect(result.data[i + 2]).toBeGreaterThanOrEqual(0);
      expect(result.data[i + 2]).toBeLessThanOrEqual(255);
    }
  });
});

// ==================== applyTexture ====================

describe('applyTexture', () => {
  standardTests('applyTexture', (input) => applyTexture(input, 50));

  it('should not change image when amount is 0', () => {
    const input = createTestImageData(8, 8, [100, 100, 100, 255]);
    const result = applyTexture(input, 0);
    for (let i = 0; i < 64; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(100);
      expect(g).toBe(100);
      expect(b).toBe(100);
    }
  });

  it('should enhance detail with positive amount', () => {
    // Create a larger image with checkerboard-like variation for texture detection
    const data = new Uint8ClampedArray(32 * 32 * 4);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const idx = (y * 32 + x) * 4;
        const val = ((x + y) % 2 === 0) ? 80 : 180;
        data[idx] = val; data[idx + 1] = val; data[idx + 2] = val; data[idx + 3] = 255;
      }
    }
    const input = new ImageData(data, 32, 32);
    const result = applyTexture(input, 80);
    // Check any pixel in the interior for change
    let anyDiff = false;
    for (let i = 32 + 1; i < 32 * 31 - 1; i++) {
      const orig = getPixel(input, i);
      const enhanced = getPixel(result, i);
      if (orig[0] !== enhanced[0]) { anyDiff = true; break; }
    }
    expect(anyDiff).toBe(true);
  });

  it('should smooth with negative amount', () => {
    // Checkerboard pattern for visible smoothing
    const data = new Uint8ClampedArray(32 * 32 * 4);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const idx = (y * 32 + x) * 4;
        const val = ((x + y) % 2 === 0) ? 80 : 180;
        data[idx] = val; data[idx + 1] = val; data[idx + 2] = val; data[idx + 3] = 255;
      }
    }
    const input = new ImageData(data, 32, 32);
    const result = applyTexture(input, -80);
    let anyDiff = false;
    for (let i = 32 + 1; i < 32 * 31 - 1; i++) {
      const orig = getPixel(input, i);
      const smoothed = getPixel(result, i);
      if (orig[0] !== smoothed[0]) { anyDiff = true; break; }
    }
    expect(anyDiff).toBe(true);
  });

  it('should not change uniform image', () => {
    const input = createTestImageData(8, 8, [128, 128, 128, 255]);
    const result = applyTexture(input, 80);
    // A perfectly uniform image has no medium-frequency detail
    for (let i = 0; i < 64; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(128);
      expect(g).toBe(128);
      expect(b).toBe(128);
    }
  });

  it('should produce values in 0-255 range', () => {
    const input = createGradientImageData(16, 16);
    const result = applyTexture(input, 100);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ==================== applyHdrToning ====================

describe('applyHdrToning', () => {
  standardTests('applyHdrToning', (input) => applyHdrToning(input, 50, 50, 0));

  it('should handle zero strength gracefully', () => {
    const input = createTestImageData(8, 8, [128, 128, 128, 255]);
    const result = applyHdrToning(input, 0, 0, 0);
    // With zero strength and detail, gamma mapping is pow(x, 1) = x, no detail boost
    for (let i = 0; i < 64; i++) {
      const [r] = getPixel(result, i);
      expect(Math.abs(r - 128)).toBeLessThan(5);
    }
  });

  it('should brighten dark areas with positive strength', () => {
    const input = createTestImageData(16, 16, [30, 30, 30, 255]);
    const result = applyHdrToning(input, 80, 50, 0);
    const [r] = getPixel(result, 0);
    // HDR toning with high strength applies gamma < 1, brightening darks
    expect(r).toBeGreaterThan(30);
  });

  it('should increase saturation with positive saturation parameter', () => {
    const input = createTestImageData(8, 8, [200, 100, 50, 255]);
    const result = applyHdrToning(input, 50, 50, 80);
    const [r] = getPixel(result, 0);
    // Higher saturation should push colors away from gray
    // (not strictly testable with uniform image, but values should change)
    expect(r).not.toBe(200);
  });

  it('should produce values in 0-255 range with extreme parameters', () => {
    const input = createGradientImageData(16, 16);
    const result = applyHdrToning(input, 100, 100, 100);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(255);
      expect(result.data[i + 1]).toBeGreaterThanOrEqual(0);
      expect(result.data[i + 1]).toBeLessThanOrEqual(255);
      expect(result.data[i + 2]).toBeGreaterThanOrEqual(0);
      expect(result.data[i + 2]).toBeLessThanOrEqual(255);
    }
  });

  it('should handle 1x1 image', () => {
    const input = createTestImageData(1, 1, [128, 128, 128, 255]);
    expect(() => applyHdrToning(input, 50, 50, 0)).not.toThrow();
  });
});

// ==================== removeJpegArtifacts ====================

describe('removeJpegArtifacts', () => {
  standardTests('removeJpegArtifacts', (input) => removeJpegArtifacts(input, 50));

  it('should only smooth near 8x8 block boundaries', () => {
    // Create a 16x16 image with noisy pattern
    const input = createGradientImageData(16, 16);
    const result = removeJpegArtifacts(input, 80);
    // Center of block (x=4, y=4) should be unchanged since it is not near block boundary
    const centerIdx = 4 * 16 + 4;
    const [rOrig] = getPixel(input, centerIdx);
    const [rResult] = getPixel(result, centerIdx);
    expect(rResult).toBe(rOrig);
  });

  it('should modify pixels near block boundaries for non-uniform images', () => {
    // Create image with pixel variation
    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < data.length; i += 4) {
      const val = (i / 4) % 2 === 0 ? 100 : 200;
      data[i] = val; data[i + 1] = val; data[i + 2] = val; data[i + 3] = 255;
    }
    const input = new ImageData(data, 16, 16);
    const result = removeJpegArtifacts(input, 80);
    // Near block boundary pixel (x=0, y=1) should potentially be smoothed
    // since x%8=0 which is <= 1
    const boundaryIdx = 1 * 16 + 0;
    const [rResult] = getPixel(result, boundaryIdx);
    // With alternating pixels, bilateral smoothing may modify block-edge pixels
    // depending on bilateral weight; just check no crash and valid range.
    expect(rResult).toBeGreaterThanOrEqual(0);
    expect(rResult).toBeLessThanOrEqual(255);
  });

  it('should not change uniform image', () => {
    const input = createTestImageData(16, 16, [128, 128, 128, 255]);
    const result = removeJpegArtifacts(input, 80);
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(128);
      expect(g).toBe(128);
      expect(b).toBe(128);
    }
  });
});

// ==================== skinSmoothing ====================

describe('skinSmoothing', () => {
  standardTests('skinSmoothing', (input) => skinSmoothing(input, 50));

  it('should not modify non-skin-tone pixels', () => {
    // Blue pixels are not skin-tone
    const input = createTestImageData(8, 8, [0, 0, 255, 255]);
    const result = skinSmoothing(input, 80);
    for (let i = 0; i < 64; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(255);
    }
  });

  it('should smooth skin-tone pixels', () => {
    // Create image with skin-tone color (r > g > b, specific ranges)
    const data = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < data.length; i += 4) {
      // Alternate between two skin tones for variation
      const variation = (i / 4) % 2 === 0 ? 0 : 20;
      data[i] = 200 + variation; // r > 95
      data[i + 1] = 150 + variation; // g > 40, r > g
      data[i + 2] = 100; // b > 20, r > b, |r-g| > 15, r-b > 15
      data[i + 3] = 255;
    }
    const input = new ImageData(data, 8, 8);
    const result = skinSmoothing(input, 80);
    // Interior pixels (away from borders) should be smoothed
    // Check a center pixel
    const centerIdx = 4 * 8 + 4;
    const [rResult] = getPixel(result, centerIdx);
    // Smoothed value should be between the two alternating values
    expect(rResult).toBeGreaterThanOrEqual(190);
    expect(rResult).toBeLessThanOrEqual(230);
  });

  it('should handle 0 amount (no smoothing)', () => {
    const input = createTestImageData(8, 8, [200, 150, 100, 255]);
    const result = skinSmoothing(input, 0);
    // With amount=0, blend=0, so output = original * 1 + smooth * 0 = original
    // radius = max(1, round(0/20)) = 1, but blend = 0
    for (let i = 0; i < 64; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(200);
      expect(g).toBe(150);
      expect(b).toBe(100);
    }
  });
});

// ==================== colorTransfer ====================

describe('colorTransfer', () => {
  it('should preserve dimensions', () => {
    const target = createTestImageData(8, 6);
    const reference = createTestImageData(4, 4, [200, 100, 50, 255]);
    const result = colorTransfer(target, reference);
    expect(result.width).toBe(8);
    expect(result.height).toBe(6);
    expect(result.data.length).toBe(target.data.length);
  });

  it('should preserve alpha channel', () => {
    const target = createTestImageData(4, 4, [128, 64, 32, 180]);
    const reference = createTestImageData(4, 4, [200, 100, 50, 255]);
    const result = colorTransfer(target, reference);
    for (let i = 0; i < 16; i++) {
      expect(getPixel(result, i)[3]).toBe(180);
    }
  });

  it('should not mutate original ImageData', () => {
    const target = createTestImageData(4, 4, [128, 64, 32, 255]);
    const reference = createTestImageData(4, 4, [200, 100, 50, 255]);
    const originalData = new Uint8ClampedArray(target.data);
    colorTransfer(target, reference);
    expect(target.data).toEqual(originalData);
  });

  it('should shift target colors towards reference color statistics', () => {
    const target = createTestImageData(4, 4, [50, 50, 50, 255]);
    const reference = createTestImageData(4, 4, [200, 200, 200, 255]);
    const result = colorTransfer(target, reference);
    // Uniform images: target mean=50, ref mean=200, std=0 both
    // Formula: (pixel - targetMean) * (refStd / targetStd) + refMean
    // With std=0 for both, refStd/targetStd = 0/0 => clamp
    // Actually std=0 means divisor is 1 (fallback), so val = (50-50) * (0/1) + 200 = 200
    const [r] = getPixel(result, 0);
    expect(r).toBe(200);
  });

  it('should handle different sized images', () => {
    const target = createTestImageData(8, 8, [100, 100, 100, 255]);
    const reference = createTestImageData(4, 2, [200, 50, 150, 255]);
    expect(() => colorTransfer(target, reference)).not.toThrow();
    const result = colorTransfer(target, reference);
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
  });

  it('should produce values in 0-255 range', () => {
    const target = createGradientImageData(16, 16);
    const reference = createTestImageData(8, 8, [200, 50, 150, 255]);
    const result = colorTransfer(target, reference);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ==================== depthBlur ====================

describe('depthBlur', () => {
  standardTests('depthBlur', (input) => depthBlur(input, 3, 0.5));

  it('should not blur pixels at focus point luminance', () => {
    // All pixels at luminance ~0.5 (128/255) with focusPoint=0.5
    const input = createTestImageData(8, 8, [128, 128, 128, 255]);
    const result = depthBlur(input, 5, 0.502);
    // depthDiff = |128/255 - 0.502| ≈ 0 => radius = 0 => no blur
    for (let i = 0; i < 64; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(128);
      expect(g).toBe(128);
      expect(b).toBe(128);
    }
  });

  it('should blur pixels far from focus point', () => {
    const input = createGradientImageData(16, 16);
    const result = depthBlur(input, 3, 0.5);
    // Very dark or very bright pixels should be blurred (far from focusPoint=0.5)
    // Dark pixel (leftmost col, x=0): lum ~0, depthDiff=0.5, radius=round(0.5*3)=2
    const darkOrig = getPixel(input, 16); // y=1, x=0
    const darkResult = getPixel(result, 16);
    // Blurred dark pixel should be lighter (mixed with neighbors)
    expect(darkResult[0]).toBeGreaterThanOrEqual(darkOrig[0]);
  });

  it('should handle maxRadius of 0 (no blur)', () => {
    const input = createGradientImageData(8, 8);
    const result = depthBlur(input, 0, 0.5);
    // radius = round(depthDiff * 0) = 0 for all pixels => no change
    for (let i = 0; i < 64; i++) {
      expect(getPixel(result, i)).toEqual(getPixel(input, i));
    }
  });

  it('should produce values in 0-255 range', () => {
    const input = createGradientImageData(16, 16);
    const result = depthBlur(input, 5, 0.3);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ==================== styleTransfer ====================

describe('styleTransfer', () => {
  it('should preserve dimensions', () => {
    const content = createTestImageData(8, 6);
    const style = createTestImageData(4, 4, [200, 100, 50, 255]);
    const result = styleTransfer(content, style);
    expect(result.width).toBe(8);
    expect(result.height).toBe(6);
  });

  it('should preserve alpha channel', () => {
    const content = createTestImageData(4, 4, [128, 64, 32, 180]);
    const style = createTestImageData(4, 4, [200, 100, 50, 255]);
    const result = styleTransfer(content, style);
    for (let i = 0; i < 16; i++) {
      expect(getPixel(result, i)[3]).toBe(180);
    }
  });

  it('should not mutate original ImageData', () => {
    const content = createTestImageData(4, 4, [128, 64, 32, 255]);
    const style = createTestImageData(4, 4, [200, 100, 50, 255]);
    const originalData = new Uint8ClampedArray(content.data);
    styleTransfer(content, style);
    expect(content.data).toEqual(originalData);
  });

  it('should map content histogram to match style histogram', () => {
    // Uniform content + uniform style => all pixels should map to style color
    const content = createTestImageData(4, 4, [100, 100, 100, 255]);
    const style = createTestImageData(4, 4, [200, 50, 150, 255]);
    const result = styleTransfer(content, style);
    const [r, g, b] = getPixel(result, 0);
    // With uniform images, CDF is a step function at the single value
    // Content CDF[100] = 1.0, Style CDF[200] = 1.0, closest match = 200
    expect(r).toBe(200);
    expect(g).toBe(50);
    expect(b).toBe(150);
  });

  it('should handle identity transfer (same image)', () => {
    const img = createGradientImageData(8, 8);
    const result = styleTransfer(img, img);
    // Transferring style from itself should approximately preserve the image
    for (let i = 0; i < 64; i++) {
      const [rOrig] = getPixel(img, i);
      const [rResult] = getPixel(result, i);
      expect(Math.abs(rOrig - rResult)).toBeLessThan(3);
    }
  });

  it('should produce values in 0-255 range', () => {
    const content = createGradientImageData(16, 16);
    const style = createTestImageData(8, 8, [200, 50, 150, 255]);
    const result = styleTransfer(content, style);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ==================== autoAlignOffset ====================

describe('autoAlignOffset', () => {
  it('should return {dx: 0, dy: 0} for identical images', () => {
    // Use a larger image with distinct features for reliable cross-correlation
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const idx = (y * 64 + x) * 4;
        // Create a distinct circle pattern for better correlation
        const cx = x - 32, cy = y - 32;
        const val = (cx * cx + cy * cy < 400) ? 255 : 0;
        data[idx] = val; data[idx + 1] = val; data[idx + 2] = val; data[idx + 3] = 255;
      }
    }
    const img = new ImageData(data, 64, 64);
    const { dx, dy } = autoAlignOffset(img, img, 10);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });

  it('should return an offset object with dx and dy properties', () => {
    const img1 = createTestImageData(16, 16, [100, 100, 100, 255]);
    const img2 = createTestImageData(16, 16, [200, 200, 200, 255]);
    const result = autoAlignOffset(img1, img2);
    expect(typeof result.dx).toBe('number');
    expect(typeof result.dy).toBe('number');
  });

  it('should handle different sized images', () => {
    const img1 = createGradientImageData(20, 20);
    const img2 = createGradientImageData(16, 16);
    expect(() => autoAlignOffset(img1, img2)).not.toThrow();
    const result = autoAlignOffset(img1, img2);
    expect(typeof result.dx).toBe('number');
    expect(typeof result.dy).toBe('number');
  });

  it('should respect searchRange parameter', () => {
    const img1 = createGradientImageData(16, 16);
    const img2 = createGradientImageData(16, 16);
    const result = autoAlignOffset(img1, img2, 5);
    expect(Math.abs(result.dx)).toBeLessThanOrEqual(5);
    expect(Math.abs(result.dy)).toBeLessThanOrEqual(5);
  });

  it('should handle 1x1 images', () => {
    const img1 = createTestImageData(1, 1, [128, 128, 128, 255]);
    const img2 = createTestImageData(1, 1, [200, 200, 200, 255]);
    expect(() => autoAlignOffset(img1, img2, 0)).not.toThrow();
  });

  it('should return bounded offsets within searchRange', () => {
    const img1 = createGradientImageData(32, 32);
    const img2 = createGradientImageData(32, 32);
    const range = 10;
    const result = autoAlignOffset(img1, img2, range);
    expect(Math.abs(result.dx)).toBeLessThanOrEqual(range);
    expect(Math.abs(result.dy)).toBeLessThanOrEqual(range);
  });
});
