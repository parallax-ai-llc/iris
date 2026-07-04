/**
 * Tonal adjustments (threshold, photo filter, black & white, shadows/highlights, HDR toning)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

import { clamp } from '../colorUtils';
import { fromHsl, toHsl } from './core';

/**
 * Convert image to pure black & white based on threshold value.
 * Pixels brighter than threshold → white, otherwise → black.
 */
export function applyThreshold(imageData: ImageData, threshold: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const val = lum >= threshold ? 255 : 0;
    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
  }
  return result;
}

/**
 * Simulate a lens photo filter (Warming, Cooling, custom color).
 * Blends a color overlay with the image at the given density.
 */
export function applyPhotoFilter(
  imageData: ImageData,
  color: { r: number; g: number; b: number },
  density: number,
  preserveLuminosity: boolean
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;
  const factor = density / 100;

  for (let i = 0; i < d.length; i += 4) {
    const origLum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

    d[i]     = clamp(d[i]     + (color.r - d[i])     * factor, 0, 255);
    d[i + 1] = clamp(d[i + 1] + (color.g - d[i + 1]) * factor, 0, 255);
    d[i + 2] = clamp(d[i + 2] + (color.b - d[i + 2]) * factor, 0, 255);

    if (preserveLuminosity) {
      const newLum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const delta = origLum - newLum;
      d[i]     = clamp(d[i]     + delta, 0, 255);
      d[i + 1] = clamp(d[i + 1] + delta, 0, 255);
      d[i + 2] = clamp(d[i + 2] + delta, 0, 255);
    }
  }
  return result;
}

/** Photo filter color presets */
export const PHOTO_FILTER_PRESETS: Record<string, { r: number; g: number; b: number; name: string }> = {
  warming85:  { r: 236, g: 138, b: 0,   name: 'Warming (85)' },
  warming81:  { r: 235, g: 177, b: 19,  name: 'Warming (81)' },
  cooling80:  { r: 0,   g: 109, b: 235, name: 'Cooling (80)' },
  cooling82:  { r: 0,   g: 137, b: 204, name: 'Cooling (82)' },
  sepia:      { r: 172, g: 122, b: 51,  name: 'Sepia' },
  deepBlue:   { r: 0,   g: 47,  b: 135, name: 'Deep Blue' },
  deepGreen:  { r: 0,   g: 76,  b: 0,   name: 'Deep Green' },
  deepYellow: { r: 255, g: 211, b: 0,   name: 'Deep Yellow' },
  violet:     { r: 78,  g: 0,   b: 120, name: 'Violet' },
  orange:     { r: 255, g: 128, b: 0,   name: 'Orange' },
};

/**
 * Advanced black & white conversion with per-channel luminance control.
 * Each slider controls how much that color range contributes to brightness.
 */
export function applyBlackAndWhite(
  imageData: ImageData,
  channelWeights: {
    reds: number;      // -200 to 300 (default 40)
    yellows: number;   // -200 to 300 (default 60)
    greens: number;    // -200 to 300 (default 40)
    cyans: number;     // -200 to 300 (default 60)
    blues: number;     // -200 to 300 (default 20)
    magentas: number;  // -200 to 300 (default 80)
  },
  tint?: { hue: number; saturation: number }
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;

    // Determine hue-based weights
    const [h, , ] = toHsl(d[i], d[i + 1], d[i + 2]);

    // Calculate contribution from each color range
    let gray = 0;
    const weights = [
      { center: 0,   weight: channelWeights.reds / 100 },
      { center: 60,  weight: channelWeights.yellows / 100 },
      { center: 120, weight: channelWeights.greens / 100 },
      { center: 180, weight: channelWeights.cyans / 100 },
      { center: 240, weight: channelWeights.blues / 100 },
      { center: 300, weight: channelWeights.magentas / 100 },
    ];

    const maxComp = Math.max(r, g, b);
    const minComp = Math.min(r, g, b);
    const chroma = maxComp - minComp;

    if (chroma < 0.01) {
      // Achromatic — use simple luminance
      gray = 0.299 * r + 0.587 * g + 0.114 * b;
    } else {
      let totalWeight = 0;
      let weightedSum = 0;
      for (const w of weights) {
        let dist = Math.abs(h - w.center) % 360;
        if (dist > 180) dist = 360 - dist;
        if (dist < 60) {
          const influence = (1 - dist / 60) * chroma;
          totalWeight += influence;
          weightedSum += influence * w.weight;
        }
      }
      const baseLum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray = totalWeight > 0
        ? clamp(baseLum * (1 + weightedSum / Math.max(1, totalWeight)), 0, 1)
        : baseLum;
    }

    const grayVal = clamp(gray * 255, 0, 255);

    if (tint && tint.saturation > 0) {
      const [tr, tg, tb] = fromHsl(tint.hue, tint.saturation / 100, gray);
      d[i] = tr;
      d[i + 1] = tg;
      d[i + 2] = tb;
    } else {
      d[i] = grayVal;
      d[i + 1] = grayVal;
      d[i + 2] = grayVal;
    }
  }
  return result;
}

export interface ShadowsHighlightsValues {
  shadowAmount: number;      // 0 to 100
  shadowTonalWidth: number;  // 0 to 100 (default 50)
  shadowRadius: number;      // 0 to 100 (default 30)
  highlightAmount: number;   // 0 to 100
  highlightTonalWidth: number; // 0 to 100 (default 50)
  highlightRadius: number;   // 0 to 100 (default 30)
}

/**
 * Advanced Shadows/Highlights with Amount, Tonal Width, and Radius controls.
 * Uses a blurred luminance map to determine local brightness context.
 */
export function applyShadowsHighlights(
  imageData: ImageData,
  values: ShadowsHighlightsValues
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;

  // Build luminance channel
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }

  // Simple box-blur the luminance for local context (radius-based)
  const blurRadius = Math.max(1, Math.round(Math.max(values.shadowRadius, values.highlightRadius) * 0.3));
  const blurred = new Float32Array(lum);
  // Horizontal pass
  const temp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dx = -blurRadius; dx <= blurRadius; dx++) {
        const nx = Math.min(width - 1, Math.max(0, x + dx));
        sum += blurred[y * width + nx];
        count++;
      }
      temp[y * width + x] = sum / count;
    }
  }
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dy = -blurRadius; dy <= blurRadius; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        sum += temp[ny * width + x];
        count++;
      }
      blurred[y * width + x] = sum / count;
    }
  }

  const sTW = values.shadowTonalWidth / 100;
  const hTW = values.highlightTonalWidth / 100;
  const sAmt = values.shadowAmount / 100;
  const hAmt = values.highlightAmount / 100;

  for (let i = 0; i < lum.length; i++) {
    const l = blurred[i];
    let adjustment = 0;

    // Shadow recovery: brighten dark areas
    if (l < sTW && sAmt > 0) {
      const shadowWeight = (sTW - l) / Math.max(0.01, sTW);
      adjustment += shadowWeight * sAmt * 0.5;
    }

    // Highlight recovery: darken bright areas
    if (l > (1 - hTW) && hAmt > 0) {
      const highlightWeight = (l - (1 - hTW)) / Math.max(0.01, hTW);
      adjustment -= highlightWeight * hAmt * 0.5;
    }

    if (adjustment !== 0) {
      const pi = i * 4;
      d[pi]     = clamp(d[pi]     + adjustment * 255, 0, 255);
      d[pi + 1] = clamp(d[pi + 1] + adjustment * 255, 0, 255);
      d[pi + 2] = clamp(d[pi + 2] + adjustment * 255, 0, 255);
    }
  }
  return result;
}

/**
 * HDR Toning — local tone mapping for HDR-like effect
 */
export function applyHdrToning(
  imageData: ImageData,
  strength: number = 50,
  detail: number = 50,
  saturation: number = 0
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const s = clamp(strength, 0, 100) / 100;
  const d = clamp(detail, 0, 100) / 100;
  const sat = clamp(saturation, -100, 100) / 100;

  // Build luminance map
  const lumMap = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    lumMap[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  // Box blur for local average luminance
  const br = Math.max(2, Math.round(Math.min(width, height) / 20));
  const localAvg = new Float32Array(width * height);
  const hTemp = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    let sum = 0, count = 0;
    for (let x = 0; x < Math.min(br, width); x++) { sum += lumMap[y * width + x]; count++; }
    for (let x = 0; x < width; x++) {
      if (x + br < width) { sum += lumMap[y * width + x + br]; count++; }
      if (x - br - 1 >= 0) { sum -= lumMap[y * width + x - br - 1]; count--; }
      hTemp[y * width + x] = sum / count;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0, count = 0;
    for (let y = 0; y < Math.min(br, height); y++) { sum += hTemp[y * width + x]; count++; }
    for (let y = 0; y < height; y++) {
      if (y + br < height) { sum += hTemp[(y + br) * width + x]; count++; }
      if (y - br - 1 >= 0) { sum -= hTemp[(y - br - 1) * width + x]; count--; }
      localAvg[y * width + x] = sum / count;
    }
  }

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const lum = lumMap[i];
    const avg = Math.max(1, localAvg[i]);
    const globalTone = Math.pow(lum / 255, 1 - s * 0.5) * 255;
    const localDetail = (lum - avg) * d * 2;
    const mapped = clamp(Math.round(globalTone + localDetail), 0, 255);
    const ratio = lum > 0 ? mapped / lum : 1;

    let r = data[idx] * ratio, g = data[idx + 1] * ratio, b = data[idx + 2] * ratio;
    if (sat !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const sf = 1 + sat;
      r = gray + (r - gray) * sf; g = gray + (g - gray) * sf; b = gray + (b - gray) * sf;
    }
    resultData[idx] = clamp(Math.round(r), 0, 255);
    resultData[idx + 1] = clamp(Math.round(g), 0, 255);
    resultData[idx + 2] = clamp(Math.round(b), 0, 255);
    resultData[idx + 3] = data[idx + 3];
  }
  return result;
}
