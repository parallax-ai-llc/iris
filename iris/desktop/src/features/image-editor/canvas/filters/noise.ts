/**
 * Noise filters (add / reduce / repair)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { gaussianBlur } from './blur';

/**
 * Add noise to image
 */
export function addNoise(
  imageData: ImageData,
  amount: number,
  monochrome: boolean = false
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const intensity = amount * 2.55; // Convert 0-100 to 0-255

  for (let i = 0; i < data.length; i += 4) {
    if (monochrome) {
      const noise = (Math.random() - 0.5) * intensity;
      resultData[i] = Math.min(255, Math.max(0, data[i] + noise));
      resultData[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      resultData[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    } else {
      resultData[i] = Math.min(255, Math.max(0, data[i] + (Math.random() - 0.5) * intensity));
      resultData[i + 1] = Math.min(255, Math.max(0, data[i + 1] + (Math.random() - 0.5) * intensity));
      resultData[i + 2] = Math.min(255, Math.max(0, data[i + 2] + (Math.random() - 0.5) * intensity));
    }
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Reduce noise (simple median filter)
 */
export function reduceNoise(
  imageData: ImageData,
  strength: number
): ImageData {
  // Use blur as a simple noise reduction
  const radius = Math.ceil(strength / 20);
  return gaussianBlur(imageData, radius);
}

/** Despeckle — edge-preserving median filter for non-edge regions */
export function despeckle(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = (y * width + x) * 4;
      // Check if edge pixel
      let maxDiff = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          const diff = Math.abs(data[ci] - data[si]) + Math.abs(data[ci + 1] - data[si + 1]) + Math.abs(data[ci + 2] - data[si + 2]);
          maxDiff = Math.max(maxDiff, diff);
        }
      }

      if (maxDiff > 80) {
        // Edge: preserve original
        d[ci] = data[ci]; d[ci + 1] = data[ci + 1]; d[ci + 2] = data[ci + 2];
      } else {
        // Non-edge: apply median
        const rs: number[] = [], gs: number[] = [], bs: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            const sy = Math.min(height - 1, Math.max(0, y + dy));
            const si = (sy * width + sx) * 4;
            rs.push(data[si]); gs.push(data[si + 1]); bs.push(data[si + 2]);
          }
        }
        rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
        d[ci] = rs[4]; d[ci + 1] = gs[4]; d[ci + 2] = bs[4];
      }
      d[ci + 3] = data[ci + 3];
    }
  }
  return result;
}

/** Dust & Scratches — radius+threshold outlier removal */
export function dustAndScratches(imageData: ImageData, radius: number = 1, threshold: number = 0): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const r = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = (y * width + x) * 4;
      const rs: number[] = [], gs: number[] = [], bs: number[] = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          rs.push(data[si]); gs.push(data[si + 1]); bs.push(data[si + 2]);
        }
      }
      rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
      const mid = Math.floor(rs.length / 2);
      const diff = Math.abs(data[ci] - rs[mid]) + Math.abs(data[ci + 1] - gs[mid]) + Math.abs(data[ci + 2] - bs[mid]);
      if (diff > threshold) { d[ci] = rs[mid]; d[ci + 1] = gs[mid]; d[ci + 2] = bs[mid]; }
      else { d[ci] = data[ci]; d[ci + 1] = data[ci + 1]; d[ci + 2] = data[ci + 2]; }
      d[ci + 3] = data[ci + 3];
    }
  }
  return result;
}

/** Median — classic NxN median filter */
export function median(imageData: ImageData, radius: number = 1): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const r = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rs: number[] = [], gs: number[] = [], bs: number[] = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          rs.push(data[si]); gs.push(data[si + 1]); bs.push(data[si + 2]);
        }
      }
      rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
      const mid = Math.floor(rs.length / 2);
      const ci = (y * width + x) * 4;
      d[ci] = rs[mid]; d[ci + 1] = gs[mid]; d[ci + 2] = bs[mid]; d[ci + 3] = data[ci + 3];
    }
  }
  return result;
}
