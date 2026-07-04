/**
 * Sketch filters (Filter Gallery)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { dryBrush } from './artistic';
import type { GalleryFilter } from './types';

/** Bas Relief — embossed relief effect */
export function basRelief(imageData: ImageData, detail: number = 13, _smoothness: number = 3, lightDirection: number = 0): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const dx = Math.round(Math.cos(lightDirection * Math.PI / 180));
  const dy = Math.round(Math.sin(lightDirection * Math.PI / 180));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const sx = Math.max(0, Math.min(width - 1, x + dx));
      const sy = Math.max(0, Math.min(height - 1, y + dy));
      const si = (sy * width + sx) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const lumN = data[si] * 0.299 + data[si + 1] * 0.587 + data[si + 2] * 0.114;
      const relief = 128 + (lum - lumN) * detail / 10;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, relief));
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Chalk & Charcoal */
export function chalkAndCharcoal(imageData: ImageData, chalkArea: number = 6, charcoalArea: number = 6, pressure: number = 1): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const threshold = 128 + (chalkArea - charcoalArea) * 5;
    const val = lum > threshold ? Math.min(255, 200 + (lum - threshold) * pressure) : Math.max(0, 50 - (threshold - lum) * pressure);
    d[i] = d[i + 1] = d[i + 2] = val;
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Charcoal */
export function charcoal(imageData: ImageData, thickness: number = 1, detail: number = 5): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + thickness, width - 1);
      const ny = Math.min(y + thickness, height - 1);
      const ni = (ny * width + nx) * 4;
      const edge = Math.abs(data[i] - data[ni]) + Math.abs(data[i + 1] - data[ni + 1]) + Math.abs(data[i + 2] - data[ni + 2]);
      const val = edge > detail * 10 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Chrome — metallic chrome surface */
export function chrome(imageData: ImageData, detail: number = 4, _smoothness: number = 7): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + 1, width - 1);
      const ny = Math.min(y + 1, height - 1);
      const ni = (ny * width + nx) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const lumN = data[ni] * 0.299 + data[ni + 1] * 0.587 + data[ni + 2] * 0.114;
      const val = Math.sin((lum - lumN) * detail / 50 * Math.PI) * 127 + 128;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, val));
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Conte Crayon — conte crayon on textured paper */
export function conteCrayon(imageData: ImageData, fgLevel: number = 11, bgLevel: number = 7): ImageData {
  return chalkAndCharcoal(imageData, bgLevel, fgLevel, 1);
}

/** Graphic Pen — fine ink pen strokes */
export function graphicPen(imageData: ImageData, strokeLength: number = 15, lightDarkBalance: number = 50, strokeDirection: number = 45): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const dirX = Math.cos(strokeDirection * Math.PI / 180);
  const dirY = Math.sin(strokeDirection * Math.PI / 180);
  const threshold = lightDarkBalance * 2.55;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const sx = Math.max(0, Math.min(width - 1, x + Math.round(dirX * strokeLength / 5)));
      const sy = Math.max(0, Math.min(height - 1, y + Math.round(dirY * strokeLength / 5)));
      const si = (sy * width + sx) * 4;
      const lumN = data[si] * 0.299 + data[si + 1] * 0.587 + data[si + 2] * 0.114;
      const val = Math.abs(lum - lumN) > threshold / 5 ? 0 : (lum < threshold ? 0 : 255);
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Halftone Pattern — CMYK halftone dots */
export function halftonePattern(imageData: ImageData, dotSize: number = 5, contrast: number = 5, patternType: 'circle' | 'dot' | 'line' = 'circle'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const cellSize = Math.max(2, dotSize);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const cellX = (x % cellSize) - cellSize / 2;
      const cellY = (y % cellSize) - cellSize / 2;
      let dist: number;
      if (patternType === 'line') {
        dist = Math.abs(cellY);
      } else {
        dist = Math.sqrt(cellX * cellX + cellY * cellY);
      }
      const threshold = (255 - lum) / 255 * cellSize * contrast / 10;
      const val = dist < threshold ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Note Paper — embossed paper texture */
export function notePaper(imageData: ImageData, _imageBalance: number = 25, graininess: number = 10, relief: number = 11): ImageData {
  return basRelief(imageData, relief, graininess, 0);
}

/** Photocopy — high contrast photocopy effect */
export function photocopy(imageData: ImageData, detail: number = 7, darkness: number = 8): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const threshold = (10 - darkness) * 25;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + Math.max(1, Math.round(10 / detail)), width - 1);
      const ny = Math.min(y + Math.max(1, Math.round(10 / detail)), height - 1);
      const ni = (ny * width + nx) * 4;
      const edge = Math.abs(data[i] - data[ni]) + Math.abs(data[i + 1] - data[ni + 1]) + Math.abs(data[i + 2] - data[ni + 2]);
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const val = (edge > threshold || lum < threshold) ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Plaster — embossed plaster effect */
export function plaster(imageData: ImageData, _imageBalance: number = 25, smoothness: number = 2, lightDirection: number = 0): ImageData {
  return basRelief(imageData, 10, smoothness, lightDirection);
}

/** Reticulation — grainy reticulation pattern */
export function reticulation(imageData: ImageData, density: number = 12, fgLevel: number = 40, bgLevel: number = 5): ImageData {
  const { data } = imageData;
  const result = new ImageData(imageData.width, imageData.height);
  const d = result.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const grain = (Math.random() - 0.5) * density * 5;
    const val = lum + grain;
    d[i] = d[i + 1] = d[i + 2] = Math.max(bgLevel, Math.min(fgLevel * 6, val));
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Stamp — rubber stamp effect */
export function stamp(imageData: ImageData, lightDarkBalance: number = 25, _smoothness: number = 5): ImageData {
  const { data } = imageData;
  const result = new ImageData(imageData.width, imageData.height);
  const d = result.data;
  const threshold = lightDarkBalance * 10;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const val = lum > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = val;
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Torn Edges — torn paper edge effect */
export function tornEdges(imageData: ImageData, imageBalance: number = 25, _smoothness: number = 11, contrast: number = 17): ImageData {
  const { data } = imageData;
  const result = new ImageData(imageData.width, imageData.height);
  const d = result.data;
  const threshold = imageBalance * 10;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const noise = (Math.random() - 0.5) * contrast;
    const val = (lum + noise) > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = val;
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Water Paper — fibrous wet paper texture */
export function waterPaper(imageData: ImageData, fiberLength: number = 15, brightness: number = 60, _contrast: number = 80): ImageData {
  return dryBrush(imageData, Math.max(1, Math.round(fiberLength / 5)), Math.max(1, Math.round(brightness / 10)));
}

/**
 * Filter Gallery registrations for this category module.
 * Add new gallery filters here, next to their implementation.
 */
export const sketchGalleryFilters: GalleryFilter[] = [
  { id: 'basRelief', label: "Bas Relief", category: 'sketch', apply: (d) => basRelief(d) },
  { id: 'chalkAndCharcoal', label: "Chalk & Charcoal", category: 'sketch', apply: (d) => chalkAndCharcoal(d) },
  { id: 'charcoal', label: "Charcoal", category: 'sketch', apply: (d) => charcoal(d) },
  { id: 'chrome', label: "Chrome", category: 'sketch', apply: (d) => chrome(d) },
  { id: 'conteCrayon', label: "Conté Crayon", category: 'sketch', apply: (d) => conteCrayon(d) },
  { id: 'graphicPen', label: "Graphic Pen", category: 'sketch', apply: (d) => graphicPen(d) },
  { id: 'halftonePattern', label: "Halftone Pattern", category: 'sketch', apply: (d) => halftonePattern(d) },
  { id: 'notePaper', label: "Note Paper", category: 'sketch', apply: (d) => notePaper(d) },
  { id: 'photocopy', label: "Photocopy", category: 'sketch', apply: (d) => photocopy(d) },
  { id: 'plaster', label: "Plaster", category: 'sketch', apply: (d) => plaster(d) },
  { id: 'reticulation', label: "Reticulation", category: 'sketch', apply: (d) => reticulation(d) },
  { id: 'stamp', label: "Stamp", category: 'sketch', apply: (d) => stamp(d) },
  { id: 'tornEdges', label: "Torn Edges", category: 'sketch', apply: (d) => tornEdges(d) },
  { id: 'waterPaper', label: "Water Paper", category: 'sketch', apply: (d) => waterPaper(d) },
];
