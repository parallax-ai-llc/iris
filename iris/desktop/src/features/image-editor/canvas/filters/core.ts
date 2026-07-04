/**
 * Shared filter primitives (convolution kernel, canvas application)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { createOffscreenCanvas } from '../canvasEngine';

/** Simple seeded Lehmer PRNG for deterministic noise/displacement. */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Apply a convolution kernel to an image
 */
export function applyConvolution(
  imageData: ImageData,
  kernel: number[][],
  divisor?: number,
  offset: number = 0
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const kSize = kernel.length;
  const kHalf = Math.floor(kSize / 2);

  // Calculate divisor if not provided
  const div = divisor ?? (kernel.flat().reduce((a, b) => a + b, 0) || 1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;

      for (let ky = 0; ky < kSize; ky++) {
        for (let kx = 0; kx < kSize; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx - kHalf));
          const py = Math.min(height - 1, Math.max(0, y + ky - kHalf));
          const idx = (py * width + px) * 4;
          const weight = kernel[ky][kx];

          r += data[idx] * weight;
          g += data[idx + 1] * weight;
          b += data[idx + 2] * weight;
        }
      }

      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = Math.min(255, Math.max(0, r / div + offset));
      resultData[dstIdx + 1] = Math.min(255, Math.max(0, g / div + offset));
      resultData[dstIdx + 2] = Math.min(255, Math.max(0, b / div + offset));
      resultData[dstIdx + 3] = data[dstIdx + 3]; // Preserve alpha
    }
  }

  return result;
}

/**
 * Apply filter to a canvas and return a new canvas
 */
export function applyFilterToCanvas(
  sourceCanvas: HTMLCanvasElement,
  filterFn: (imageData: ImageData) => ImageData
): HTMLCanvasElement {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get 2d context');

  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const filteredData = filterFn(imageData);

  const { canvas: result, ctx: resultCtx } = createOffscreenCanvas(
    sourceCanvas.width,
    sourceCanvas.height
  );
  resultCtx.putImageData(filteredData, 0, 0);

  return result;
}
