/**
 * Phase 8 Filters Tests — Texture (6) + Brush Strokes (8)
 */
import { describe, it, expect } from 'vitest';
import {
  grain,
  mosaicTiles,
  patchwork,
  stainedGlass,
  texturizer,
  craquelure,
  accentedEdges,
  angledStrokes,
  crosshatch,
  darkStrokes,
  inkOutlines,
  spatter,
  sprayedStrokes,
  sumie,
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

// ==================== Texture Filters ====================

describe('Phase 8 Texture Filters', () => {
  standardTests('grain', grain, [40, 50, 'regular']);
  describe('grain types', () => {
    const types = ['regular', 'soft', 'sprinkle', 'clumped', 'contrasty', 'enlarged', 'stippled', 'horizontal', 'vertical', 'speckle'] as const;
    for (const t of types) {
      it(`should support grain type: ${t}`, () => {
        const img = createTestImageData();
        const result = grain(img, 40, 50, t);
        expect(result.width).toBe(img.width);
      });
    }
  });

  standardTests('mosaicTiles', mosaicTiles, [5, 1, 10]);
  standardTests('patchwork', patchwork, [5, 3]);
  standardTests('stainedGlass', stainedGlass, [8, 2, 3]);
  standardTests('texturizer', texturizer, ['canvas', 100, 4, 'top']);

  describe('texturizer types', () => {
    for (const t of ['brick', 'burlap', 'canvas', 'sandstone'] as const) {
      it(`should support texture: ${t}`, () => {
        const img = createTestImageData(20, 20);
        const result = texturizer(img, t);
        expect(result.width).toBe(20);
      });
    }
  });

  standardTests('craquelure', craquelure, [15, 6, 9]);
});

// ==================== Brush Strokes Filters ====================

describe('Phase 8 Brush Strokes Filters', () => {
  standardTests('accentedEdges', accentedEdges, [2, 38, 5]);
  standardTests('angledStrokes', angledStrokes, [50, 15, 3]);
  standardTests('crosshatch', crosshatch, [9, 6, 1]);
  standardTests('darkStrokes', darkStrokes, [5, 3, 1]);
  standardTests('inkOutlines', inkOutlines, [4, 20, 10]);
  standardTests('spatter', spatter, [10, 5]);
  standardTests('sprayedStrokes', sprayedStrokes, [12, 7, 'rightDiagonal']);

  describe('sprayedStrokes directions', () => {
    for (const dir of ['rightDiagonal', 'horizontal', 'leftDiagonal', 'vertical'] as const) {
      it(`should support direction: ${dir}`, () => {
        const img = createTestImageData();
        const result = sprayedStrokes(img, 12, 7, dir);
        expect(result.width).toBe(img.width);
      });
    }
  });

  standardTests('sumie', sumie, [3, 2, 16]);
});
