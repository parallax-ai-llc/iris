/**
 * Stylize filters
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { gaussianBlur } from './blur';
import { applyConvolution } from './core';
import type { GalleryFilter } from './types';

/**
 * Vignette effect
 */
export function vignette(
  imageData: ImageData,
  amount: number,
  size: number
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const sizeNorm = 1 - size / 100;
  const amountNorm = amount / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = dist / maxDist;

      // Calculate vignette factor
      const vignetteFactor = 1 - Math.pow(Math.max(0, normalizedDist - sizeNorm) / (1 - sizeNorm), 2) * amountNorm;

      const idx = (y * width + x) * 4;
      resultData[idx] = Math.round(data[idx] * vignetteFactor);
      resultData[idx + 1] = Math.round(data[idx + 1] * vignetteFactor);
      resultData[idx + 2] = Math.round(data[idx + 2] * vignetteFactor);
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

/**
 * Emboss effect
 */
export function emboss(
  imageData: ImageData,
  strength: number = 1,
  angle: number = 135
): ImageData {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const kernel = [
    [-strength * dx - strength * dy, -strength * dy, strength * dx - strength * dy],
    [-strength * dx, 1, strength * dx],
    [-strength * dx + strength * dy, strength * dy, strength * dx + strength * dy],
  ];

  return applyConvolution(imageData, kernel, 1, 128);
}

/**
 * Edge detection (Sobel operator)
 */
export function edgeDetect(imageData: ImageData): ImageData {
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];

  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  const gx = applyConvolution(imageData, sobelX, 1);
  const gy = applyConvolution(imageData, sobelY, 1);

  const result = new ImageData(imageData.width, imageData.height);
  const resultData = result.data;

  for (let i = 0; i < gx.data.length; i += 4) {
    const magnitude = Math.sqrt(
      gx.data[i] * gx.data[i] + gy.data[i] * gy.data[i]
    );
    resultData[i] = Math.min(255, magnitude);
    resultData[i + 1] = Math.min(255, magnitude);
    resultData[i + 2] = Math.min(255, magnitude);
    resultData[i + 3] = imageData.data[i + 3];
  }

  return result;
}

/**
 * Solarize — invert pixels above threshold
 * Simulates partial exposure of photographic film to light
 */
export function solarize(imageData: ImageData, threshold: number = 128): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < data.length; i += 4) {
    d[i] = data[i] > threshold ? 255 - data[i] : data[i];
    d[i + 1] = data[i + 1] > threshold ? 255 - data[i + 1] : data[i + 1];
    d[i + 2] = data[i + 2] > threshold ? 255 - data[i + 2] : data[i + 2];
    d[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Find Edges — Sobel edge detection
 * Applies horizontal and vertical Sobel 3x3 kernels and combines magnitude
 */
export function findEdges(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;

  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  const gx = applyConvolution(imageData, sobelX, 1);
  const gy = applyConvolution(imageData, sobelY, 1);

  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < data.length; i += 4) {
    const mr = Math.min(255, Math.sqrt(gx.data[i] * gx.data[i] + gy.data[i] * gy.data[i]));
    const mg = Math.min(255, Math.sqrt(gx.data[i + 1] * gx.data[i + 1] + gy.data[i + 1] * gy.data[i + 1]));
    const mb = Math.min(255, Math.sqrt(gx.data[i + 2] * gx.data[i + 2] + gy.data[i + 2] * gy.data[i + 2]));
    d[i] = mr;
    d[i + 1] = mg;
    d[i + 2] = mb;
    d[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Trace Contour — contour detection at a luminance threshold
 * Draws contour lines where pixel luminance crosses the given level
 */
export function traceContour(imageData: ImageData, level: number = 128, edge: 'lower' | 'upper' = 'lower'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  const getLum = (i: number) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = getLum(idx);
      let isContour = false;

      // Check 4-connected neighbors
      const neighbors = [
        x > 0 ? (y * width + x - 1) * 4 : -1,
        x < width - 1 ? (y * width + x + 1) * 4 : -1,
        y > 0 ? ((y - 1) * width + x) * 4 : -1,
        y < height - 1 ? ((y + 1) * width + x) * 4 : -1,
      ];

      for (const nIdx of neighbors) {
        if (nIdx < 0) continue;
        const nLum = getLum(nIdx);
        if (edge === 'lower') {
          // Contour where pixel is below level and neighbor is at or above
          if (lum < level && nLum >= level) {
            isContour = true;
            break;
          }
        } else {
          // Contour where pixel is above level and neighbor is at or below
          if (lum >= level && nLum < level) {
            isContour = true;
            break;
          }
        }
      }

      const val = isContour ? 255 : 0;
      d[idx] = val;
      d[idx + 1] = val;
      d[idx + 2] = val;
      d[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

/**
 * Diffuse — random pixel displacement
 * Modes: 'normal' (any swap), 'darkenOnly' (swap only if darker), 'lightenOnly' (swap only if lighter)
 */
export function diffuse(imageData: ImageData, mode: 'normal' | 'darkenOnly' | 'lightenOnly' = 'normal'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Copy source data first
  d.set(data);

  const radius = 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ox = x + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
      const oy = y + Math.floor(Math.random() * (radius * 2 + 1)) - radius;

      if (ox < 0 || ox >= width || oy < 0 || oy >= height) continue;

      const srcIdx = (oy * width + ox) * 4;
      const dstIdx = (y * width + x) * 4;

      const srcLum = data[srcIdx] * 0.299 + data[srcIdx + 1] * 0.587 + data[srcIdx + 2] * 0.114;
      const dstLum = data[dstIdx] * 0.299 + data[dstIdx + 1] * 0.587 + data[dstIdx + 2] * 0.114;

      if (mode === 'darkenOnly' && srcLum >= dstLum) continue;
      if (mode === 'lightenOnly' && srcLum <= dstLum) continue;

      d[dstIdx] = data[srcIdx];
      d[dstIdx + 1] = data[srcIdx + 1];
      d[dstIdx + 2] = data[srcIdx + 2];
      // Preserve original alpha
    }
  }

  return result;
}

/**
 * Glowing Edges — neon edge glow on black background
 * Finds edges, boosts brightness, and applies blur for glow effect
 */
export function glowingEdges(imageData: ImageData, edgeWidth: number = 2, edgeBrightness: number = 6, smoothness: number = 5): ImageData {
  const { width, height, data } = imageData;

  // Step 1: Edge detection with Sobel
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  const gx = applyConvolution(imageData, sobelX, 1);
  const gy = applyConvolution(imageData, sobelY, 1);

  // Step 2: Compute edge magnitude per channel with brightness boost
  const edges = new ImageData(width, height);
  const ed = edges.data;
  const brightnessFactor = edgeBrightness;

  for (let i = 0; i < data.length; i += 4) {
    const mr = Math.min(255, Math.sqrt(gx.data[i] * gx.data[i] + gy.data[i] * gy.data[i]) * brightnessFactor);
    const mg = Math.min(255, Math.sqrt(gx.data[i + 1] * gx.data[i + 1] + gy.data[i + 1] * gy.data[i + 1]) * brightnessFactor);
    const mb = Math.min(255, Math.sqrt(gx.data[i + 2] * gx.data[i + 2] + gy.data[i + 2] * gy.data[i + 2]) * brightnessFactor);
    ed[i] = mr;
    ed[i + 1] = mg;
    ed[i + 2] = mb;
    ed[i + 3] = data[i + 3];
  }

  // Step 3: Thicken edges by dilation
  let current = edges;
  for (let pass = 1; pass < edgeWidth; pass++) {
    const dilated = new ImageData(width, height);
    const dd = dilated.data;
    const cd = current.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let maxR = cd[idx], maxG = cd[idx + 1], maxB = cd[idx + 2];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const ni = (ny * width + nx) * 4;
              maxR = Math.max(maxR, cd[ni]);
              maxG = Math.max(maxG, cd[ni + 1]);
              maxB = Math.max(maxB, cd[ni + 2]);
            }
          }
        }
        dd[idx] = maxR;
        dd[idx + 1] = maxG;
        dd[idx + 2] = maxB;
        dd[idx + 3] = data[idx + 3];
      }
    }
    current = dilated;
  }

  // Step 4: Apply blur for glow
  if (smoothness > 0) {
    current = gaussianBlur(current, smoothness);
  }

  return current;
}

/**
 * Pixelate > Mosaic — block averaging (distinct from Mosaic Tiles texture)
 */
export function mosaic(imageData: ImageData, cellSize: number = 10): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const rd = result.data;
  const cs = Math.max(1, Math.round(cellSize));

  for (let by = 0; by < height; by += cs) {
    for (let bx = 0; bx < width; bx += cs) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let dy = 0; dy < cs && by + dy < height; dy++) {
        for (let dx = 0; dx < cs && bx + dx < width; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; a += data[idx + 3];
          count++;
        }
      }
      r = Math.round(r / count); g = Math.round(g / count);
      b = Math.round(b / count); a = Math.round(a / count);
      for (let dy = 0; dy < cs && by + dy < height; dy++) {
        for (let dx = 0; dx < cs && bx + dx < width; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          rd[idx] = r; rd[idx + 1] = g; rd[idx + 2] = b; rd[idx + 3] = a;
        }
      }
    }
  }
  return result;
}

/**
 * Filter Gallery registrations for this category module.
 * Add new gallery filters here, next to their implementation.
 */
export const stylizeGalleryFilters: GalleryFilter[] = [
  { id: 'emboss', label: "Emboss", category: 'stylize', apply: (d) => emboss(d) },
  { id: 'solarize', label: "Solarize", category: 'stylize', apply: (d) => solarize(d) },
  { id: 'findEdges', label: "Find Edges", category: 'stylize', apply: (d) => findEdges(d) },
  { id: 'traceContour', label: "Trace Contour", category: 'stylize', apply: (d) => traceContour(d) },
  { id: 'diffuse', label: "Diffuse", category: 'stylize', apply: (d) => diffuse(d) },
  { id: 'glowingEdges', label: "Glowing Edges", category: 'stylize', apply: (d) => glowingEdges(d) },
];
