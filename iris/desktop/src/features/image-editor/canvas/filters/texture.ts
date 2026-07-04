/**
 * Texture filters (Filter Gallery)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import type { GalleryFilter } from './types';

/**
 * Grain — Add film grain noise to an image.
 * Simulates various analog film grain types with controllable intensity and contrast.
 * @param imageData Source image data
 * @param intensity Amount of grain (0-100)
 * @param contrast Black-white distribution of grain (0-100)
 * @param grainType Type of grain pattern: 'regular', 'soft', 'sprinkle', 'clumped',
 *   'contrasty', 'enlarged', 'stippled', 'horizontal', 'vertical', 'speckle'
 */
export function grain(
  imageData: ImageData,
  intensity: number = 40,
  contrast: number = 50,
  grainType: 'regular' | 'soft' | 'sprinkle' | 'clumped' | 'contrasty' | 'enlarged' | 'stippled' | 'horizontal' | 'vertical' | 'speckle' = 'regular'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const amt = (intensity / 100) * 255;
  const contrastFactor = contrast / 50; // 0..2 range

  // Copy original
  d.set(data);

  // Helper: gaussian random (Box-Muller)
  const gaussRand = (): number => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };

  // Generate grain noise buffer
  const grainBuf = new Float32Array(width * height);

  switch (grainType) {
    case 'soft': {
      for (let i = 0; i < grainBuf.length; i++) {
        grainBuf[i] = gaussRand() * 0.5;
      }
      break;
    }
    case 'sprinkle': {
      for (let i = 0; i < grainBuf.length; i++) {
        grainBuf[i] = Math.random() < 0.05 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      }
      break;
    }
    case 'clumped': {
      // Generate base noise then blur for clustering
      const base = new Float32Array(width * height);
      for (let i = 0; i < base.length; i++) base[i] = (Math.random() - 0.5) * 2;
      // Simple 3x3 box blur
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              sum += base[(y + dy) * width + (x + dx)];
            }
          }
          grainBuf[y * width + x] = sum / 9;
        }
      }
      break;
    }
    case 'contrasty': {
      for (let i = 0; i < grainBuf.length; i++) {
        const n = (Math.random() - 0.5) * 2;
        grainBuf[i] = n > 0 ? 1 : -1;
      }
      break;
    }
    case 'enlarged': {
      const scale = 3;
      const sw = Math.ceil(width / scale);
      const sh = Math.ceil(height / scale);
      const small = new Float32Array(sw * sh);
      for (let i = 0; i < small.length; i++) small[i] = (Math.random() - 0.5) * 2;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx = Math.min(sw - 1, Math.floor(x / scale));
          const sy = Math.min(sh - 1, Math.floor(y / scale));
          grainBuf[y * width + x] = small[sy * sw + sx];
        }
      }
      break;
    }
    case 'stippled': {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dot = ((x + y) % 2 === 0) ? (Math.random() - 0.5) * 2 : 0;
          grainBuf[y * width + x] = dot;
        }
      }
      break;
    }
    case 'horizontal': {
      const rowNoise = new Float32Array(height);
      for (let y = 0; y < height; y++) rowNoise[y] = (Math.random() - 0.5) * 2;
      for (let y = 0; y < height; y++) {
        const base = rowNoise[y];
        for (let x = 0; x < width; x++) {
          grainBuf[y * width + x] = base + (Math.random() - 0.5) * 0.3;
        }
      }
      break;
    }
    case 'vertical': {
      const colNoise = new Float32Array(width);
      for (let x = 0; x < width; x++) colNoise[x] = (Math.random() - 0.5) * 2;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          grainBuf[y * width + x] = colNoise[x] + (Math.random() - 0.5) * 0.3;
        }
      }
      break;
    }
    case 'speckle': {
      for (let i = 0; i < grainBuf.length; i++) {
        grainBuf[i] = Math.random() < 0.1 ? 1 : 0;
      }
      break;
    }
    default: {
      // 'regular' — uniform random
      for (let i = 0; i < grainBuf.length; i++) {
        grainBuf[i] = (Math.random() - 0.5) * 2;
      }
      break;
    }
  }

  // Apply grain to pixels
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    let noise = grainBuf[i] * amt;
    // Apply contrast: push toward extremes
    noise = noise * contrastFactor;
    d[idx] = Math.min(255, Math.max(0, d[idx] + noise));
    d[idx + 1] = Math.min(255, Math.max(0, d[idx + 1] + noise));
    d[idx + 2] = Math.min(255, Math.max(0, d[idx + 2] + noise));
    // alpha preserved
  }

  return result;
}

/**
 * Mosaic Tiles — Divide image into rectangular tiles with grout lines.
 * Each tile shows the average color of its region. Grout lines are darkened
 * to simulate the gap between real mosaic tiles.
 * @param imageData Source image data
 * @param tileSize Size of each tile in pixels
 * @param groutWidth Width of grout lines in pixels
 * @param lightenGrout Amount to darken grout (subtracted from RGB, 0-255)
 */
export function mosaicTiles(
  imageData: ImageData,
  tileSize: number = 10,
  groutWidth: number = 1,
  lightenGrout: number = 10
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const ts = Math.max(2, Math.round(tileSize));
  const gw = Math.max(0, Math.round(groutWidth));
  const groutDarken = Math.max(0, lightenGrout) * 10; // scale up for visible effect

  for (let ty = 0; ty < height; ty += ts) {
    for (let tx = 0; tx < width; tx += ts) {
      const x1 = tx;
      const y1 = ty;
      const x2 = Math.min(tx + ts, width);
      const y2 = Math.min(ty + ts, height);
      const count = (x2 - x1) * (y2 - y1);

      // Compute average color for this tile
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          aSum += data[i + 3];
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      // Fill tile with average color, apply grout on edges
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          const isGrout =
            (x - tx) < gw || (tx + ts - 1 - x) < gw ||
            (y - ty) < gw || (ty + ts - 1 - y) < gw;

          if (isGrout) {
            d[i] = Math.max(0, rAvg - groutDarken);
            d[i + 1] = Math.max(0, gAvg - groutDarken);
            d[i + 2] = Math.max(0, bAvg - groutDarken);
          } else {
            d[i] = rAvg;
            d[i + 1] = gAvg;
            d[i + 2] = bAvg;
          }
          d[i + 3] = aAvg;
        }
      }
    }
  }

  return result;
}

/**
 * Patchwork — Similar to mosaic but with embossed edges on each square patch.
 * Each patch shows the average color of its region with a 3D relief effect
 * created by lightening top/left edges and darkening bottom/right edges.
 * @param imageData Source image data
 * @param squareSize Size of each patch in pixels
 * @param relief Strength of emboss relief (0-10)
 */
export function patchwork(
  imageData: ImageData,
  squareSize: number = 5,
  relief: number = 3
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const ss = Math.max(2, Math.round(squareSize));
  const reliefAmt = Math.max(0, Math.min(10, relief)) * 8;

  for (let ty = 0; ty < height; ty += ss) {
    for (let tx = 0; tx < width; tx += ss) {
      const x1 = tx;
      const y1 = ty;
      const x2 = Math.min(tx + ss, width);
      const y2 = Math.min(ty + ss, height);
      const count = (x2 - x1) * (y2 - y1);

      // Compute average color
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          aSum += data[i + 3];
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      // Fill patch with embossed edges
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          const localX = x - tx;
          const localY = y - ty;
          const patchW = x2 - x1;
          const patchH = y2 - y1;

          let offset = 0;
          // Top and left edges: lighten (highlight)
          if (localY === 0 || localX === 0) {
            offset = reliefAmt;
          }
          // Bottom and right edges: darken (shadow)
          else if (localY === patchH - 1 || localX === patchW - 1) {
            offset = -reliefAmt;
          }

          d[i] = Math.min(255, Math.max(0, rAvg + offset));
          d[i + 1] = Math.min(255, Math.max(0, gAvg + offset));
          d[i + 2] = Math.min(255, Math.max(0, bAvg + offset));
          d[i + 3] = aAvg;
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
export const textureGalleryFilters: GalleryFilter[] = [
  { id: 'grain', label: "Grain", category: 'texture', apply: (d) => grain(d) },
  { id: 'mosaicTiles', label: "Mosaic Tiles", category: 'texture', apply: (d) => mosaicTiles(d) },
  { id: 'patchwork', label: "Patchwork", category: 'texture', apply: (d) => patchwork(d) },
];
