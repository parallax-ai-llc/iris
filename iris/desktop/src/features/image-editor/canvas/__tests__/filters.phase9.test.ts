/**
 * Phase 9 Filters Tests — Additional Blur (5) + Noise (3) + Distort (4)
 */
import { describe, it, expect } from 'vitest';
import {
  average,
  blurMore,
  boxBlur,
  shapeBlur,
  smartBlur,
  despeckle,
  dustAndScratches,
  median,
  diffuseGlow,
  glass,
  oceanRipple,
  displace,
} from '../filters';

function createTestImageData(width = 10, height = 10): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.floor(Math.random() * 256);
    data[i + 1] = Math.floor(Math.random() * 256);
    data[i + 2] = Math.floor(Math.random() * 256);
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 필터 함수들의 구체 파라미터 타입을 받기 위해 any 필요
function standardTests(name: string, fn: (img: ImageData, ...args: any[]) => ImageData, extraArgs: unknown[] = []) {
  describe(name, () => {
    it('should return correct dimensions', () => {
      const img = createTestImageData(8, 6);
      const result = fn(img, ...extraArgs);
      expect(result.width).toBe(8);
      expect(result.height).toBe(6);
    });
    it('should preserve alpha', () => {
      const img = createTestImageData(4, 4);
      const result = fn(img, ...extraArgs);
      expect(result.data[3]).toBeGreaterThan(0);
    });
    it('should not mutate input', () => {
      const img = createTestImageData(4, 4);
      const orig = new Uint8ClampedArray(img.data);
      fn(img, ...extraArgs);
      expect(img.data).toEqual(orig);
    });
  });
}

// ==================== Additional Blur Filters ====================

describe('Phase 9 Additional Blur Filters', () => {
  standardTests('average', average);
  standardTests('blurMore', blurMore);
  standardTests('boxBlur', boxBlur, [3]);

  standardTests('shapeBlur', shapeBlur, [3, 'circle']);
  describe('shapeBlur shapes', () => {
    for (const shape of ['circle', 'diamond', 'square'] as const) {
      it(`should support shape: ${shape}`, () => {
        const img = createTestImageData();
        const result = shapeBlur(img, 3, shape);
        expect(result.width).toBe(img.width);
      });
    }
  });

  standardTests('smartBlur', smartBlur, [3, 25, 1, 'normal']);
  describe('smartBlur modes', () => {
    for (const mode of ['normal', 'edgeOnly', 'overlayEdge'] as const) {
      it(`should support mode: ${mode}`, () => {
        const img = createTestImageData();
        const result = smartBlur(img, 3, 25, 1, mode);
        expect(result.width).toBe(img.width);
      });
    }
  });
});

// ==================== Additional Noise Filters ====================

describe('Phase 9 Additional Noise Filters', () => {
  standardTests('despeckle', despeckle);
  standardTests('dustAndScratches', dustAndScratches, [2, 5]);
  standardTests('median', median, [3]);
});

// ==================== Additional Distort Filters ====================

describe('Phase 9 Additional Distort Filters', () => {
  standardTests('diffuseGlow', diffuseGlow, [6, 10, 15]);

  standardTests('glass', glass, [5, 3, 'frosted']);
  describe('glass textures', () => {
    for (const tex of ['blocks', 'frosted', 'tinyLens'] as const) {
      it(`should support texture: ${tex}`, () => {
        const img = createTestImageData();
        const result = glass(img, 5, 3, tex);
        expect(result.width).toBe(img.width);
      });
    }
  });

  standardTests('oceanRipple', oceanRipple, [9, 6]);

  standardTests('displace', displace, [10, 10]);
  it('displace should accept a displacement map', () => {
    const img = createTestImageData(8, 8);
    const map = createTestImageData(8, 8);
    const result = displace(img, 10, 10, map);
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
  });
});
