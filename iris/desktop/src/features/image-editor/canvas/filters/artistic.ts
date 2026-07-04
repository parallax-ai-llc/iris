/**
 * Artistic filters (Filter Gallery)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import type { GalleryFilter } from './types';

/**
 * Oil Paint effect using Kuwahara filter variant.
 * Divides each pixel's neighborhood into quadrants and picks the one
 * with the lowest variance, producing painterly strokes.
 */
export function oilPaint(
  imageData: ImageData,
  radius: number = 4,
  levels: number = 20
): ImageData {
  if (radius <= 0) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const r = Math.ceil(radius);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Intensity histogram bins
      const intensityCount = new Int32Array(levels + 1);
      const avgR = new Float64Array(levels + 1);
      const avgG = new Float64Array(levels + 1);
      const avgB = new Float64Array(levels + 1);

      // Sample neighborhood
      for (let dy = -r; dy <= r; dy++) {
        const py = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -r; dx <= r; dx++) {
          const px = Math.min(width - 1, Math.max(0, x + dx));
          const idx = (py * width + px) * 4;

          const curR = data[idx];
          const curG = data[idx + 1];
          const curB = data[idx + 2];

          // Quantize intensity
          const intensity = Math.round(((curR + curG + curB) / 3) * levels / 255);
          const bin = Math.min(levels, Math.max(0, intensity));

          intensityCount[bin]++;
          avgR[bin] += curR;
          avgG[bin] += curG;
          avgB[bin] += curB;
        }
      }

      // Find the most frequent intensity bin
      let maxCount = 0;
      let maxBin = 0;
      for (let i = 0; i <= levels; i++) {
        if (intensityCount[i] > maxCount) {
          maxCount = intensityCount[i];
          maxBin = i;
        }
      }

      const dstIdx = (y * width + x) * 4;
      if (maxCount > 0) {
        resultData[dstIdx]     = Math.round(avgR[maxBin] / maxCount);
        resultData[dstIdx + 1] = Math.round(avgG[maxBin] / maxCount);
        resultData[dstIdx + 2] = Math.round(avgB[maxBin] / maxCount);
      } else {
        resultData[dstIdx]     = data[dstIdx];
        resultData[dstIdx + 1] = data[dstIdx + 1];
        resultData[dstIdx + 2] = data[dstIdx + 2];
      }
      resultData[dstIdx + 3] = data[dstIdx + 3];
    }
  }

  return result;
}

/**
 * Colored Pencil — simulates colored pencil strokes on textured background
 */
export function coloredPencil(imageData: ImageData, pencilWidth: number = 4, pressure: number = 8, paperBrightness: number = 200): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + pencilWidth, width - 1);
      const ny = Math.min(y + pencilWidth, height - 1);
      const ni = (ny * width + nx) * 4;
      const edgeR = Math.abs(data[i] - data[ni]);
      const edgeG = Math.abs(data[i + 1] - data[ni + 1]);
      const edgeB = Math.abs(data[i + 2] - data[ni + 2]);
      const edge = (edgeR + edgeG + edgeB) / 3;
      const factor = Math.min(1, edge * pressure / 255);
      d[i] = Math.round(data[i] * factor + paperBrightness * (1 - factor));
      d[i + 1] = Math.round(data[i + 1] * factor + paperBrightness * (1 - factor));
      d[i + 2] = Math.round(data[i + 2] * factor + paperBrightness * (1 - factor));
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Cutout — posterize with simplified shapes */
export function cutout(imageData: ImageData, levels: number = 6, _simplicity: number = 4, _fidelity: number = 2): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const step = Math.max(1, Math.round(256 / levels));
  for (let i = 0; i < data.length; i += 4) {
    d[i] = Math.round(data[i] / step) * step;
    d[i + 1] = Math.round(data[i + 1] / step) * step;
    d[i + 2] = Math.round(data[i + 2] / step) * step;
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Dry Brush — dry media stroke effect */
export function dryBrush(imageData: ImageData, brushSize: number = 2, detail: number = 8): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const r = Math.max(1, brushSize);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const si = (sy * width + sx) * 4;
          sumR += data[si]; sumG += data[si + 1]; sumB += data[si + 2]; count++;
        }
      }
      const i = (y * width + x) * 4;
      const quantize = Math.max(1, Math.round(256 / detail));
      d[i] = Math.round(sumR / count / quantize) * quantize;
      d[i + 1] = Math.round(sumG / count / quantize) * quantize;
      d[i + 2] = Math.round(sumB / count / quantize) * quantize;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Film Grain — add noise simulating film grain */
export function filmGrain(imageData: ImageData, grain: number = 10, highlightArea: number = 0, intensity: number = 10): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const threshold = 255 - highlightArea * 2.55;
    const noiseAmount = lum > threshold ? grain * intensity / 10 : grain * intensity / 20;
    const noise = (Math.random() - 0.5) * noiseAmount;
    d[i] = Math.max(0, Math.min(255, data[i] + noise));
    d[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    d[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Fresco — heavy paint stroke simulation */
export function fresco(imageData: ImageData, brushSize: number = 2): ImageData {
  return dryBrush(imageData, brushSize + 1, 6);
}

/** Neon Glow — soft glow with neon edge highlights */
export function neonGlow(imageData: ImageData, glowSize: number = 5, glowBrightness: number = 20, glowColor: { r: number; g: number; b: number } = { r: 0, g: 255, b: 128 }): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + 1, width - 1);
      const ny = Math.min(y + 1, height - 1);
      const ni = (ny * width + nx) * 4;
      const edge = Math.abs(data[i] - data[ni]) + Math.abs(data[i + 1] - data[ni + 1]) + Math.abs(data[i + 2] - data[ni + 2]);
      const edgeNorm = Math.min(1, edge / (255 * 3) * glowSize);
      const glow = edgeNorm * glowBrightness / 10;
      d[i] = Math.min(255, data[i] + glowColor.r * glow / 255);
      d[i + 1] = Math.min(255, data[i + 1] + glowColor.g * glow / 255);
      d[i + 2] = Math.min(255, data[i + 2] + glowColor.b * glow / 255);
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Paint Daubs — thick paint stroke simulation */
export function paintDaubs(imageData: ImageData, brushSize: number = 8, sharpness: number = 5): ImageData {
  return dryBrush(imageData, brushSize, sharpness);
}

/** Palette Knife — smeared paint look */
export function paletteKnife(imageData: ImageData, strokeSize: number = 10, detail: number = 3): ImageData {
  return dryBrush(imageData, strokeSize, detail);
}

/** Plastic Wrap — glossy plastic surface effect */
export function plasticWrap(imageData: ImageData, strength: number = 15, _detail: number = 9, smoothness: number = 7): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + 1, width - 1);
      const ny = Math.min(y + 1, height - 1);
      const ni = (ny * width + nx) * 4;
      const edge = (Math.abs(data[i] - data[ni]) + Math.abs(data[i + 1] - data[ni + 1]) + Math.abs(data[i + 2] - data[ni + 2])) / 3;
      const specular = Math.pow(edge / 255, 1 / (smoothness / 2)) * strength * 10;
      d[i] = Math.min(255, data[i] + specular);
      d[i + 1] = Math.min(255, data[i + 1] + specular);
      d[i + 2] = Math.min(255, data[i + 2] + specular);
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Poster Edges — posterize with edge outlines */
export function posterEdges(imageData: ImageData, edgeThickness: number = 2, edgeIntensity: number = 1, posterize: number = 6): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const step = Math.max(1, Math.round(256 / posterize));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + edgeThickness, width - 1);
      const ny = Math.min(y + edgeThickness, height - 1);
      const ni = (ny * width + nx) * 4;
      const edge = Math.abs(data[i] - data[ni]) + Math.abs(data[i + 1] - data[ni + 1]) + Math.abs(data[i + 2] - data[ni + 2]);
      const isEdge = edge > (255 * 3 * (1 - edgeIntensity / 10));
      d[i] = isEdge ? 0 : Math.round(data[i] / step) * step;
      d[i + 1] = isEdge ? 0 : Math.round(data[i + 1] / step) * step;
      d[i + 2] = isEdge ? 0 : Math.round(data[i + 2] / step) * step;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Rough Pastels — pastel on textured paper */
export function roughPastels(imageData: ImageData, strokeLength: number = 6, detail: number = 4): ImageData {
  return dryBrush(imageData, strokeLength, detail);
}

/** Smudge Stick — soft smudge effect */
export function smudgeStick(imageData: ImageData, strokeLength: number = 2, _highlightArea: number = 12, intensity: number = 10): ImageData {
  return dryBrush(imageData, strokeLength, intensity);
}

/** Sponge — sponge texture application */
export function sponge(imageData: ImageData, brushSize: number = 2, definition: number = 12, smoothness: number = 5): ImageData {
  return cutout(imageData, definition, brushSize, smoothness);
}

/** Underpainting — texture-based underpainting */
export function underpainting(imageData: ImageData, brushSize: number = 4, coverage: number = 8): ImageData {
  return dryBrush(imageData, brushSize, coverage);
}

/** Watercolor — watercolor paint effect */
export function watercolor(imageData: ImageData, detail: number = 9, _shadowIntensity: number = 0): ImageData {
  return dryBrush(imageData, 3, detail);
}

/**
 * Filter Gallery registrations for this category module.
 * Add new gallery filters here, next to their implementation.
 */
export const artisticGalleryFilters: GalleryFilter[] = [
  { id: 'coloredPencil', label: "Colored Pencil", category: 'artistic', apply: (d) => coloredPencil(d) },
  { id: 'cutout', label: "Cutout", category: 'artistic', apply: (d) => cutout(d) },
  { id: 'dryBrush', label: "Dry Brush", category: 'artistic', apply: (d) => dryBrush(d) },
  { id: 'filmGrain', label: "Film Grain", category: 'artistic', apply: (d) => filmGrain(d) },
  { id: 'fresco', label: "Fresco", category: 'artistic', apply: (d) => fresco(d) },
  { id: 'neonGlow', label: "Neon Glow", category: 'artistic', apply: (d) => neonGlow(d) },
  { id: 'paintDaubs', label: "Paint Daubs", category: 'artistic', apply: (d) => paintDaubs(d) },
  { id: 'paletteKnife', label: "Palette Knife", category: 'artistic', apply: (d) => paletteKnife(d) },
  { id: 'plasticWrap', label: "Plastic Wrap", category: 'artistic', apply: (d) => plasticWrap(d) },
  { id: 'posterEdges', label: "Poster Edges", category: 'artistic', apply: (d) => posterEdges(d) },
  { id: 'roughPastels', label: "Rough Pastels", category: 'artistic', apply: (d) => roughPastels(d) },
  { id: 'smudgeStick', label: "Smudge Stick", category: 'artistic', apply: (d) => smudgeStick(d) },
  { id: 'sponge', label: "Sponge", category: 'artistic', apply: (d) => sponge(d) },
  { id: 'underpainting', label: "Underpainting", category: 'artistic', apply: (d) => underpainting(d) },
  { id: 'watercolor', label: "Watercolor", category: 'artistic', apply: (d) => watercolor(d) },
];
