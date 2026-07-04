/**
 * Surface texture filters (Filter Gallery)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import type { GalleryFilter } from './types';

/**
 * Stained Glass — Create a stained glass effect using Voronoi-like cells
 * with thick dark borders. Uses a grid-jittered approach for cell centers
 * and draws dark border lines between cells.
 * @param imageData Source image data
 * @param cellSize Approximate size of each glass cell in pixels
 * @param borderThickness Thickness of dark borders in pixels
 * @param lightIntensity Brightness boost for cell interiors (0-10)
 */
export function stainedGlass(
  imageData: ImageData,
  cellSize: number = 10,
  borderThickness: number = 2,
  lightIntensity: number = 3
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const cs = Math.max(3, Math.round(cellSize));
  const lightBoost = lightIntensity * 5;

  // Generate grid-jittered cell centers
  const cols = Math.ceil(width / cs) + 1;
  const rows = Math.ceil(height / cs) + 1;
  const centers: { x: number; y: number }[] = [];

  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      centers.push({
        x: c * cs + (Math.random() - 0.5) * cs * 0.8,
        y: r * cs + (Math.random() - 0.5) * cs * 0.8,
      });
    }
  }

  // For each pixel, find nearest cell center and second-nearest distance
  const cellMap = new Int32Array(width * height);
  const distMap = new Float32Array(width * height);
  const dist2Map = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minDist = Infinity;
      let min2Dist = Infinity;
      let minIdx = 0;

      // Only check nearby cells for performance
      const approxCol = Math.floor(x / cs);
      const approxRow = Math.floor(y / cs);

      for (let r = approxRow - 2; r <= approxRow + 2; r++) {
        for (let c = approxCol - 2; c <= approxCol + 2; c++) {
          const ci = (r + 1) * (cols + 2) + (c + 1);
          if (ci < 0 || ci >= centers.length) continue;
          const center = centers[ci];
          const dx = x - center.x;
          const dy = y - center.y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            min2Dist = minDist;
            minDist = dist;
            minIdx = ci;
          } else if (dist < min2Dist) {
            min2Dist = dist;
          }
        }
      }

      const idx = y * width + x;
      cellMap[idx] = minIdx;
      distMap[idx] = Math.sqrt(minDist);
      dist2Map[idx] = Math.sqrt(min2Dist);
    }
  }

  // Compute average color per cell
  const cellColors: { r: number; g: number; b: number; a: number; count: number }[] =
    new Array(centers.length).fill(null).map(() => ({ r: 0, g: 0, b: 0, a: 0, count: 0 }));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = cellMap[y * width + x];
      const si = (y * width + x) * 4;
      cellColors[ci].r += data[si];
      cellColors[ci].g += data[si + 1];
      cellColors[ci].b += data[si + 2];
      cellColors[ci].a += data[si + 3];
      cellColors[ci].count++;
    }
  }

  for (const cc of cellColors) {
    if (cc.count > 0) {
      cc.r = Math.round(cc.r / cc.count);
      cc.g = Math.round(cc.g / cc.count);
      cc.b = Math.round(cc.b / cc.count);
      cc.a = Math.round(cc.a / cc.count);
    }
  }

  // Render pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pi = idx * 4;
      const d1 = distMap[idx];
      const d2 = dist2Map[idx];
      const edgeDist = (d2 - d1);

      if (edgeDist < borderThickness) {
        // Border pixel — dark
        d[pi] = 0;
        d[pi + 1] = 0;
        d[pi + 2] = 0;
        d[pi + 3] = 255;
      } else {
        // Cell interior — use cell average color with light boost
        const cc = cellColors[cellMap[idx]];
        d[pi] = Math.min(255, cc.r + lightBoost);
        d[pi + 1] = Math.min(255, cc.g + lightBoost);
        d[pi + 2] = Math.min(255, cc.b + lightBoost);
        d[pi + 3] = cc.a;
      }
    }
  }

  return result;
}

/**
 * Texturizer — Apply a bump-map texture overlay to the image.
 * Generates a procedural texture pattern and applies it as a bump-map
 * with directional lighting to create a tactile surface appearance.
 * @param imageData Source image data
 * @param textureType Type of texture: 'brick', 'burlap', 'canvas', 'sandstone'
 * @param scaling Scale of the texture pattern (50-200, as percentage)
 * @param relief Depth of the bump-map effect (1-10)
 * @param lightDirection Direction of simulated light: 'top', 'bottom', 'left', 'right',
 *   'topLeft', 'topRight', 'bottomLeft', 'bottomRight'
 */
export function texturizer(
  imageData: ImageData,
  textureType: 'brick' | 'burlap' | 'canvas' | 'sandstone' = 'canvas',
  scaling: number = 100,
  relief: number = 4,
  lightDirection: 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' = 'top'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const scaleFactor = scaling / 100;
  const reliefAmt = Math.max(1, Math.min(10, relief));

  // Generate texture height map
  const texMap = new Float32Array(width * height);

  switch (textureType) {
    case 'brick': {
      const brickW = Math.round(24 * scaleFactor);
      const brickH = Math.round(12 * scaleFactor);
      const mortarW = Math.max(1, Math.round(2 * scaleFactor));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const row = Math.floor(y / brickH);
          const offsetX = (row % 2 === 0) ? 0 : Math.floor(brickW / 2);
          const bx = (x + offsetX) % brickW;
          const by = y % brickH;
          const isMortar = bx < mortarW || by < mortarW;
          texMap[y * width + x] = isMortar ? 0 : 0.8 + Math.random() * 0.2;
        }
      }
      break;
    }
    case 'burlap': {
      const freq = 4.0 / scaleFactor;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = (Math.sin(x * freq) + Math.sin(y * freq)) * 0.25 + 0.5;
          texMap[y * width + x] = v + (Math.random() - 0.5) * 0.15;
        }
      }
      break;
    }
    case 'canvas': {
      const freq = 6.0 / scaleFactor;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const warp = Math.sin(x * freq * 0.7) * Math.sin(y * freq) * 0.3;
          const weft = Math.sin(x * freq) * Math.sin(y * freq * 0.7) * 0.3;
          texMap[y * width + x] = 0.5 + warp + weft + (Math.random() - 0.5) * 0.1;
        }
      }
      break;
    }
    case 'sandstone': {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Multi-octave noise approximation
          const n1 = Math.sin(x * 0.1 / scaleFactor + y * 0.13 / scaleFactor) * 0.3;
          const n2 = Math.sin(x * 0.37 / scaleFactor - y * 0.29 / scaleFactor) * 0.2;
          const n3 = (Math.random() - 0.5) * 0.3;
          texMap[y * width + x] = 0.5 + n1 + n2 + n3;
        }
      }
      break;
    }
  }

  // Compute light direction vectors
  let lx = 0, ly = 0;
  switch (lightDirection) {
    case 'top':         lx = 0;  ly = -1; break;
    case 'bottom':      lx = 0;  ly = 1;  break;
    case 'left':        lx = -1; ly = 0;  break;
    case 'right':       lx = 1;  ly = 0;  break;
    case 'topLeft':     lx = -1; ly = -1; break;
    case 'topRight':    lx = 1;  ly = -1; break;
    case 'bottomLeft':  lx = -1; ly = 1;  break;
    case 'bottomRight': lx = 1;  ly = 1;  break;
  }
  // Normalize
  const len = Math.sqrt(lx * lx + ly * ly) || 1;
  lx /= len;
  ly /= len;

  // Apply bump-map lighting
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pi = idx * 4;

      // Compute gradient from height map
      const left = x > 0 ? texMap[idx - 1] : texMap[idx];
      const right = x < width - 1 ? texMap[idx + 1] : texMap[idx];
      const up = y > 0 ? texMap[idx - width] : texMap[idx];
      const down = y < height - 1 ? texMap[idx + width] : texMap[idx];

      const gx = (right - left) * reliefAmt;
      const gy = (down - up) * reliefAmt;

      // Dot product with light direction gives shading
      const shade = (gx * lx + gy * ly) * 40;

      d[pi] = Math.min(255, Math.max(0, data[pi] + shade));
      d[pi + 1] = Math.min(255, Math.max(0, data[pi + 1] + shade));
      d[pi + 2] = Math.min(255, Math.max(0, data[pi + 2] + shade));
      d[pi + 3] = data[pi + 3];
    }
  }

  return result;
}

/**
 * Craquelure — Create a crackle/crack pattern overlay on the image.
 * Generates noise-based crack lines that simulate aged paint or ceramic cracking.
 * @param imageData Source image data
 * @param crackSpacing Average spacing between cracks in pixels (5-100)
 * @param crackDepth Darkness/depth of cracks (1-10)
 * @param crackBrightness Brightness of raised areas between cracks (1-10)
 */
export function craquelure(
  imageData: ImageData,
  crackSpacing: number = 15,
  crackDepth: number = 6,
  crackBrightness: number = 9
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const spacing = Math.max(5, Math.round(crackSpacing));
  const depth = Math.max(1, Math.min(10, crackDepth));
  const brightness = Math.max(1, Math.min(10, crackBrightness));

  // Copy original
  d.set(data);

  // Generate two layers of noise for crack pattern detection
  const noise1 = new Float32Array(width * height);
  const noise2 = new Float32Array(width * height);
  const freq1 = (1.0 / spacing);
  const freq2 = freq1 * 2.3; // Higher frequency for secondary cracks

  // Simple pseudo-noise using sin combinations
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      noise1[idx] = Math.sin(x * freq1 * 3.7 + y * freq1 * 2.3) * 0.5
                   + Math.sin(x * freq1 * 1.1 - y * freq1 * 4.1) * 0.3
                   + Math.sin((x + y) * freq1 * 2.7) * 0.2;
      noise2[idx] = Math.sin(x * freq2 * 2.1 + y * freq2 * 3.9) * 0.4
                   + Math.sin(x * freq2 * 4.3 - y * freq2 * 1.7) * 0.35
                   + Math.sin((x - y) * freq2 * 3.1) * 0.25;
    }
  }

  // Detect cracks at zero-crossings of noise gradient magnitude
  const depthDarken = depth * 15;
  const brightLift = brightness * 3;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const pi = idx * 4;

      // Compute gradient magnitude of noise1
      const gx1 = noise1[idx + 1] - noise1[idx - 1];
      const gy1 = noise1[idx + width] - noise1[idx - width];
      const grad1 = Math.abs(gx1) + Math.abs(gy1);

      // Compute gradient magnitude of noise2
      const gx2 = noise2[idx + 1] - noise2[idx - 1];
      const gy2 = noise2[idx + width] - noise2[idx - width];
      const grad2 = Math.abs(gx2) + Math.abs(gy2);

      // Cracks occur where noise value is near zero (zero-crossing)
      const isCrack1 = Math.abs(noise1[idx]) < 0.06 && grad1 > 0.01;
      const isCrack2 = Math.abs(noise2[idx]) < 0.04 && grad2 > 0.01;

      if (isCrack1 || isCrack2) {
        // Darken for crack
        const darken = isCrack1 ? depthDarken : depthDarken * 0.6;
        d[pi] = Math.max(0, d[pi] - darken);
        d[pi + 1] = Math.max(0, d[pi + 1] - darken);
        d[pi + 2] = Math.max(0, d[pi + 2] - darken);
      } else {
        // Slightly brighten raised areas
        d[pi] = Math.min(255, d[pi] + brightLift);
        d[pi + 1] = Math.min(255, d[pi + 1] + brightLift);
        d[pi + 2] = Math.min(255, d[pi + 2] + brightLift);
      }
    }
  }

  return result;
}

/**
 * Filter Gallery registrations for this category module.
 * Add new gallery filters here, next to their implementation.
 */
export const surfaceTextureGalleryFilters: GalleryFilter[] = [
  { id: 'stainedGlass', label: "Stained Glass", category: 'texture', apply: (d) => stainedGlass(d) },
  { id: 'texturizer', label: "Texturizer", category: 'texture', apply: (d) => texturizer(d) },
  { id: 'craquelure', label: "Craquelure", category: 'texture', apply: (d) => craquelure(d) },
];
