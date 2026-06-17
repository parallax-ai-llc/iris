/**
 * Phase 11 Render Filters Tests — 7 procedural generation filters
 */
import { describe, it, expect } from 'vitest';
import {
  clouds,
  differenceClouds,
  fibers,
  lensFlare,
  lightingEffects,
  flame,
  tree,
} from '../filters';

function createTestImageData(width = 20, height = 20): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 필터 함수들의 구체 파라미터 타입을 받기 위해 any 필요
function standardTests(name: string, fn: (img: ImageData, ...args: any[]) => ImageData, extraArgs: unknown[] = []) {
  describe(name, () => {
    it('should return correct dimensions', () => {
      const img = createTestImageData(12, 8);
      const result = fn(img, ...extraArgs);
      expect(result.width).toBe(12);
      expect(result.height).toBe(8);
    });
    it('should produce non-zero output', () => {
      const img = createTestImageData(10, 10);
      const result = fn(img, ...extraArgs);
      let hasNonZero = false;
      for (let i = 0; i < result.data.length; i += 4) {
        if (result.data[i] > 0 || result.data[i + 1] > 0 || result.data[i + 2] > 0) {
          hasNonZero = true; break;
        }
      }
      expect(hasNonZero).toBe(true);
    });
    it('should not mutate input', () => {
      const img = createTestImageData(6, 6);
      const orig = new Uint8ClampedArray(img.data);
      fn(img, ...extraArgs);
      expect(img.data).toEqual(orig);
    });
  });
}

describe('Phase 11 Render Filters', () => {
  standardTests('clouds', clouds, [42, 32]);

  describe('clouds determinism', () => {
    it('should produce same output for same seed', () => {
      const img1 = createTestImageData(10, 10);
      const img2 = createTestImageData(10, 10);
      const r1 = clouds(img1, 123, 32);
      const r2 = clouds(img2, 123, 32);
      expect(r1.data).toEqual(r2.data);
    });

    it('should produce different output for different seed', () => {
      const img1 = createTestImageData(10, 10);
      const img2 = createTestImageData(10, 10);
      const r1 = clouds(img1, 1, 32);
      const r2 = clouds(img2, 999, 32);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) {
        if (r1.data[i] !== r2.data[i]) { same = false; break; }
      }
      expect(same).toBe(false);
    });
  });

  standardTests('differenceClouds', differenceClouds, [42, 32]);

  it('differenceClouds should blend with source', () => {
    const img = createTestImageData(10, 10);
    const result = differenceClouds(img, 42, 32);
    // Alpha should be preserved from source
    expect(result.data[3]).toBe(255);
  });

  standardTests('fibers', fibers, [16, 4, 42]);

  standardTests('lensFlare', lensFlare, [10, 10, 80, '50-300mm']);

  describe('lensFlare lens types', () => {
    for (const lens of ['50-300mm', '35mm', '105mm'] as const) {
      it(`should support lens type: ${lens}`, () => {
        const img = createTestImageData(20, 20);
        const result = lensFlare(img, 10, 10, 80, lens);
        expect(result.width).toBe(20);
      });
    }
  });

  standardTests('lightingEffects', lightingEffects, ['directional', -1, -1, 50, 30]);

  describe('lightingEffects types', () => {
    for (const type of ['directional', 'point', 'spot'] as const) {
      it(`should support light type: ${type}`, () => {
        const img = createTestImageData(20, 20);
        const result = lightingEffects(img, type, 10, 10, 60, 20);
        expect(result.width).toBe(20);
      });
    }
  });

  standardTests('flame', flame, [100, 42]);

  standardTests('tree', tree, [25, 6, 42]);

  describe('tree depth variations', () => {
    for (const depth of [3, 5, 7]) {
      it(`should render with depth ${depth}`, () => {
        const img = createTestImageData(30, 30);
        const result = tree(img, 25, depth, 42);
        expect(result.width).toBe(30);
        expect(result.height).toBe(30);
      });
    }
  });
});
