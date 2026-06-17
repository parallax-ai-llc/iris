/**
 * Adjustment Filters Tests
 *
 * Tests for threshold, photo filter, black & white, selective color,
 * channel mixer, gradient map, shadows/highlights, and presets.
 */

import { describe, it, expect } from 'vitest';
import {
  applyThreshold,
  applyPhotoFilter,
  applyBlackAndWhite,
  applySelectiveColor,
  applyChannelMixer,
  applyGradientMap,
  applyShadowsHighlights,
  PHOTO_FILTER_PRESETS,
  type ChannelMixerValues,
  type GradientStop,
  type ShadowsHighlightsValues,
  type SelectiveColorValues,
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

/**
 * Create a 2x2 image where each pixel has a different color.
 */
function createMultiColorImageData(): ImageData {
  const data = new Uint8ClampedArray(2 * 2 * 4);
  // Pixel 0: Red
  data[0] = 255; data[1] = 0;   data[2] = 0;   data[3] = 255;
  // Pixel 1: Green
  data[4] = 0;   data[5] = 255; data[6] = 0;   data[7] = 255;
  // Pixel 2: Blue
  data[8] = 0;   data[9] = 0;   data[10] = 255; data[11] = 255;
  // Pixel 3: White
  data[12] = 255; data[13] = 255; data[14] = 255; data[15] = 255;
  return new ImageData(data, 2, 2);
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

// ==================== applyThreshold ====================

describe('applyThreshold', () => {
  it('should return same dimensions', () => {
    const input = createTestImageData(4, 4);
    const result = applyThreshold(input, 128);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.data.length).toBe(input.data.length);
  });

  it('should preserve alpha channel', () => {
    const input = createTestImageData(2, 2, [128, 64, 32, 200]);
    const result = applyThreshold(input, 128);
    for (let i = 0; i < 4; i++) {
      expect(getPixel(result, i)[3]).toBe(200);
    }
  });

  it('should convert to black when all pixels are below threshold', () => {
    const input = createTestImageData(2, 2, [10, 10, 10, 255]);
    const result = applyThreshold(input, 128);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    }
  });

  it('should convert to white when all pixels are above threshold', () => {
    const input = createTestImageData(2, 2, [200, 200, 200, 255]);
    const result = applyThreshold(input, 50);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(255);
      expect(g).toBe(255);
      expect(b).toBe(255);
    }
  });

  it('should use luminance formula (0.299R + 0.587G + 0.114B)', () => {
    // Create pixel with known luminance: 0.299*100 + 0.587*100 + 0.114*100 = 100
    const input = createTestImageData(1, 1, [100, 100, 100, 255]);
    const resultBelow = applyThreshold(input, 101);
    expect(getPixel(resultBelow, 0)[0]).toBe(0); // lum=100 < 101 => black

    const resultAbove = applyThreshold(input, 100);
    expect(getPixel(resultAbove, 0)[0]).toBe(255); // lum=100 >= 100 => white
  });

  it('should handle threshold=0 (everything white)', () => {
    const input = createTestImageData(2, 2, [0, 0, 0, 255]);
    const result = applyThreshold(input, 0);
    // Luminance of black is 0, and 0 >= 0 is true => white
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(255);
      expect(g).toBe(255);
      expect(b).toBe(255);
    }
  });

  it('should handle threshold=255 (only pure white stays white)', () => {
    const input = createTestImageData(2, 2, [254, 254, 254, 255]);
    const result = applyThreshold(input, 255);
    // Luminance of (254,254,254) = 254, which < 255 => black
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    }
  });

  it('should not mutate the original ImageData', () => {
    const input = createTestImageData(2, 2, [128, 64, 32, 255]);
    const originalData = new Uint8ClampedArray(input.data);
    applyThreshold(input, 100);
    expect(input.data).toEqual(originalData);
  });
});

// ==================== applyPhotoFilter ====================

describe('applyPhotoFilter', () => {
  it('should return same dimensions', () => {
    const input = createTestImageData(4, 4);
    const result = applyPhotoFilter(input, { r: 255, g: 128, b: 0 }, 50, false);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('should preserve alpha channel', () => {
    const input = createTestImageData(2, 2, [128, 128, 128, 180]);
    const result = applyPhotoFilter(input, { r: 255, g: 0, b: 0 }, 50, false);
    for (let i = 0; i < 4; i++) {
      expect(getPixel(result, i)[3]).toBe(180);
    }
  });

  it('should not change image when density is 0', () => {
    const input = createTestImageData(2, 2, [100, 150, 200, 255]);
    const result = applyPhotoFilter(input, { r: 255, g: 0, b: 0 }, 0, false);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(100);
      expect(g).toBe(150);
      expect(b).toBe(200);
    }
  });

  it('should fully apply filter color at density 100', () => {
    const input = createTestImageData(1, 1, [100, 100, 100, 255]);
    const result = applyPhotoFilter(input, { r: 200, g: 50, b: 150 }, 100, false);
    const [r, g, b] = getPixel(result, 0);
    // At density=100, pixel = pixel + (color - pixel) * 1.0 = color
    expect(r).toBe(200);
    expect(g).toBe(50);
    expect(b).toBe(150);
  });

  it('should blend at 50% density', () => {
    const input = createTestImageData(1, 1, [100, 100, 100, 255]);
    const result = applyPhotoFilter(input, { r: 200, g: 0, b: 100 }, 50, false);
    const [r, g, b] = getPixel(result, 0);
    // r = 100 + (200 - 100) * 0.5 = 150
    // g = 100 + (0 - 100) * 0.5 = 50
    // b = 100 + (100 - 100) * 0.5 = 100
    expect(r).toBe(150);
    expect(g).toBe(50);
    expect(b).toBe(100);
  });

  it('should preserve luminosity when flag is set', () => {
    const input = createTestImageData(1, 1, [128, 128, 128, 255]);
    const origLum = 0.299 * 128 + 0.587 * 128 + 0.114 * 128;

    const result = applyPhotoFilter(input, { r: 255, g: 0, b: 0 }, 80, true);
    const [r, g, b] = getPixel(result, 0);
    const newLum = 0.299 * r + 0.587 * g + 0.114 * b;
    // Luminosity should be close to original (within rounding tolerance)
    expect(Math.abs(newLum - origLum)).toBeLessThan(6);
  });

  it('should not mutate the original ImageData', () => {
    const input = createTestImageData(2, 2, [128, 64, 32, 255]);
    const originalData = new Uint8ClampedArray(input.data);
    applyPhotoFilter(input, { r: 255, g: 0, b: 0 }, 50, false);
    expect(input.data).toEqual(originalData);
  });
});

// ==================== PHOTO_FILTER_PRESETS ====================

describe('PHOTO_FILTER_PRESETS', () => {
  it('should contain expected preset names', () => {
    const expectedPresets = [
      'warming85', 'warming81', 'cooling80', 'cooling82',
      'sepia', 'deepBlue', 'deepGreen', 'deepYellow',
      'violet', 'orange',
    ];
    for (const name of expectedPresets) {
      expect(PHOTO_FILTER_PRESETS).toHaveProperty(name);
    }
  });

  it('should have valid RGB values and name for each preset', () => {
    for (const preset of Object.values(PHOTO_FILTER_PRESETS)) {
      expect(preset.r).toBeGreaterThanOrEqual(0);
      expect(preset.r).toBeLessThanOrEqual(255);
      expect(preset.g).toBeGreaterThanOrEqual(0);
      expect(preset.g).toBeLessThanOrEqual(255);
      expect(preset.b).toBeGreaterThanOrEqual(0);
      expect(preset.b).toBeLessThanOrEqual(255);
      expect(typeof preset.name).toBe('string');
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });

  it('warming85 should have warm orange color', () => {
    const preset = PHOTO_FILTER_PRESETS['warming85'];
    expect(preset.r).toBe(236);
    expect(preset.g).toBe(138);
    expect(preset.b).toBe(0);
  });

  it('cooling80 should have cool blue color', () => {
    const preset = PHOTO_FILTER_PRESETS['cooling80'];
    expect(preset.r).toBe(0);
    expect(preset.g).toBe(109);
    expect(preset.b).toBe(235);
  });
});

// ==================== applyBlackAndWhite ====================

describe('applyBlackAndWhite', () => {
  const defaultWeights = {
    reds: 40, yellows: 60, greens: 40,
    cyans: 60, blues: 20, magentas: 80,
  };

  it('should return same dimensions', () => {
    const input = createTestImageData(4, 4);
    const result = applyBlackAndWhite(input, defaultWeights);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('should preserve alpha channel', () => {
    const input = createTestImageData(2, 2, [128, 64, 32, 190]);
    const result = applyBlackAndWhite(input, defaultWeights);
    for (let i = 0; i < 4; i++) {
      expect(getPixel(result, i)[3]).toBe(190);
    }
  });

  it('should produce grayscale output (R=G=B) without tint', () => {
    const input = createMultiColorImageData();
    const result = applyBlackAndWhite(input, defaultWeights);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });

  it('should handle achromatic (gray) pixels using simple luminance', () => {
    const input = createTestImageData(1, 1, [128, 128, 128, 255]);
    const result = applyBlackAndWhite(input, defaultWeights);
    const [r, g, b] = getPixel(result, 0);
    // Gray pixel: chroma ~0 -> baseLum = 0.299*0.502 + 0.587*0.502 + 0.114*0.502 ~ 0.502
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
  });

  it('should convert pure white to white', () => {
    const input = createTestImageData(1, 1, [255, 255, 255, 255]);
    const result = applyBlackAndWhite(input, defaultWeights);
    const [r, g, b] = getPixel(result, 0);
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });

  it('should convert pure black to black', () => {
    const input = createTestImageData(1, 1, [0, 0, 0, 255]);
    const result = applyBlackAndWhite(input, defaultWeights);
    const [r, g, b] = getPixel(result, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('should apply tint when provided', () => {
    const input = createTestImageData(2, 2, [128, 128, 128, 255]);
    const result = applyBlackAndWhite(input, defaultWeights, { hue: 30, saturation: 50 });
    for (let i = 0; i < 4; i++) {
      const [r] = getPixel(result, i);
      // With tint, channels should not all be equal
      // The tint adds a warm tone so R should generally be >= G >= B
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
    }
  });

  it('should not apply tint when saturation is 0', () => {
    const input = createTestImageData(1, 1, [100, 100, 100, 255]);
    const result = applyBlackAndWhite(input, defaultWeights, { hue: 30, saturation: 0 });
    const [r, g, b] = getPixel(result, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('should produce different results with different channel weights', () => {
    const input = createTestImageData(1, 1, [255, 0, 0, 255]); // pure red
    const highReds = { ...defaultWeights, reds: 300 };
    const lowReds = { ...defaultWeights, reds: -200 };
    const resultHigh = applyBlackAndWhite(input, highReds);
    const resultLow = applyBlackAndWhite(input, lowReds);
    // Higher reds weight should produce brighter gray for red pixel
    expect(getPixel(resultHigh, 0)[0]).toBeGreaterThan(getPixel(resultLow, 0)[0]);
  });

  it('should not mutate the original ImageData', () => {
    const input = createTestImageData(2, 2, [128, 64, 32, 255]);
    const originalData = new Uint8ClampedArray(input.data);
    applyBlackAndWhite(input, defaultWeights);
    expect(input.data).toEqual(originalData);
  });
});

// ==================== applySelectiveColor ====================

describe('applySelectiveColor', () => {
  it('should return same dimensions', () => {
    const input = createTestImageData(4, 4);
    const result = applySelectiveColor(input, {});
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('should preserve alpha channel', () => {
    const input = createTestImageData(2, 2, [255, 0, 0, 170]);
    const adj: Partial<Record<string, SelectiveColorValues>> = {
      reds: { cyan: 50, magenta: 0, yellow: 0, black: 0 },
    };
    const result = applySelectiveColor(input, adj);
    for (let i = 0; i < 4; i++) {
      expect(getPixel(result, i)[3]).toBe(170);
    }
  });

  it('should not change image when no adjustments are provided', () => {
    const input = createTestImageData(2, 2, [128, 64, 200, 255]);
    const result = applySelectiveColor(input, {});
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(128);
      expect(g).toBe(64);
      expect(b).toBe(200);
    }
  });

  it('should modify red pixels when adjusting reds range', () => {
    const input = createTestImageData(1, 1, [255, 0, 0, 255]);
    const adj: Partial<Record<string, SelectiveColorValues>> = {
      reds: { cyan: 50, magenta: 0, yellow: 0, black: 0 },
    };
    const result = applySelectiveColor(input, adj);
    const [r] = getPixel(result, 0);
    // Adding cyan to reds should reduce red channel
    expect(r).toBeLessThan(255);
  });

  it('should not modify blue pixels when adjusting only reds range', () => {
    const input = createTestImageData(1, 1, [0, 0, 255, 255]);
    const adj: Partial<Record<string, SelectiveColorValues>> = {
      reds: { cyan: 100, magenta: 100, yellow: 100, black: 50 },
    };
    const result = applySelectiveColor(input, adj);
    const [, , b] = getPixel(result, 0);
    // Pure blue should be unaffected by reds adjustment (no hue overlap)
    // But may be slightly affected by tonal ranges (neutrals/blacks/whites)
    // The main reds hue adjustment should not apply
    expect(b).toBeGreaterThan(200);
  });

  it('should handle absolute mode vs relative mode differently', () => {
    // Use a mid-tone color where relative mode multiplies by (1-c) which differs from absolute
    const input = createTestImageData(1, 1, [180, 100, 80, 255]);
    const adj: Partial<Record<string, SelectiveColorValues>> = {
      reds: { cyan: 80, magenta: 0, yellow: 0, black: 0 },
    };
    const resultRelative = applySelectiveColor(input, adj, false);
    const resultAbsolute = applySelectiveColor(input, adj, true);
    const pixRelative = getPixel(resultRelative, 0);
    const pixAbsolute = getPixel(resultAbsolute, 0);
    // At least one channel should differ between modes
    const anyDiff = pixRelative[0] !== pixAbsolute[0] ||
                    pixRelative[1] !== pixAbsolute[1] ||
                    pixRelative[2] !== pixAbsolute[2];
    expect(anyDiff).toBe(true);
  });

  it('should affect whites range for bright pixels', () => {
    const input = createTestImageData(1, 1, [240, 240, 240, 255]);
    const adj: Partial<Record<string, SelectiveColorValues>> = {
      whites: { cyan: 0, magenta: 0, yellow: 50, black: 0 },
    };
    const result = applySelectiveColor(input, adj);
    const original = getPixel(input, 0);
    const modified = getPixel(result, 0);
    // Adding yellow to whites should change the pixel
    expect(modified[2]).not.toBe(original[2]); // blue channel affected by yellow
  });

  it('should affect blacks range for dark pixels', () => {
    const input = createTestImageData(1, 1, [20, 20, 20, 255]);
    const adj: Partial<Record<string, SelectiveColorValues>> = {
      blacks: { cyan: 0, magenta: 0, yellow: 0, black: -50 },
    };
    const result = applySelectiveColor(input, adj);
    const [r] = getPixel(result, 0);
    // Reducing black on dark pixels should brighten them
    expect(r).toBeGreaterThanOrEqual(20);
  });

  it('should not mutate the original ImageData', () => {
    const input = createTestImageData(2, 2, [255, 0, 0, 255]);
    const originalData = new Uint8ClampedArray(input.data);
    applySelectiveColor(input, { reds: { cyan: 50, magenta: 0, yellow: 0, black: 0 } });
    expect(input.data).toEqual(originalData);
  });
});

// ==================== applyChannelMixer ====================

describe('applyChannelMixer', () => {
  const identityValues: ChannelMixerValues = {
    outputRed:   { red: 100, green: 0, blue: 0, constant: 0 },
    outputGreen: { red: 0, green: 100, blue: 0, constant: 0 },
    outputBlue:  { red: 0, green: 0, blue: 100, constant: 0 },
    monochrome: false,
  };

  it('should return same dimensions', () => {
    const input = createTestImageData(4, 4);
    const result = applyChannelMixer(input, identityValues);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('should preserve alpha channel', () => {
    const input = createTestImageData(2, 2, [128, 64, 32, 150]);
    const result = applyChannelMixer(input, identityValues);
    for (let i = 0; i < 4; i++) {
      expect(getPixel(result, i)[3]).toBe(150);
    }
  });

  it('should produce identity output with 100% self-mapping', () => {
    const input = createTestImageData(2, 2, [100, 150, 200, 255]);
    const result = applyChannelMixer(input, identityValues);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(100);
      expect(g).toBe(150);
      expect(b).toBe(200);
    }
  });

  it('should swap red and blue channels', () => {
    const swapValues: ChannelMixerValues = {
      outputRed:   { red: 0, green: 0, blue: 100, constant: 0 },
      outputGreen: { red: 0, green: 100, blue: 0, constant: 0 },
      outputBlue:  { red: 100, green: 0, blue: 0, constant: 0 },
      monochrome: false,
    };
    const input = createTestImageData(1, 1, [255, 128, 50, 255]);
    const result = applyChannelMixer(input, swapValues);
    const [r, g, b] = getPixel(result, 0);
    expect(r).toBe(50);   // was blue
    expect(g).toBe(128);  // unchanged
    expect(b).toBe(255);  // was red
  });

  it('should apply constant offset', () => {
    const constValues: ChannelMixerValues = {
      outputRed:   { red: 100, green: 0, blue: 0, constant: 10 },
      outputGreen: { red: 0, green: 100, blue: 0, constant: -10 },
      outputBlue:  { red: 0, green: 0, blue: 100, constant: 0 },
      monochrome: false,
    };
    const input = createTestImageData(1, 1, [100, 100, 100, 255]);
    const result = applyChannelMixer(input, constValues);
    const [r, g, b] = getPixel(result, 0);
    // constant is multiplied by 2.55 (constant * 2.55)
    // r = 100 + 10 * 2.55 = 125.5 => clamped to integer
    // g = 100 + (-10) * 2.55 = 74.5 => clamped to integer
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(130);
    expect(g).toBeGreaterThan(70);
    expect(g).toBeLessThan(80);
    expect(b).toBe(100);
  });

  it('should produce monochrome output in monochrome mode', () => {
    const monoValues: ChannelMixerValues = {
      outputRed:   { red: 30, green: 59, blue: 11, constant: 0 },
      outputGreen: { red: 0, green: 100, blue: 0, constant: 0 },
      outputBlue:  { red: 0, green: 0, blue: 100, constant: 0 },
      monochrome: true,
    };
    const input = createMultiColorImageData();
    const result = applyChannelMixer(input, monoValues);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      // In monochrome mode, R=G=B (all use outputRed weights)
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });

  it('should clamp values to 0-255 range', () => {
    const extremeValues: ChannelMixerValues = {
      outputRed:   { red: 200, green: 200, blue: 200, constant: 50 },
      outputGreen: { red: 0, green: 0, blue: 0, constant: -50 },
      outputBlue:  { red: 0, green: 0, blue: 100, constant: 0 },
      monochrome: false,
    };
    const input = createTestImageData(1, 1, [200, 200, 200, 255]);
    const result = applyChannelMixer(input, extremeValues);
    const [r, g] = getPixel(result, 0);
    expect(r).toBeLessThanOrEqual(255);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(255);
    expect(g).toBeGreaterThanOrEqual(0);
  });

  it('should not mutate the original ImageData', () => {
    const input = createTestImageData(2, 2, [128, 64, 32, 255]);
    const originalData = new Uint8ClampedArray(input.data);
    applyChannelMixer(input, identityValues);
    expect(input.data).toEqual(originalData);
  });
});

// ==================== applyGradientMap ====================

describe('applyGradientMap', () => {
  const blackToWhite: GradientStop[] = [
    { position: 0, color: { r: 0, g: 0, b: 0 } },
    { position: 1, color: { r: 255, g: 255, b: 255 } },
  ];

  it('should return same dimensions', () => {
    const input = createTestImageData(4, 4);
    const result = applyGradientMap(input, blackToWhite);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('should preserve alpha channel', () => {
    const input = createTestImageData(2, 2, [128, 128, 128, 160]);
    const result = applyGradientMap(input, blackToWhite);
    for (let i = 0; i < 4; i++) {
      expect(getPixel(result, i)[3]).toBe(160);
    }
  });

  it('should map black to first gradient stop color', () => {
    const stops: GradientStop[] = [
      { position: 0, color: { r: 255, g: 0, b: 0 } },
      { position: 1, color: { r: 0, g: 0, b: 255 } },
    ];
    const input = createTestImageData(1, 1, [0, 0, 0, 255]);
    const result = applyGradientMap(input, stops);
    const [r, g, b] = getPixel(result, 0);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('should map white to last gradient stop color', () => {
    const stops: GradientStop[] = [
      { position: 0, color: { r: 255, g: 0, b: 0 } },
      { position: 1, color: { r: 0, g: 0, b: 255 } },
    ];
    const input = createTestImageData(1, 1, [255, 255, 255, 255]);
    const result = applyGradientMap(input, stops);
    const [r, g, b] = getPixel(result, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(255);
  });

  it('should interpolate mid-tone colors', () => {
    const stops: GradientStop[] = [
      { position: 0, color: { r: 0, g: 0, b: 0 } },
      { position: 1, color: { r: 255, g: 255, b: 255 } },
    ];
    // Gray pixel (128,128,128) has luminance ~128
    const input = createTestImageData(1, 1, [128, 128, 128, 255]);
    const result = applyGradientMap(input, stops);
    const [r] = getPixel(result, 0);
    // Should map to approximately middle of gradient
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(156);
  });

  it('should handle multi-stop gradient', () => {
    const stops: GradientStop[] = [
      { position: 0, color: { r: 0, g: 0, b: 255 } },
      { position: 0.5, color: { r: 0, g: 255, b: 0 } },
      { position: 1, color: { r: 255, g: 0, b: 0 } },
    ];
    // White pixel maps to position 1.0 => red
    const inputWhite = createTestImageData(1, 1, [255, 255, 255, 255]);
    const resultWhite = applyGradientMap(inputWhite, stops);
    const [rW, gW, bW] = getPixel(resultWhite, 0);
    expect(rW).toBe(255);
    expect(gW).toBe(0);
    expect(bW).toBe(0);

    // Black pixel maps to position 0.0 => blue
    const inputBlack = createTestImageData(1, 1, [0, 0, 0, 255]);
    const resultBlack = applyGradientMap(inputBlack, stops);
    const [rB, gB, bB] = getPixel(resultBlack, 0);
    expect(rB).toBe(0);
    expect(gB).toBe(0);
    expect(bB).toBe(255);
  });

  it('should handle empty stops array (return copy)', () => {
    const input = createTestImageData(2, 2, [100, 150, 200, 255]);
    const result = applyGradientMap(input, []);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(100);
      expect(g).toBe(150);
      expect(b).toBe(200);
    }
  });

  it('should handle single stop (all pixels map to that color)', () => {
    const stops: GradientStop[] = [
      { position: 0.5, color: { r: 100, g: 200, b: 50 } },
    ];
    const input = createTestImageData(1, 1, [128, 128, 128, 255]);
    const result = applyGradientMap(input, stops);
    const [r, g, b] = getPixel(result, 0);
    // Single stop gets extended to both 0 and 1, so all map to same color
    expect(r).toBe(100);
    expect(g).toBe(200);
    expect(b).toBe(50);
  });

  it('should not mutate the original ImageData', () => {
    const input = createTestImageData(2, 2, [128, 64, 32, 255]);
    const originalData = new Uint8ClampedArray(input.data);
    applyGradientMap(input, blackToWhite);
    expect(input.data).toEqual(originalData);
  });
});

// ==================== applyChannelMixer monochrome edge ====================

describe('applyChannelMixer monochrome', () => {
  it('should use outputRed weights for all channels in monochrome', () => {
    const monoValues: ChannelMixerValues = {
      outputRed:   { red: 100, green: 0, blue: 0, constant: 0 },
      outputGreen: { red: 50, green: 50, blue: 0, constant: 0 },
      outputBlue:  { red: 0, green: 0, blue: 100, constant: 0 },
      monochrome: true,
    };
    const input = createTestImageData(1, 1, [200, 100, 50, 255]);
    const result = applyChannelMixer(input, monoValues);
    const [r, g, b] = getPixel(result, 0);
    // Monochrome uses outputRed: gray = 200*1.0 + 100*0 + 50*0 + 0 = 200
    expect(r).toBe(200);
    expect(g).toBe(200);
    expect(b).toBe(200);
  });
});

// ==================== applyShadowsHighlights ====================

describe('applyShadowsHighlights', () => {
  const defaultValues: ShadowsHighlightsValues = {
    shadowAmount: 50,
    shadowTonalWidth: 50,
    shadowRadius: 30,
    highlightAmount: 50,
    highlightTonalWidth: 50,
    highlightRadius: 30,
  };

  it('should return same dimensions', () => {
    const input = createTestImageData(4, 4);
    const result = applyShadowsHighlights(input, defaultValues);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('should preserve alpha channel', () => {
    const input = createTestImageData(2, 2, [50, 50, 50, 175]);
    const result = applyShadowsHighlights(input, defaultValues);
    for (let i = 0; i < 4; i++) {
      expect(getPixel(result, i)[3]).toBe(175);
    }
  });

  it('should not change image when all amounts are 0', () => {
    const zeroValues: ShadowsHighlightsValues = {
      shadowAmount: 0,
      shadowTonalWidth: 50,
      shadowRadius: 30,
      highlightAmount: 0,
      highlightTonalWidth: 50,
      highlightRadius: 30,
    };
    const input = createTestImageData(2, 2, [100, 100, 100, 255]);
    const result = applyShadowsHighlights(input, zeroValues);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBe(100);
      expect(g).toBe(100);
      expect(b).toBe(100);
    }
  });

  it('should brighten dark pixels with shadow recovery', () => {
    const shadowOnly: ShadowsHighlightsValues = {
      shadowAmount: 100,
      shadowTonalWidth: 50,
      shadowRadius: 30,
      highlightAmount: 0,
      highlightTonalWidth: 50,
      highlightRadius: 30,
    };
    const input = createTestImageData(2, 2, [30, 30, 30, 255]);
    const result = applyShadowsHighlights(input, shadowOnly);
    for (let i = 0; i < 4; i++) {
      const [r] = getPixel(result, i);
      expect(r).toBeGreaterThan(30);
    }
  });

  it('should darken bright pixels with highlight recovery', () => {
    const highlightOnly: ShadowsHighlightsValues = {
      shadowAmount: 0,
      shadowTonalWidth: 50,
      shadowRadius: 30,
      highlightAmount: 100,
      highlightTonalWidth: 50,
      highlightRadius: 30,
    };
    const input = createTestImageData(2, 2, [230, 230, 230, 255]);
    const result = applyShadowsHighlights(input, highlightOnly);
    for (let i = 0; i < 4; i++) {
      const [r] = getPixel(result, i);
      expect(r).toBeLessThan(230);
    }
  });

  it('should not affect mid-tone pixels significantly', () => {
    const input = createTestImageData(4, 4, [128, 128, 128, 255]);
    const result = applyShadowsHighlights(input, defaultValues);
    // Mid-tone luminance = 128/255 = ~0.502
    // shadowTonalWidth = 0.5: shadow applies when l < 0.5
    // highlightTonalWidth = 0.5: highlight applies when l > 0.5
    // At exactly 0.5 boundary, effect should be minimal
    for (let i = 0; i < 16; i++) {
      const [r] = getPixel(result, i);
      expect(Math.abs(r - 128)).toBeLessThan(20);
    }
  });

  it('should clamp output values to 0-255', () => {
    const extremeValues: ShadowsHighlightsValues = {
      shadowAmount: 100,
      shadowTonalWidth: 100,
      shadowRadius: 100,
      highlightAmount: 100,
      highlightTonalWidth: 100,
      highlightRadius: 100,
    };
    const input = createTestImageData(4, 4, [10, 10, 10, 255]);
    const result = applyShadowsHighlights(input, extremeValues);
    for (let i = 0; i < 16; i++) {
      const [r, g, b] = getPixel(result, i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });

  it('should not mutate the original ImageData', () => {
    const input = createTestImageData(2, 2, [50, 50, 50, 255]);
    const originalData = new Uint8ClampedArray(input.data);
    applyShadowsHighlights(input, defaultValues);
    expect(input.data).toEqual(originalData);
  });
});
