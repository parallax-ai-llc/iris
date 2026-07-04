/**
 * Automatic selection mask generators (sky, focus area, removal mask)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

import { clamp } from '../colorUtils';

/**
 * Select Sky — detects sky region using color and position heuristics
 * Returns Uint8ClampedArray mask (0=not sky, 255=sky)
 */
export function selectSky(imageData: ImageData): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const posWeight = Math.max(0, 1 - (y / height) * 1.5);
      const brightness = (r + g + b) / 3;
      const isBluish = b > r && b > g * 0.8 && brightness > 80;
      const isOvercast = brightness > 180 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30;
      const isSunset = r > 150 && g > 80 && b > 60 && r > b && brightness > 120 && y < height * 0.5;

      let score = 0;
      if (isBluish) score = 0.9;
      else if (isOvercast) score = 0.6;
      else if (isSunset) score = 0.5;
      score *= posWeight;

      mask[y * width + x] = clamp(Math.round(score * 255), 0, 255);
    }
  }

  // Smooth mask with 3x3 box blur
  const smoothed = new Uint8ClampedArray(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          sum += mask[(y + dy) * width + (x + dx)];
      smoothed[y * width + x] = Math.round(sum / 9);
    }
  }
  for (let x = 0; x < width; x++) {
    smoothed[x] = mask[x];
    smoothed[(height - 1) * width + x] = mask[(height - 1) * width + x];
  }
  for (let y = 0; y < height; y++) {
    smoothed[y * width] = mask[y * width];
    smoothed[y * width + width - 1] = mask[y * width + width - 1];
  }
  return smoothed;
}

/**
 * Select Focus Area — detects in-focus regions using edge density
 * Returns Uint8ClampedArray mask (0=out of focus, 255=in focus)
 */
export function selectFocusArea(imageData: ImageData, threshold: number = 50): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(width * height);
  const t = clamp(threshold, 0, 100) / 100;

  // Sobel edge strength
  const edgeMap = new Float32Array(width * height);
  let maxEdge = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const lum = (px: number, py: number) => {
        const i = (py * width + px) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      };
      const gx = -lum(x-1,y-1)+lum(x+1,y-1)-2*lum(x-1,y)+2*lum(x+1,y)-lum(x-1,y+1)+lum(x+1,y+1);
      const gy = -lum(x-1,y-1)-2*lum(x,y-1)-lum(x+1,y-1)+lum(x-1,y+1)+2*lum(x,y+1)+lum(x+1,y+1);
      const mag = Math.sqrt(gx * gx + gy * gy);
      edgeMap[y * width + x] = mag;
      if (mag > maxEdge) maxEdge = mag;
    }
  }
  if (maxEdge === 0) return mask;

  // Local edge density via box blur
  const radius = Math.max(2, Math.round(Math.min(width, height) / 40));
  const density = new Float32Array(width * height);
  const hT = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    let sum = 0, cnt = 0;
    for (let x = 0; x < Math.min(radius, width); x++) { sum += edgeMap[y * width + x]; cnt++; }
    for (let x = 0; x < width; x++) {
      if (x + radius < width) { sum += edgeMap[y * width + x + radius]; cnt++; }
      if (x - radius - 1 >= 0) { sum -= edgeMap[y * width + x - radius - 1]; cnt--; }
      hT[y * width + x] = sum / cnt;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0, cnt = 0;
    for (let y = 0; y < Math.min(radius, height); y++) { sum += hT[y * width + x]; cnt++; }
    for (let y = 0; y < height; y++) {
      if (y + radius < height) { sum += hT[(y + radius) * width + x]; cnt++; }
      if (y - radius - 1 >= 0) { sum -= hT[(y - radius - 1) * width + x]; cnt--; }
      density[y * width + x] = sum / cnt;
    }
  }

  let maxDensity = 0;
  for (let i = 0; i < density.length; i++) if (density[i] > maxDensity) maxDensity = density[i];

  const cutoff = maxDensity * t;
  for (let i = 0; i < density.length; i++) {
    const norm = density[i] / Math.max(1, maxDensity);
    mask[i] = clamp(Math.round((density[i] > cutoff ? norm : norm * 0.3) * 255), 0, 255);
  }
  return mask;
}

/**
 * Generate a removal mask for the Remove Tool.
 * Creates a circular mask centered on the click point, suitable for
 * passing to an inpaint API for one-click object removal.
 */
export function generateRemovalMask(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  const r2 = radius * radius;
  const yStart = Math.max(0, Math.floor(centerY - radius));
  const yEnd = Math.min(height - 1, Math.ceil(centerY + radius));
  const xStart = Math.max(0, Math.floor(centerX - radius));
  const xEnd = Math.min(width - 1, Math.ceil(centerX + radius));

  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const dx = x - centerX, dy = y - centerY;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= r2) {
        // Soft falloff at edge
        const t = Math.sqrt(dist2) / radius;
        mask[y * width + x] = t < 0.8 ? 255 : Math.round(255 * (1 - (t - 0.8) / 0.2));
      }
    }
  }
  return mask;
}
