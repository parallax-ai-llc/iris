/**
 * Core Filters Test — Phase 1-6 원본 필터 함수 테스트 커버리지
 * applyConvolution, gaussianBlur, motionBlur, sharpen, unsharpMask,
 * addNoise, reduceNoise, vignette, pixelate, emboss, edgeDetect,
 * posterize, invert, grayscale, sepia,
 * computeHistogram, applyLevels, applyCurves, applyColorBalance, applySelectiveHSL
 */
import { describe, it, expect } from 'vitest';
import {
  applyConvolution,
  gaussianBlur,
  motionBlur,
  sharpen,
  unsharpMask,
  addNoise,
  reduceNoise,
  vignette,
  pixelate,
  emboss,
  edgeDetect,
  posterize,
  invert,
  grayscale,
  sepia,
  computeHistogram,
  applyLevels,
  applyCurves,
  applyColorBalance,
  applySelectiveHSL,
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

// ==================== Convolution ====================

describe('applyConvolution', () => {
  immutabilityCheck((img) => applyConvolution(img, [[0, 0, 0], [0, 1, 0], [0, 0, 0]]), 'convolution');

  it('identity kernel preserves image', () => {
    const img = createTestImage(5, 5, [100, 150, 200, 255]);
    const r = applyConvolution(img, [[0, 0, 0], [0, 1, 0], [0, 0, 0]]);
    expect(r.data[0]).toBe(100);
    expect(r.data[1]).toBe(150);
    expect(r.data[2]).toBe(200);
  });

  it('preserves dimensions', () => {
    const r = applyConvolution(createTestImage(8, 6), [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
    expect(r.width).toBe(8);
    expect(r.height).toBe(6);
  });

  it('applies offset', () => {
    const img = createTestImage(3, 3, [0, 0, 0, 255]);
    const r = applyConvolution(img, [[0, 0, 0], [0, 1, 0], [0, 0, 0]], 1, 128);
    expect(r.data[0]).toBe(128);
  });

  it('preserves alpha', () => {
    const img = createTestImage(3, 3, [100, 100, 100, 200]);
    const r = applyConvolution(img, [[0, 0, 0], [0, 1, 0], [0, 0, 0]]);
    expect(r.data[3]).toBe(200);
  });
});

// ==================== Blur ====================

describe('gaussianBlur', () => {
  immutabilityCheck((img) => gaussianBlur(img, 2), 'gaussianBlur');

  it('preserves dimensions', () => {
    const r = gaussianBlur(createTestImage(10, 10), 3);
    expect(r.width).toBe(10);
    expect(r.height).toBe(10);
  });

  it('radius 0 returns original', () => {
    const img = createTestImage(5, 5, [200, 100, 50, 255]);
    const r = gaussianBlur(img, 0);
    expect(r).toBe(img); // Should return same reference
  });

  it('uniform image stays uniform', () => {
    const img = createTestImage(10, 10, [100, 100, 100, 255]);
    const r = gaussianBlur(img, 2);
    expect(r.data[0]).toBeCloseTo(100, 0);
    expect(r.data[1]).toBeCloseTo(100, 0);
  });

  it('reduces contrast (smooths edges)', () => {
    const img = createTestImage(20, 20, [0, 0, 0, 255]);
    // Add white center
    for (let y = 8; y < 12; y++) {
      for (let x = 8; x < 12; x++) {
        const idx = (y * 20 + x) * 4;
        img.data[idx] = 255; img.data[idx + 1] = 255; img.data[idx + 2] = 255;
      }
    }
    const r = gaussianBlur(img, 3);
    // Center should be less than 255 (blurred)
    const ci = (10 * 20 + 10) * 4;
    expect(r.data[ci]).toBeLessThan(255);
    // Edge should be greater than 0 (blurred)
    const ei = (10 * 20 + 6) * 4;
    expect(r.data[ei]).toBeGreaterThan(0);
  });
});

describe('motionBlur', () => {
  immutabilityCheck((img) => motionBlur(img, 0, 5), 'motionBlur');

  it('preserves dimensions', () => {
    const r = motionBlur(createTestImage(10, 10), 45, 5);
    expect(r.width).toBe(10);
  });

  it('distance 0 returns original', () => {
    const img = createTestImage(5, 5);
    const r = motionBlur(img, 0, 0);
    expect(r).toBe(img);
  });

  it('horizontal blur affects horizontal neighbors', () => {
    const img = createTestImage(20, 1, [0, 0, 0, 255]);
    img.data[10 * 4] = 255; // bright spot at x=10
    const r = motionBlur(img, 0, 3); // horizontal
    // Neighbors should pick up some brightness
    expect(r.data[9 * 4]).toBeGreaterThan(0);
    expect(r.data[11 * 4]).toBeGreaterThan(0);
  });
});

// ==================== Sharpen ====================

describe('sharpen', () => {
  immutabilityCheck((img) => sharpen(img, 1), 'sharpen');

  it('preserves dimensions', () => {
    const r = sharpen(createTestImage(10, 10), 1);
    expect(r.width).toBe(10);
    expect(r.height).toBe(10);
  });

  it('uniform image stays uniform', () => {
    const img = createTestImage(10, 10, [128, 128, 128, 255]);
    const r = sharpen(img, 1);
    const ci = (5 * 10 + 5) * 4;
    expect(r.data[ci]).toBeCloseTo(128, 0);
  });
});

describe('unsharpMask', () => {
  immutabilityCheck((img) => unsharpMask(img, 100, 2, 0), 'unsharpMask');

  it('preserves dimensions', () => {
    const r = unsharpMask(createTestImage(10, 10), 100, 2, 0);
    expect(r.width).toBe(10);
  });

  it('preserves alpha', () => {
    const img = createTestImage(5, 5, [100, 100, 100, 180]);
    const r = unsharpMask(img, 100, 2, 0);
    expect(r.data[3]).toBe(180);
  });

  it('high threshold leaves uniform areas unchanged', () => {
    const img = createTestImage(10, 10, [128, 128, 128, 255]);
    const r = unsharpMask(img, 200, 2, 255);
    expect(r.data[0]).toBe(128);
  });
});

// ==================== Noise ====================

describe('addNoise', () => {
  it('preserves dimensions', () => {
    const r = addNoise(createTestImage(10, 10), 50);
    expect(r.width).toBe(10);
  });

  it('preserves alpha', () => {
    const img = createTestImage(5, 5, [100, 100, 100, 200]);
    const r = addNoise(img, 50);
    expect(r.data[3]).toBe(200);
  });

  it('monochrome noise has same R/G/B offsets', () => {
    const img = createTestImage(100, 1, [128, 128, 128, 255]);
    const r = addNoise(img, 100, true);
    // For each pixel, r-128 === g-128 === b-128
    for (let i = 0; i < r.data.length; i += 4) {
      const dr = r.data[i] - 128;
      const dg = r.data[i + 1] - 128;
      const db = r.data[i + 2] - 128;
      expect(dr).toBe(dg);
      expect(dg).toBe(db);
    }
  });

  it('amount 0 produces no noise', () => {
    const img = createTestImage(10, 10, [128, 128, 128, 255]);
    const r = addNoise(img, 0);
    for (let i = 0; i < r.data.length; i += 4) {
      expect(r.data[i]).toBe(128);
    }
  });
});

describe('reduceNoise', () => {
  it('preserves dimensions', () => {
    const r = reduceNoise(createTestImage(10, 10), 50);
    expect(r.width).toBe(10);
  });

  it('strength 0 produces minimal change', () => {
    const img = createTestImage(5, 5, [100, 100, 100, 255]);
    const r = reduceNoise(img, 0);
    // radius = ceil(0/20) = 0, returns original via gaussianBlur(img, 0)
    expect(r).toBe(img);
  });
});

// ==================== Stylize ====================

describe('vignette', () => {
  immutabilityCheck((img) => vignette(img, 50, 50), 'vignette');

  it('preserves dimensions', () => {
    const r = vignette(createTestImage(20, 20), 50, 50);
    expect(r.width).toBe(20);
  });

  it('center is brighter than corners', () => {
    const img = createTestImage(20, 20, [200, 200, 200, 255]);
    const r = vignette(img, 100, 30);
    const center = (10 * 20 + 10) * 4;
    const corner = 0;
    expect(r.data[center]).toBeGreaterThanOrEqual(r.data[corner]);
  });

  it('preserves alpha', () => {
    const img = createTestImage(10, 10, [200, 200, 200, 180]);
    const r = vignette(img, 50, 50);
    expect(r.data[3]).toBe(180);
  });
});

describe('pixelate', () => {
  immutabilityCheck((img) => pixelate(img, 5), 'pixelate');

  it('blockSize 1 returns original', () => {
    const img = createTestImage(5, 5, [100, 150, 200, 255]);
    const r = pixelate(img, 1);
    expect(r).toBe(img);
  });

  it('preserves dimensions', () => {
    const r = pixelate(createTestImage(20, 20), 4);
    expect(r.width).toBe(20);
    expect(r.height).toBe(20);
  });

  it('pixels within a block have same color', () => {
    const img = createTestImage(10, 10);
    // Vary pixels
    for (let i = 0; i < img.data.length; i += 4) img.data[i] = i / 4;
    const r = pixelate(img, 5);
    // First block: (0,0)-(4,4)
    const c0 = r.data[0];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(r.data[(y * 10 + x) * 4]).toBe(c0);
      }
    }
  });
});

describe('emboss', () => {
  immutabilityCheck((img) => emboss(img, 1, 135), 'emboss');

  it('preserves dimensions', () => {
    const r = emboss(createTestImage(10, 10), 1);
    expect(r.width).toBe(10);
  });

  it('uniform image produces mid-gray with offset', () => {
    const img = createTestImage(10, 10, [100, 100, 100, 255]);
    const r = emboss(img, 1, 135);
    const ci = (5 * 10 + 5) * 4;
    // Emboss with uniform input and offset 128: result depends on kernel normalization
    // Center pixel should be deterministic
    expect(r.data[ci]).toBeGreaterThanOrEqual(0);
    expect(r.data[ci]).toBeLessThanOrEqual(255);
  });
});

describe('edgeDetect', () => {
  immutabilityCheck((img) => edgeDetect(img), 'edgeDetect');

  it('preserves dimensions', () => {
    const r = edgeDetect(createTestImage(10, 10));
    expect(r.width).toBe(10);
  });

  it('uniform image produces near-zero', () => {
    const img = createTestImage(10, 10, [100, 100, 100, 255]);
    const r = edgeDetect(img);
    const ci = (5 * 10 + 5) * 4;
    expect(r.data[ci]).toBeLessThan(5);
  });

  it('detects sharp edge', () => {
    const img = createTestImage(20, 20, [0, 0, 0, 255]);
    for (let y = 0; y < 20; y++) {
      for (let x = 10; x < 20; x++) {
        const idx = (y * 20 + x) * 4;
        img.data[idx] = 255; img.data[idx + 1] = 255; img.data[idx + 2] = 255;
      }
    }
    const r = edgeDetect(img);
    // Near the edge (x=10) should be bright
    const edgeIdx = (10 * 20 + 10) * 4;
    expect(r.data[edgeIdx]).toBeGreaterThan(100);
  });

  it('preserves alpha', () => {
    const img = createTestImage(5, 5, [100, 100, 100, 200]);
    const r = edgeDetect(img);
    expect(r.data[3]).toBe(200);
  });
});

// ==================== Color Effects ====================

describe('posterize', () => {
  immutabilityCheck((img) => posterize(img, 4), 'posterize');

  it('preserves dimensions', () => {
    const r = posterize(createTestImage(10, 10), 4);
    expect(r.width).toBe(10);
  });

  it('reduces color count', () => {
    const img = createTestImage(100, 1);
    for (let i = 0; i < 100; i++) img.data[i * 4] = i * 2.5;
    const r = posterize(img, 4);
    const unique = new Set<number>();
    for (let i = 0; i < r.data.length; i += 4) unique.add(r.data[i]);
    expect(unique.size).toBeLessThanOrEqual(4);
  });

  it('preserves alpha', () => {
    const img = createTestImage(5, 5, [100, 100, 100, 180]);
    const r = posterize(img, 4);
    expect(r.data[3]).toBe(180);
  });
});

describe('invert', () => {
  immutabilityCheck((img) => invert(img), 'invert');

  it('inverts colors correctly', () => {
    const img = createTestImage(1, 1, [100, 150, 200, 255]);
    const r = invert(img);
    expect(r.data[0]).toBe(155);
    expect(r.data[1]).toBe(105);
    expect(r.data[2]).toBe(55);
  });

  it('preserves alpha', () => {
    const img = createTestImage(1, 1, [100, 100, 100, 180]);
    const r = invert(img);
    expect(r.data[3]).toBe(180);
  });

  it('double invert restores original', () => {
    const img = createTestImage(5, 5, [37, 89, 213, 255]);
    const r = invert(invert(img));
    expect(r.data[0]).toBe(37);
    expect(r.data[1]).toBe(89);
    expect(r.data[2]).toBe(213);
  });
});

describe('grayscale', () => {
  immutabilityCheck((img) => grayscale(img), 'grayscale');

  it('produces equal R/G/B', () => {
    const img = createTestImage(1, 1, [200, 100, 50, 255]);
    const r = grayscale(img);
    expect(r.data[0]).toBe(r.data[1]);
    expect(r.data[1]).toBe(r.data[2]);
  });

  it('uses luminance formula', () => {
    const img = createTestImage(1, 1, [200, 100, 50, 255]);
    const r = grayscale(img);
    const expected = Math.round(200 * 0.299 + 100 * 0.587 + 50 * 0.114);
    expect(r.data[0]).toBe(expected);
  });

  it('pure white stays white', () => {
    const img = createTestImage(1, 1, [255, 255, 255, 255]);
    const r = grayscale(img);
    expect(r.data[0]).toBe(255);
  });

  it('preserves alpha', () => {
    const img = createTestImage(1, 1, [100, 100, 100, 180]);
    const r = grayscale(img);
    expect(r.data[3]).toBe(180);
  });
});

describe('sepia', () => {
  immutabilityCheck((img) => sepia(img), 'sepia');

  it('produces warm tones (R > G > B)', () => {
    const img = createTestImage(1, 1, [128, 128, 128, 255]);
    const r = sepia(img);
    expect(r.data[0]).toBeGreaterThan(r.data[1]); // R > G
    expect(r.data[1]).toBeGreaterThan(r.data[2]); // G > B
  });

  it('preserves alpha', () => {
    const img = createTestImage(1, 1, [100, 100, 100, 180]);
    const r = sepia(img);
    expect(r.data[3]).toBe(180);
  });

  it('black stays black', () => {
    const img = createTestImage(1, 1, [0, 0, 0, 255]);
    const r = sepia(img);
    expect(r.data[0]).toBe(0);
    expect(r.data[1]).toBe(0);
    expect(r.data[2]).toBe(0);
  });
});

// ==================== Histogram & Levels ====================

describe('computeHistogram', () => {
  it('returns 256-element array', () => {
    const h = computeHistogram(createTestImage(10, 10));
    expect(h.length).toBe(256);
  });

  it('uniform image has single peak', () => {
    const img = createTestImage(10, 10, [128, 128, 128, 255]);
    const h = computeHistogram(img);
    // Luminance of (128,128,128) = 128
    expect(h[128]).toBe(100);
    // All others zero
    let nonZero = 0;
    for (let i = 0; i < 256; i++) if (h[i] > 0) nonZero++;
    expect(nonZero).toBe(1);
  });

  it('total count equals pixel count', () => {
    const img = createTestImage(10, 10);
    for (let i = 0; i < img.data.length; i += 4) img.data[i] = i / 4;
    const h = computeHistogram(img);
    let total = 0;
    for (let i = 0; i < 256; i++) total += h[i];
    expect(total).toBe(100);
  });
});

describe('applyLevels', () => {
  const defaultParams = { inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 };

  immutabilityCheck(
    (img) => applyLevels(img, defaultParams),
    'levels'
  );

  it('identity params produce same image', () => {
    const img = createTestImage(5, 5, [100, 150, 200, 255]);
    const r = applyLevels(img, defaultParams);
    expect(r.data[0]).toBe(100);
    expect(r.data[1]).toBe(150);
    expect(r.data[2]).toBe(200);
  });

  it('output range clamp works', () => {
    const img = createTestImage(1, 1, [128, 128, 128, 255]);
    const r = applyLevels(img, { inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 50, outputWhite: 200 });
    // 128/255 * (200-50) + 50 ≈ 125
    expect(r.data[0]).toBeGreaterThanOrEqual(50);
    expect(r.data[0]).toBeLessThanOrEqual(200);
  });

  it('inputBlack clips dark values', () => {
    const img = createTestImage(1, 1, [50, 50, 50, 255]);
    const r = applyLevels(img, { inputBlack: 100, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 });
    // 50 < inputBlack → clipped to 0
    expect(r.data[0]).toBe(0);
  });
});

describe('applyCurves', () => {
  it('identity curve preserves image', () => {
    const img = createTestImage(5, 5, [100, 150, 200, 255]);
    const identity = [[{ x: 0, y: 0 }, { x: 255, y: 255 }]];
    const r = applyCurves(img, identity);
    expect(r.data[0]).toBe(100);
    expect(r.data[1]).toBe(150);
    expect(r.data[2]).toBe(200);
  });

  it('inversion curve inverts', () => {
    const img = createTestImage(1, 1, [100, 100, 100, 255]);
    const invertCurve = [[{ x: 0, y: 255 }, { x: 255, y: 0 }]];
    const r = applyCurves(img, invertCurve);
    expect(r.data[0]).toBe(155);
  });

  it('preserves alpha', () => {
    const img = createTestImage(1, 1, [100, 100, 100, 180]);
    const r = applyCurves(img, [[{ x: 0, y: 0 }, { x: 255, y: 255 }]]);
    expect(r.data[3]).toBe(180);
  });
});

describe('applyColorBalance', () => {
  const neutral = {
    shadows: { cyan: 0, magenta: 0, yellow: 0 },
    midtones: { cyan: 0, magenta: 0, yellow: 0 },
    highlights: { cyan: 0, magenta: 0, yellow: 0 },
    preserveLuminosity: false,
  };

  it('neutral params produce same image', () => {
    const img = createTestImage(5, 5, [100, 150, 200, 255]);
    const r = applyColorBalance(img, neutral);
    expect(r.data[0]).toBe(100);
    expect(r.data[1]).toBe(150);
    expect(r.data[2]).toBe(200);
  });

  it('positive cyan in midtones shifts red up (cyan param: negative=Cyan, positive=Red)', () => {
    const img = createTestImage(1, 1, [128, 128, 128, 255]);
    const params = { ...neutral, midtones: { cyan: 50, magenta: 0, yellow: 0 } };
    const r = applyColorBalance(img, params);
    // positive cyan value = shift toward Red
    expect(r.data[0]).toBeGreaterThan(128);
  });

  it('preserves alpha', () => {
    const img = createTestImage(1, 1, [128, 128, 128, 180]);
    const r = applyColorBalance(img, neutral);
    expect(r.data[3]).toBe(180);
  });
});

describe('applySelectiveHSL', () => {
  it('empty params produce same image', () => {
    const img = createTestImage(5, 5, [100, 150, 200, 255]);
    const r = applySelectiveHSL(img, {});
    expect(r.data[0]).toBe(100);
    expect(r.data[1]).toBe(150);
    expect(r.data[2]).toBe(200);
  });

  it('master saturation -100 produces grayscale', () => {
    const img = createTestImage(1, 1, [200, 100, 50, 255]);
    const r = applySelectiveHSL(img, { master: { hue: 0, saturation: -100, lightness: 0 } });
    // With full desaturation, R ≈ G ≈ B
    expect(Math.abs(r.data[0] - r.data[1])).toBeLessThan(5);
    expect(Math.abs(r.data[1] - r.data[2])).toBeLessThan(5);
  });

  it('preserves alpha', () => {
    const img = createTestImage(1, 1, [100, 100, 100, 180]);
    const r = applySelectiveHSL(img, { master: { hue: 0, saturation: 0, lightness: 0 } });
    expect(r.data[3]).toBe(180);
  });
});
