/**
 * Sharpen filters
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { gaussianBlur, motionBlur } from './blur';
import { applyConvolution } from './core';

/**
 * Basic sharpen
 */
export function sharpen(
  imageData: ImageData,
  amount: number = 1
): ImageData {
  const kernel = [
    [0, -amount, 0],
    [-amount, 1 + 4 * amount, -amount],
    [0, -amount, 0],
  ];
  return applyConvolution(imageData, kernel, 1);
}

/**
 * Unsharp mask (professional sharpening)
 */
export function unsharpMask(
  imageData: ImageData,
  amount: number,
  radius: number,
  threshold: number
): ImageData {
  // Create blurred version
  const blurred = gaussianBlur(imageData, radius);
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const factor = amount / 100;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const original = data[i + c];
      const blur = blurred.data[i + c];
      const diff = original - blur;

      // Apply threshold
      if (Math.abs(diff) > threshold) {
        resultData[i + c] = Math.min(255, Math.max(0, original + diff * factor));
      } else {
        resultData[i + c] = original;
      }
    }
    resultData[i + 3] = data[i + 3]; // Preserve alpha
  }

  return result;
}

/**
 * Smart Sharpen — advanced sharpening with blur type selection
 * and separate shadow/highlight controls.
 */
export function smartSharpen(
  imageData: ImageData,
  amount: number,
  radius: number,
  reduceNoise: number = 0,
  removeType: 'gaussian' | 'lens' | 'motion' = 'gaussian',
  motionAngle: number = 0
): ImageData {
  if (amount <= 0 || radius <= 0) return imageData;

  // Create the blur based on remove type
  let blurred: ImageData;
  switch (removeType) {
    case 'motion':
      blurred = motionBlur(imageData, motionAngle, radius);
      break;
    case 'lens':
      // Approximate lens blur with slightly different Gaussian
      blurred = gaussianBlur(imageData, radius * 0.8);
      break;
    default:
      blurred = gaussianBlur(imageData, radius);
  }

  // Optional noise reduction pre-pass
  if (reduceNoise > 0) {
    blurred = gaussianBlur(blurred, reduceNoise * 0.3);
  }

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const factor = amount / 100;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const original = data[i + c];
      const blur = blurred.data[i + c];
      const diff = original - blur;
      resultData[i + c] = Math.min(255, Math.max(0, Math.round(original + diff * factor)));
    }
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * High Pass filter — extracts edges/detail by subtracting a blurred version.
 * Result is centered at gray (128). Used with Overlay blend for sharpening.
 */
export function highPass(imageData: ImageData, radius: number): ImageData {
  if (radius <= 0) return imageData;

  const blurred = gaussianBlur(imageData, radius);
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let i = 0; i < data.length; i += 4) {
    resultData[i]     = Math.min(255, Math.max(0, (data[i]     - blurred.data[i])     + 128));
    resultData[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - blurred.data[i + 1]) + 128));
    resultData[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - blurred.data[i + 2]) + 128));
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Sharpen More — stronger single-step sharpening (3x3 kernel with higher weights)
 */
export function sharpenMore(imageData: ImageData): ImageData {
  const kernel = [
    [-1, -1, -1],
    [-1, 9, -1],
    [-1, -1, -1],
  ];
  return applyConvolution(imageData, kernel, 1);
}

/**
 * Sharpen Edges — edge-aware sharpening that only enhances edges
 * Uses a Laplacian to detect edges, then blends sharpening only where edges exist
 */
export function sharpenEdges(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  // Detect edges using Sobel magnitude
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        // Sobel gradients
        const gx =
          -data[((y - 1) * width + (x - 1)) * 4 + c] +
           data[((y - 1) * width + (x + 1)) * 4 + c] +
          -2 * data[(y * width + (x - 1)) * 4 + c] +
           2 * data[(y * width + (x + 1)) * 4 + c] +
          -data[((y + 1) * width + (x - 1)) * 4 + c] +
           data[((y + 1) * width + (x + 1)) * 4 + c];
        const gy =
          -data[((y - 1) * width + (x - 1)) * 4 + c] +
          -2 * data[((y - 1) * width + x) * 4 + c] +
          -data[((y - 1) * width + (x + 1)) * 4 + c] +
           data[((y + 1) * width + (x - 1)) * 4 + c] +
           2 * data[((y + 1) * width + x) * 4 + c] +
           data[((y + 1) * width + (x + 1)) * 4 + c];

        const edgeStrength = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 128);

        // Sharpen with 3x3 Laplacian
        const sharpened =
          5 * data[idx + c] -
          data[((y - 1) * width + x) * 4 + c] -
          data[((y + 1) * width + x) * 4 + c] -
          data[(y * width + (x - 1)) * 4 + c] -
          data[(y * width + (x + 1)) * 4 + c];

        // Blend: only sharpen where edges are detected
        resultData[idx + c] = Math.min(255, Math.max(0,
          Math.round(data[idx + c] * (1 - edgeStrength) + sharpened * edgeStrength)
        ));
      }
      resultData[idx + 3] = data[idx + 3];
    }
  }

  // Copy border pixels
  for (let x = 0; x < width; x++) {
    const top = x * 4;
    const bot = ((height - 1) * width + x) * 4;
    for (let c = 0; c < 4; c++) {
      resultData[top + c] = data[top + c];
      resultData[bot + c] = data[bot + c];
    }
  }
  for (let y = 0; y < height; y++) {
    const left = (y * width) * 4;
    const right = (y * width + width - 1) * 4;
    for (let c = 0; c < 4; c++) {
      resultData[left + c] = data[left + c];
      resultData[right + c] = data[right + c];
    }
  }

  return result;
}
