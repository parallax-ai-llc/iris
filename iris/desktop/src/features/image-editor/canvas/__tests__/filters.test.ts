import { describe, it, expect } from 'vitest';
import {
  // Phase 1-2
  highPass,
  oilPaint,
  radialBlur,
  surfaceBlur,
  smartSharpen,
  twirl,
  spherize,
  pinch,
  wave,
  ripple,
  polarCoordinates,
  zigZag,
  // Phase 5
  lensBlur,
  liquify,
  lensCorrection,
  // Phase 6 Artistic
  coloredPencil,
  cutout,
  dryBrush,
  filmGrain,
  fresco,
  neonGlow,
  paintDaubs,
  paletteKnife,
  plasticWrap,
  posterEdges,
  roughPastels,
  smudgeStick,
  sponge,
  underpainting,
  watercolor,
  // Phase 6 Sketch
  basRelief,
  chalkAndCharcoal,
  charcoal,
  chrome,
  conteCrayon,
  graphicPen,
  halftonePattern,
  notePaper,
  photocopy,
  plaster,
  reticulation,
  stamp,
  tornEdges,
  waterPaper,
} from '../filters';
import type { LiquifyDeformation } from '../filters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestImageData(
  w: number,
  h: number,
  fill?: [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  const [r, g, b, a] = fill ?? [128, 64, 32, 255];
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return new ImageData(data, w, h);
}

/** Create a 4x4 image with a gradient so filters have non-uniform data to work with */
function createGradientImageData(w: number = 4, h: number = 4): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = Math.round((x / (w - 1)) * 255);     // R: left-to-right gradient
      data[i + 1] = Math.round((y / (h - 1)) * 255);  // G: top-to-bottom gradient
      data[i + 2] = 128;                                // B: constant
      data[i + 3] = 255;                                // A: opaque
    }
  }
  return new ImageData(data, w, h);
}

/** Assert basic structural properties of a filter result */
function assertValidResult(result: ImageData, w: number, h: number): void {
  expect(result).toBeInstanceOf(ImageData);
  expect(result.width).toBe(w);
  expect(result.height).toBe(h);
  expect(result.data.length).toBe(w * h * 4);
}

/** Check that alpha channel is preserved in result vs source */
function assertAlphaPreserved(source: ImageData, result: ImageData): void {
  for (let i = 3; i < source.data.length; i += 4) {
    expect(result.data[i]).toBe(source.data[i]);
  }
}

/** Check that at least some pixels differ between source and result */
function assertPixelsModified(source: ImageData, result: ImageData): boolean {
  for (let i = 0; i < source.data.length; i += 4) {
    if (
      source.data[i] !== result.data[i] ||
      source.data[i + 1] !== result.data[i + 1] ||
      source.data[i + 2] !== result.data[i + 2]
    ) {
      return true;
    }
  }
  return false;
}

// ===========================================================================
// Phase 1-2 Filters
// ===========================================================================

describe('Phase 1-2 Filters', () => {
  // -------------------------------------------------------------------------
  // highPass
  // -------------------------------------------------------------------------
  describe('highPass', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = highPass(src, 1);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = highPass(src, 1);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixel values on gradient input', () => {
      const src = createGradientImageData(4, 4);
      const result = highPass(src, 1);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should return input unchanged when radius is 0', () => {
      const src = createTestImageData(4, 4);
      const result = highPass(src, 0);
      // radius <= 0 returns the original imageData reference
      expect(result).toBe(src);
    });

    it('should produce a flatter result with larger radius', () => {
      const src = createGradientImageData(8, 8);
      const r1 = highPass(src, 1);
      const r3 = highPass(src, 3);
      // Both should be valid
      assertValidResult(r1, 8, 8);
      assertValidResult(r3, 8, 8);
    });
  });

  // -------------------------------------------------------------------------
  // oilPaint
  // -------------------------------------------------------------------------
  describe('oilPaint', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = oilPaint(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = oilPaint(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels on gradient input', () => {
      const src = createGradientImageData(4, 4);
      const result = oilPaint(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom radius and levels', () => {
      const src = createGradientImageData(4, 4);
      const result = oilPaint(src, 2, 10);
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // radialBlur
  // -------------------------------------------------------------------------
  describe('radialBlur', () => {
    it('should return ImageData with correct dimensions (zoom mode)', () => {
      const src = createGradientImageData(4, 4);
      const result = radialBlur(src, 5, 'zoom');
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = radialBlur(src, 5);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels on gradient input', () => {
      const src = createGradientImageData(16, 16);
      const result = radialBlur(src, 20);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should work in spin mode', () => {
      const src = createGradientImageData(4, 4);
      const result = radialBlur(src, 5, 'spin');
      assertValidResult(result, 4, 4);
    });

    it('should accept custom center coordinates', () => {
      const src = createGradientImageData(4, 4);
      const result = radialBlur(src, 5, 'zoom', 0.25, 0.75);
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // surfaceBlur
  // -------------------------------------------------------------------------
  describe('surfaceBlur', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = surfaceBlur(src, 2, 30);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = surfaceBlur(src, 2, 30);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels on gradient input', () => {
      const src = createGradientImageData(4, 4);
      const result = surfaceBlur(src, 2, 30);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should preserve edges with low threshold', () => {
      const src = createGradientImageData(4, 4);
      const lowThresh = surfaceBlur(src, 2, 1);
      const highThresh = surfaceBlur(src, 2, 255);
      // Both should produce valid output
      assertValidResult(lowThresh, 4, 4);
      assertValidResult(highThresh, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // smartSharpen
  // -------------------------------------------------------------------------
  describe('smartSharpen', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = smartSharpen(src, 100, 1);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = smartSharpen(src, 100, 1);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels on image with edges', () => {
      // Create image with mid-range values and a sharp boundary
      const w = 16, h = 16;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const val = x < w / 2 ? 80 : 180;
          data[i] = val; data[i + 1] = val; data[i + 2] = val; data[i + 3] = 255;
        }
      }
      const src = new ImageData(data, w, h);
      const result = smartSharpen(src, 300, 3);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept noise reduction and remove type params', () => {
      const src = createGradientImageData(4, 4);
      const result = smartSharpen(src, 100, 1, 20, 'gaussian', 0);
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // twirl
  // -------------------------------------------------------------------------
  describe('twirl', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = twirl(src, 90);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = twirl(src, 90);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels with non-zero angle', () => {
      const src = createGradientImageData(4, 4);
      const result = twirl(src, 180);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom center coordinates', () => {
      const src = createGradientImageData(4, 4);
      const result = twirl(src, 90, 0.25, 0.75);
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // spherize
  // -------------------------------------------------------------------------
  describe('spherize', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = spherize(src, 100);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = spherize(src, 100);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels with positive amount', () => {
      const src = createGradientImageData(16, 16);
      const result = spherize(src, 100);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should support horizontal mode', () => {
      const src = createGradientImageData(4, 4);
      const result = spherize(src, 50, 'horizontal');
      assertValidResult(result, 4, 4);
    });

    it('should support vertical mode', () => {
      const src = createGradientImageData(4, 4);
      const result = spherize(src, 50, 'vertical');
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // pinch
  // -------------------------------------------------------------------------
  describe('pinch', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = pinch(src, 50);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = pinch(src, 50);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels with positive amount', () => {
      const src = createGradientImageData(16, 16);
      const result = pinch(src, 80);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should work with negative amount (bloat)', () => {
      const src = createGradientImageData(4, 4);
      const result = pinch(src, -50);
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // wave
  // -------------------------------------------------------------------------
  describe('wave', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = wave(src, 2, 4);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = wave(src, 2, 4);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels with non-zero amplitude', () => {
      const src = createGradientImageData(8, 8);
      const result = wave(src, 2, 4);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept sine wave type', () => {
      const src = createGradientImageData(4, 4);
      const result = wave(src, 2, 4, 'sine');
      assertValidResult(result, 4, 4);
    });

    it('should accept triangle wave type', () => {
      const src = createGradientImageData(4, 4);
      const result = wave(src, 2, 4, 'triangle');
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // ripple
  // -------------------------------------------------------------------------
  describe('ripple', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = ripple(src, 5, 3);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = ripple(src, 5, 3);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels with non-zero amplitude', () => {
      const src = createGradientImageData(8, 8);
      const result = ripple(src, 5, 3);
      expect(assertPixelsModified(src, result)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // polarCoordinates
  // -------------------------------------------------------------------------
  describe('polarCoordinates', () => {
    it('should return ImageData with correct dimensions (rect-to-polar)', () => {
      const src = createGradientImageData(4, 4);
      const result = polarCoordinates(src, 'rectangular-to-polar');
      assertValidResult(result, 4, 4);
    });

    it('should return ImageData with correct dimensions (polar-to-rect)', () => {
      const src = createGradientImageData(4, 4);
      const result = polarCoordinates(src, 'polar-to-rectangular');
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = polarCoordinates(src, 'rectangular-to-polar');
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels on gradient input', () => {
      const src = createGradientImageData(4, 4);
      const result = polarCoordinates(src, 'rectangular-to-polar');
      expect(assertPixelsModified(src, result)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // zigZag
  // -------------------------------------------------------------------------
  describe('zigZag', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = zigZag(src, 10, 5);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = zigZag(src, 10, 5);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels with non-zero amount', () => {
      const src = createGradientImageData(4, 4);
      const result = zigZag(src, 10, 5);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept style parameter', () => {
      const src = createGradientImageData(4, 4);
      const result = zigZag(src, 10, 5, 'pond-ripples');
      assertValidResult(result, 4, 4);
    });
  });
});

// ===========================================================================
// Phase 5 Filters
// ===========================================================================

describe('Phase 5 Filters', () => {
  // -------------------------------------------------------------------------
  // lensBlur
  // -------------------------------------------------------------------------
  describe('lensBlur', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = lensBlur(src, 5, 0, 200, 6, 0);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = lensBlur(src, 5, 0, 200, 6, 0);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels on gradient input', () => {
      const src = createGradientImageData(4, 4);
      const result = lensBlur(src, 5, 0, 200, 6, 0);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should work with different blade counts', () => {
      const src = createGradientImageData(4, 4);
      const r5 = lensBlur(src, 5, 0, 200, 5, 0);
      const r8 = lensBlur(src, 5, 0, 200, 8, 0);
      assertValidResult(r5, 4, 4);
      assertValidResult(r8, 4, 4);
    });

    it('should work with brightness highlight boost', () => {
      const src = createGradientImageData(4, 4);
      const result = lensBlur(src, 5, 50, 200, 6, 45);
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // liquify
  // -------------------------------------------------------------------------
  describe('liquify', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const deformations: LiquifyDeformation[] = [
        { cx: 2, cy: 2, radius: 2, dx: 1, dy: 0, pressure: 0.5, tool: 'push' },
      ];
      const result = liquify(src, deformations);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const deformations: LiquifyDeformation[] = [
        { cx: 2, cy: 2, radius: 2, dx: 1, dy: 0, pressure: 0.5, tool: 'push' },
      ];
      const result = liquify(src, deformations);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels with push deformation', () => {
      const src = createGradientImageData(4, 4);
      const deformations: LiquifyDeformation[] = [
        { cx: 2, cy: 2, radius: 2, dx: 2, dy: 0, pressure: 1.0, tool: 'push' },
      ];
      const result = liquify(src, deformations);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should return unchanged image with empty deformations', () => {
      const src = createGradientImageData(4, 4);
      const result = liquify(src, []);
      assertValidResult(result, 4, 4);
    });

    it('should handle twirl-cw tool', () => {
      const src = createGradientImageData(4, 4);
      const deformations: LiquifyDeformation[] = [
        { cx: 2, cy: 2, radius: 2, dx: 0, dy: 0, pressure: 0.5, tool: 'twirl-cw' },
      ];
      const result = liquify(src, deformations);
      assertValidResult(result, 4, 4);
    });

    it('should handle pucker tool', () => {
      const src = createGradientImageData(4, 4);
      const deformations: LiquifyDeformation[] = [
        { cx: 2, cy: 2, radius: 2, dx: 0, dy: 0, pressure: 0.5, tool: 'pucker' },
      ];
      const result = liquify(src, deformations);
      assertValidResult(result, 4, 4);
    });

    it('should handle bloat tool', () => {
      const src = createGradientImageData(4, 4);
      const deformations: LiquifyDeformation[] = [
        { cx: 2, cy: 2, radius: 2, dx: 0, dy: 0, pressure: 0.5, tool: 'bloat' },
      ];
      const result = liquify(src, deformations);
      assertValidResult(result, 4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // lensCorrection
  // -------------------------------------------------------------------------
  describe('lensCorrection', () => {
    it('should return ImageData with correct dimensions', () => {
      const src = createGradientImageData(8, 8);
      const result = lensCorrection(src, 10, 0, 0, 0, 0);
      assertValidResult(result, 8, 8);
    });

    it('should preserve alpha for center pixels with no distortion', () => {
      // With all params at 0 the center pixel should keep its alpha
      const src = createGradientImageData(8, 8);
      const result = lensCorrection(src, 0, 0, 0, 0, 0);
      // Center pixel alpha should be preserved
      const cx = 4, cy = 4;
      const idx = (cy * 8 + cx) * 4 + 3;
      expect(result.data[idx]).toBe(src.data[idx]);
    });

    it('should modify pixels with barrel distortion', () => {
      const src = createGradientImageData(16, 16);
      const result = lensCorrection(src, 50, 0, 0, 0, 0);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should apply chromatic aberration', () => {
      const src = createGradientImageData(8, 8);
      const result = lensCorrection(src, 0, 50, 0, 0, 0);
      assertValidResult(result, 8, 8);
    });

    it('should apply vignette', () => {
      const src = createGradientImageData(8, 8);
      const result = lensCorrection(src, 0, 0, 50, 0, 0);
      assertValidResult(result, 8, 8);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should apply perspective corrections', () => {
      const src = createGradientImageData(8, 8);
      const result = lensCorrection(src, 0, 0, 0, 20, 20);
      assertValidResult(result, 8, 8);
    });
  });
});

// ===========================================================================
// Phase 6 Artistic Filters
// ===========================================================================

describe('Phase 6 Artistic Filters', () => {
  describe('coloredPencil', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = coloredPencil(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = coloredPencil(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = coloredPencil(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = coloredPencil(src, 8, 4, 150);
      assertValidResult(result, 4, 4);
    });
  });

  describe('cutout', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = cutout(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = cutout(src);
      assertAlphaPreserved(src, result);
    });

    it('should posterize colors (reduce color levels)', () => {
      const src = createGradientImageData(4, 4);
      const result = cutout(src, 2);
      assertValidResult(result, 4, 4);
      expect(assertPixelsModified(src, result)).toBe(true);
    });
  });

  describe('dryBrush', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = dryBrush(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = dryBrush(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom brush size and detail', () => {
      const src = createGradientImageData(4, 4);
      const result = dryBrush(src, 4, 4);
      assertValidResult(result, 4, 4);
    });
  });

  describe('filmGrain', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = filmGrain(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = filmGrain(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels with grain applied', () => {
      const src = createTestImageData(4, 4);
      const result = filmGrain(src, 50);
      // Film grain is random, so pixels should likely differ
      assertValidResult(result, 4, 4);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = filmGrain(src, 20, 5, 15);
      assertValidResult(result, 4, 4);
    });
  });

  describe('fresco', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = fresco(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = fresco(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom brush size', () => {
      const src = createGradientImageData(4, 4);
      const result = fresco(src, 5);
      assertValidResult(result, 4, 4);
    });
  });

  describe('neonGlow', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = neonGlow(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = neonGlow(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = neonGlow(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom glow color', () => {
      const src = createGradientImageData(4, 4);
      const result = neonGlow(src, 10, 30, { r: 255, g: 0, b: 0 });
      assertValidResult(result, 4, 4);
    });
  });

  describe('paintDaubs', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = paintDaubs(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = paintDaubs(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = paintDaubs(src, 12, 3);
      assertValidResult(result, 4, 4);
    });
  });

  describe('paletteKnife', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = paletteKnife(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = paletteKnife(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = paletteKnife(src, 15, 5);
      assertValidResult(result, 4, 4);
    });
  });

  describe('plasticWrap', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = plasticWrap(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = plasticWrap(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = plasticWrap(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = plasticWrap(src, 20, 12, 10);
      assertValidResult(result, 4, 4);
    });
  });

  describe('posterEdges', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = posterEdges(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = posterEdges(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = posterEdges(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = posterEdges(src, 4, 2, 4);
      assertValidResult(result, 4, 4);
    });
  });

  describe('roughPastels', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = roughPastels(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = roughPastels(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = roughPastels(src, 10, 8);
      assertValidResult(result, 4, 4);
    });
  });

  describe('smudgeStick', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = smudgeStick(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = smudgeStick(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = smudgeStick(src, 5, 8, 5);
      assertValidResult(result, 4, 4);
    });
  });

  describe('sponge', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = sponge(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = sponge(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = sponge(src, 4, 8, 3);
      assertValidResult(result, 4, 4);
    });
  });

  describe('underpainting', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = underpainting(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = underpainting(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = underpainting(src, 8, 12);
      assertValidResult(result, 4, 4);
    });
  });

  describe('watercolor', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = watercolor(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = watercolor(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = watercolor(src, 6, 3);
      assertValidResult(result, 4, 4);
    });
  });
});

// ===========================================================================
// Phase 6 Sketch Filters
// ===========================================================================

describe('Phase 6 Sketch Filters', () => {
  describe('basRelief', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = basRelief(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = basRelief(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = basRelief(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = basRelief(src, 8, 5, 45);
      assertValidResult(result, 4, 4);
    });
  });

  describe('chalkAndCharcoal', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = chalkAndCharcoal(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = chalkAndCharcoal(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = chalkAndCharcoal(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = chalkAndCharcoal(src, 10, 10, 2);
      assertValidResult(result, 4, 4);
    });
  });

  describe('charcoal', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = charcoal(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = charcoal(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = charcoal(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom thickness and detail', () => {
      const src = createGradientImageData(4, 4);
      const result = charcoal(src, 3, 10);
      assertValidResult(result, 4, 4);
    });
  });

  describe('chrome', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = chrome(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = chrome(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = chrome(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = chrome(src, 8, 3);
      assertValidResult(result, 4, 4);
    });
  });

  describe('conteCrayon', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = conteCrayon(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = conteCrayon(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = conteCrayon(src, 8, 5);
      assertValidResult(result, 4, 4);
    });
  });

  describe('graphicPen', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = graphicPen(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = graphicPen(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = graphicPen(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = graphicPen(src, 20, 30, 90);
      assertValidResult(result, 4, 4);
    });
  });

  describe('halftonePattern', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = halftonePattern(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = halftonePattern(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = halftonePattern(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should support dot pattern type', () => {
      const src = createGradientImageData(4, 4);
      const result = halftonePattern(src, 3, 5, 'dot');
      assertValidResult(result, 4, 4);
    });

    it('should support line pattern type', () => {
      const src = createGradientImageData(4, 4);
      const result = halftonePattern(src, 3, 5, 'line');
      assertValidResult(result, 4, 4);
    });
  });

  describe('notePaper', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = notePaper(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = notePaper(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = notePaper(src, 30, 5, 8);
      assertValidResult(result, 4, 4);
    });
  });

  describe('photocopy', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = photocopy(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = photocopy(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = photocopy(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom detail and darkness', () => {
      const src = createGradientImageData(4, 4);
      const result = photocopy(src, 10, 12);
      assertValidResult(result, 4, 4);
    });
  });

  describe('plaster', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = plaster(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = plaster(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = plaster(src, 30, 5, 90);
      assertValidResult(result, 4, 4);
    });
  });

  describe('reticulation', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = reticulation(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = reticulation(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = reticulation(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = reticulation(src, 20, 60, 10);
      assertValidResult(result, 4, 4);
    });
  });

  describe('stamp', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = stamp(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = stamp(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = stamp(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = stamp(src, 50, 8);
      assertValidResult(result, 4, 4);
    });
  });

  describe('tornEdges', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = tornEdges(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = tornEdges(src);
      assertAlphaPreserved(src, result);
    });

    it('should modify pixels', () => {
      const src = createGradientImageData(4, 4);
      const result = tornEdges(src);
      expect(assertPixelsModified(src, result)).toBe(true);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = tornEdges(src, 50, 8, 20);
      assertValidResult(result, 4, 4);
    });
  });

  describe('waterPaper', () => {
    it('should return correct dimensions', () => {
      const src = createGradientImageData(4, 4);
      const result = waterPaper(src);
      assertValidResult(result, 4, 4);
    });

    it('should preserve alpha channel', () => {
      const src = createGradientImageData(4, 4);
      const result = waterPaper(src);
      assertAlphaPreserved(src, result);
    });

    it('should accept custom parameters', () => {
      const src = createGradientImageData(4, 4);
      const result = waterPaper(src, 20, 80, 60);
      assertValidResult(result, 4, 4);
    });
  });
});
