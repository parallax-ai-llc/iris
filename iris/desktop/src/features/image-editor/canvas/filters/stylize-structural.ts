/**
 * Structural stylize filters (tiles, wind, extrude)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import type { GalleryFilter } from './types';
import { oilPaint } from './artistic';

/**
 * Tiles — split image into NxN tiles with random offsets
 * Empty space is filled with fillColor
 */
export function tiles(
  imageData: ImageData,
  numberOfTiles: number = 10,
  maxOffset: number = 10,
  fillColor: number[] = [128, 128, 128]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Fill background with fillColor
  for (let i = 0; i < d.length; i += 4) {
    d[i] = fillColor[0];
    d[i + 1] = fillColor[1];
    d[i + 2] = fillColor[2];
    d[i + 3] = 255;
  }

  const tileW = Math.max(1, Math.floor(width / numberOfTiles));
  const tileH = Math.max(1, Math.floor(height / numberOfTiles));

  for (let ty = 0; ty < numberOfTiles; ty++) {
    for (let tx = 0; tx < numberOfTiles; tx++) {
      const offsetX = Math.floor(Math.random() * (maxOffset * 2 + 1)) - maxOffset;
      const offsetY = Math.floor(Math.random() * (maxOffset * 2 + 1)) - maxOffset;

      const srcX = tx * tileW;
      const srcY = ty * tileH;

      for (let py = 0; py < tileH; py++) {
        for (let px = 0; px < tileW; px++) {
          const sx = srcX + px;
          const sy = srcY + py;
          const dx = sx + offsetX;
          const dy = sy + offsetY;

          if (sx >= width || sy >= height) continue;
          if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;

          const srcIdx = (sy * width + sx) * 4;
          const dstIdx = (dy * width + dx) * 4;

          d[dstIdx] = data[srcIdx];
          d[dstIdx + 1] = data[srcIdx + 1];
          d[dstIdx + 2] = data[srcIdx + 2];
          d[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }
  }

  return result;
}

/**
 * Wind — horizontal motion streaks
 * Methods: 'wind' (short streaks), 'blast' (longer), 'stagger' (variable length)
 * Direction: 'left' or 'right'
 */
export function wind(
  imageData: ImageData,
  method: 'wind' | 'blast' | 'stagger' = 'wind',
  direction: 'left' | 'right' = 'right',
  strength: number = 20
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Copy source
  d.set(data);

  const dir = direction === 'right' ? 1 : -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Determine if this pixel triggers a streak based on edge contrast
      const nextX = x + dir;
      if (nextX < 0 || nextX >= width) continue;

      const nextIdx = (y * width + nextX) * 4;
      const diff = Math.abs(data[idx] - data[nextIdx]) +
        Math.abs(data[idx + 1] - data[nextIdx + 1]) +
        Math.abs(data[idx + 2] - data[nextIdx + 2]);

      // Only create streaks at edges (where contrast exists)
      if (diff < 30) continue;

      // Determine streak length based on method
      let streakLen: number;
      if (method === 'wind') {
        streakLen = Math.floor(Math.random() * strength) + 1;
      } else if (method === 'blast') {
        streakLen = Math.floor(Math.random() * strength * 2) + strength;
      } else {
        // stagger: variable length with gaps
        streakLen = Math.random() < 0.5
          ? Math.floor(Math.random() * strength * 0.5) + 1
          : Math.floor(Math.random() * strength * 2) + 1;
      }

      // Draw streak
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      for (let s = 1; s <= streakLen; s++) {
        const sx = x + s * dir;
        if (sx < 0 || sx >= width) break;

        const sIdx = (y * width + sx) * 4;
        const alpha = 1.0 - (s / streakLen); // Fade out along streak

        d[sIdx] = Math.min(255, Math.round(d[sIdx] * (1 - alpha) + r * alpha));
        d[sIdx + 1] = Math.min(255, Math.round(d[sIdx + 1] * (1 - alpha) + g * alpha));
        d[sIdx + 2] = Math.min(255, Math.round(d[sIdx + 2] * (1 - alpha) + b * alpha));
      }
    }
  }

  return result;
}

/**
 * Extrude filter — creates 3D extrusion effect with blocks or pyramids
 */
export function extrude(
  imageData: ImageData,
  type: 'blocks' | 'pyramids' = 'blocks',
  size: number = 10,
  depth: number = 30,
  solidFrontFaces: boolean = true
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  // Copy original as background
  resultData.set(data);

  const cols = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  const centerX = width / 2;
  const centerY = height / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const bx = col * size;
      const by = row * size;
      const bw = Math.min(size, width - bx);
      const bh = Math.min(size, height - by);

      // Calculate average luminance for depth
      let totalLum = 0;
      let count = 0;
      let avgR = 0, avgG = 0, avgB = 0;
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          avgR += data[idx];
          avgG += data[idx + 1];
          avgB += data[idx + 2];
          totalLum += (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
          count++;
        }
      }
      avgR = Math.round(avgR / count);
      avgG = Math.round(avgG / count);
      avgB = Math.round(avgB / count);
      const lumFactor = totalLum / count / 255;
      const extrudeDepth = Math.round(lumFactor * depth);

      // Direction from center
      const dirX = (bx + bw / 2 - centerX) / width;
      const dirY = (by + bh / 2 - centerY) / height;
      const offsetX = Math.round(dirX * extrudeDepth);
      const offsetY = Math.round(dirY * extrudeDepth);

      if (type === 'blocks') {
        // Draw extruded block face
        const faceColor = solidFrontFaces
          ? [avgR, avgG, avgB]
          : null;

        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < bw; dx++) {
            const tx = bx + dx + offsetX;
            const ty = by + dy + offsetY;
            if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
              const dstIdx = (ty * width + tx) * 4;
              if (faceColor) {
                resultData[dstIdx] = faceColor[0];
                resultData[dstIdx + 1] = faceColor[1];
                resultData[dstIdx + 2] = faceColor[2];
              } else {
                const srcIdx = ((by + dy) * width + (bx + dx)) * 4;
                resultData[dstIdx] = data[srcIdx];
                resultData[dstIdx + 1] = data[srcIdx + 1];
                resultData[dstIdx + 2] = data[srcIdx + 2];
              }
              resultData[dstIdx + 3] = 255;
            }
          }
        }

        // Draw side faces (darker shading)
        const shade = 0.6;
        if (offsetX > 0) {
          for (let dy = 0; dy < bh; dy++) {
            for (let sx = 0; sx < Math.abs(offsetX); sx++) {
              const tx = bx + bw + sx;
              const ty = by + dy + Math.round(offsetY * sx / Math.max(1, Math.abs(offsetX)));
              if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
                const dstIdx = (ty * width + tx) * 4;
                resultData[dstIdx] = Math.round(avgR * shade);
                resultData[dstIdx + 1] = Math.round(avgG * shade);
                resultData[dstIdx + 2] = Math.round(avgB * shade);
                resultData[dstIdx + 3] = 255;
              }
            }
          }
        }
      } else {
        // Pyramids: draw converging lines from corners to center offset
        const cx = bx + bw / 2 + offsetX;
        const cy = by + bh / 2 + offsetY;
        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < bw; dx++) {
            const fx = dx / bw;
            const fy = dy / bh;
            const t = Math.max(Math.abs(fx - 0.5), Math.abs(fy - 0.5)) * 2;
            const tx = Math.round(bx + dx + (cx - (bx + dx)) * (1 - t));
            const ty = Math.round(by + dy + (cy - (by + dy)) * (1 - t));
            if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
              const dstIdx = (ty * width + tx) * 4;
              const brightness = 0.5 + 0.5 * (1 - t);
              resultData[dstIdx] = Math.min(255, Math.round(avgR * brightness));
              resultData[dstIdx + 1] = Math.min(255, Math.round(avgG * brightness));
              resultData[dstIdx + 2] = Math.min(255, Math.round(avgB * brightness));
              resultData[dstIdx + 3] = 255;
            }
          }
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
export const structuralStylizeGalleryFilters: GalleryFilter[] = [
  { id: 'tiles', label: "Tiles", category: 'stylize', apply: (d) => tiles(d) },
  { id: 'wind', label: "Wind", category: 'stylize', apply: (d) => wind(d) },
  { id: 'extrude', label: "Extrude", category: 'stylize', apply: (d) => extrude(d) },
  // Implemented in artistic.ts but belongs to the Stylize tab; registered here
  // (the last stylize-contributing module) to keep it last in the tab,
  // matching the pre-split catalog order.
  { id: 'oilPaint', label: "Oil Paint", category: 'stylize', apply: (d) => oilPaint(d) },
];
