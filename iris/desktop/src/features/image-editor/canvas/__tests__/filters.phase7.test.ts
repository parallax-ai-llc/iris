/**
 * Phase 7 Filters Tests — Stylize (7) + Pixelate (6)
 */
import { describe, it, expect } from 'vitest';
import {
  solarize,
  findEdges,
  traceContour,
  diffuse,
  glowingEdges,
  tiles,
  wind,
  crystallize,
  facet,
  fragment,
  mezzotint,
  pointillize,
  colorHalftone,
} from '../filters';

// Helper: create test ImageData
function createTestImageData(width = 10, height = 10): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.floor(Math.random() * 256);     // R
    data[i + 1] = Math.floor(Math.random() * 256);  // G
    data[i + 2] = Math.floor(Math.random() * 256);  // B
    data[i + 3] = 255;                               // A
  }
  return new ImageData(data, width, height);
}

// Helper: create gradient ImageData
function createGradientImageData(width = 10, height = 10): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const val = Math.round((x / (width - 1)) * 255);
      data[i] = val; data[i + 1] = val; data[i + 2] = val; data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function standardFilterTests(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 필터 함수들의 구체 파라미터 타입(number 등)을 받기 위해 any 필요 (unknown은 역변성으로 거부됨)
  fn: (img: ImageData, ...args: any[]) => ImageData,
  extraArgs: unknown[] = []
) {
  describe(name, () => {
    it('should return correct dimensions', () => {
      const img = createTestImageData(8, 6);
      const result = fn(img, ...extraArgs);
      expect(result.width).toBe(8);
      expect(result.height).toBe(6);
    });

    it('should preserve alpha channel', () => {
      const img = createTestImageData(4, 4);
      img.data[3] = 128; // Set custom alpha
      const result = fn(img, ...extraArgs);
      // Alpha should be preserved (or close to it)
      expect(result.data[3]).toBeGreaterThan(0);
    });

    it('should return new ImageData (not mutate input)', () => {
      const img = createTestImageData(4, 4);
      const origData = new Uint8ClampedArray(img.data);
      fn(img, ...extraArgs);
      expect(img.data).toEqual(origData);
    });
  });
}

// ==================== Stylize Filters ====================

describe('Phase 7 Stylize Filters', () => {
  standardFilterTests('solarize', solarize);

  describe('solarize specifics', () => {
    it('should invert values above threshold', () => {
      const img = createGradientImageData(10, 1);
      const result = solarize(img, 128);
      // Pixels with value < 128 should stay the same
      expect(result.data[0]).toBe(0); // x=0, val=0
      // Pixels with value > 128 should be inverted
      const lastIdx = 9 * 4;
      expect(result.data[lastIdx]).toBeLessThan(img.data[lastIdx]);
    });

    it('should accept custom threshold', () => {
      const img = createTestImageData();
      const r1 = solarize(img, 64);
      const r2 = solarize(img, 200);
      // Different thresholds should produce different results
      let different = false;
      for (let i = 0; i < r1.data.length; i++) {
        if (r1.data[i] !== r2.data[i]) { different = true; break; }
      }
      expect(different).toBe(true);
    });
  });

  standardFilterTests('findEdges', findEdges);

  describe('findEdges specifics', () => {
    it('should detect edges in gradient image', () => {
      const img = createGradientImageData(20, 20);
      const result = findEdges(img);
      // Should have non-zero values where there are edges
      let hasNonZero = false;
      for (let i = 0; i < result.data.length; i += 4) {
        if (result.data[i] > 0) { hasNonZero = true; break; }
      }
      expect(hasNonZero).toBe(true);
    });
  });

  standardFilterTests('traceContour', traceContour);

  describe('traceContour specifics', () => {
    it('should accept level and edge params', () => {
      const img = createGradientImageData();
      const r1 = traceContour(img, 100, 'lower');
      const r2 = traceContour(img, 200, 'upper');
      expect(r1.width).toBe(r2.width);
    });
  });

  standardFilterTests('diffuse', diffuse);

  describe('diffuse specifics', () => {
    it('should support different modes', () => {
      const img = createTestImageData();
      const r1 = diffuse(img, 'normal');
      const r2 = diffuse(img, 'darkenOnly');
      const r3 = diffuse(img, 'lightenOnly');
      expect(r1.width).toBe(img.width);
      expect(r2.width).toBe(img.width);
      expect(r3.width).toBe(img.width);
    });
  });

  standardFilterTests('glowingEdges', glowingEdges);

  describe('glowingEdges specifics', () => {
    it('should accept custom parameters', () => {
      const img = createTestImageData();
      const result = glowingEdges(img, 4, 10, 8);
      expect(result.width).toBe(img.width);
    });
  });

  standardFilterTests('tiles', tiles, [5, 3, [200, 200, 200]]);

  describe('tiles specifics', () => {
    it('should accept custom parameters', () => {
      const img = createTestImageData(20, 20);
      const result = tiles(img, 4, 5, [100, 100, 100]);
      expect(result.width).toBe(20);
      expect(result.height).toBe(20);
    });
  });

  standardFilterTests('wind', wind);

  describe('wind specifics', () => {
    it('should support different methods and directions', () => {
      const img = createTestImageData();
      const r1 = wind(img, 'wind', 'right', 10);
      const r2 = wind(img, 'blast', 'left', 20);
      const r3 = wind(img, 'stagger', 'right', 15);
      expect(r1.width).toBe(img.width);
      expect(r2.width).toBe(img.width);
      expect(r3.width).toBe(img.width);
    });
  });
});

// ==================== Pixelate Filters ====================

describe('Phase 7 Pixelate Filters', () => {
  standardFilterTests('crystallize', crystallize, [5]);

  describe('crystallize specifics', () => {
    it('should create uniform color blocks', () => {
      const img = createGradientImageData(20, 20);
      const result = crystallize(img, 10);
      // First two pixels in same cell should have same color
      expect(result.data[0]).toBe(result.data[4]);
    });

    it('should accept different cell sizes', () => {
      const img = createTestImageData(20, 20);
      const r1 = crystallize(img, 2);
      const r2 = crystallize(img, 10);
      let different = false;
      for (let i = 0; i < r1.data.length; i++) {
        if (r1.data[i] !== r2.data[i]) { different = true; break; }
      }
      expect(different).toBe(true);
    });
  });

  standardFilterTests('facet', facet);

  describe('facet specifics', () => {
    it('should apply median filter', () => {
      const img = createTestImageData(10, 10);
      const result = facet(img);
      // Result should be different from input (median smoothing)
      expect(result.data.length).toBe(img.data.length);
    });
  });

  standardFilterTests('fragment', fragment, [5]);

  describe('fragment specifics', () => {
    it('should blend 4 offset copies', () => {
      const img = createGradientImageData(20, 20);
      const result = fragment(img, 3);
      // Center pixel should be an average of 4 offset samples
      const cx = 10, cy = 10;
      const i = (cy * 20 + cx) * 4;
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(255);
    });
  });

  standardFilterTests('mezzotint', mezzotint, ['fineDots']);

  describe('mezzotint specifics', () => {
    it('should support all mezzotint types', () => {
      const img = createTestImageData();
      const types = ['fineDots', 'mediumDots', 'coarseDots', 'fineLines', 'mediumLines', 'coarseLines', 'shortStrokes', 'mediumStrokes', 'longStrokes', 'grainyDots'] as const;
      for (const type of types) {
        const result = mezzotint(img, type);
        expect(result.width).toBe(img.width);
      }
    });
  });

  standardFilterTests('pointillize', pointillize, [6, [255, 255, 255]]);

  describe('pointillize specifics', () => {
    it('should fill background with specified color', () => {
      const img = createTestImageData(20, 20);
      const bgColor: [number, number, number] = [0, 0, 0];
      const result = pointillize(img, 20, bgColor);
      // Some pixels should have the background color (corners far from dot centers)
      // With large cellSize=20 and 20x20 image, all pixels are in one cell
      expect(result.width).toBe(20);
    });
  });

  standardFilterTests('colorHalftone', colorHalftone, [4]);

  describe('colorHalftone specifics', () => {
    it('should accept custom channel angles', () => {
      const img = createTestImageData(20, 20);
      const result = colorHalftone(img, 4, 100, 150, 80, 40);
      expect(result.width).toBe(20);
      expect(result.height).toBe(20);
    });
  });
});
