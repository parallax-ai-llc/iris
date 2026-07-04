/**
 * Color adjustments (selective color, channel mixer, gradient map, color lookup, color transfer)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

import { clamp } from '../colorUtils';
import { toHsl } from './core';

export interface SelectiveColorValues {
  cyan: number;    // -100 to 100
  magenta: number; // -100 to 100
  yellow: number;  // -100 to 100
  black: number;   // -100 to 100
}

export type SelectiveColorRange =
  | 'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas'
  | 'whites' | 'neutrals' | 'blacks';

/**
 * Selective Color adjustment — adjust CMYK values per color range.
 * Photoshop-style: targets specific color ranges and shifts their CMYK components.
 */
export function applySelectiveColor(
  imageData: ImageData,
  adjustments: Partial<Record<SelectiveColorRange, SelectiveColorValues>>,
  isAbsolute: boolean = false
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);

    // Convert to CMY
    let c = 1 - r, m = 1 - g, y = 1 - b;
    const k = Math.min(c, m, y);

    // Determine which color range this pixel belongs to and its weight
    const ranges: Array<{ range: SelectiveColorRange; weight: number }> = [];

    // Chromatic ranges based on hue
    if (max !== min) {
      const [h] = toHsl(d[i], d[i + 1], d[i + 2]);
      const chroma = max - min;
      const hueRanges: Array<[SelectiveColorRange, number]> = [
        ['reds', 0], ['yellows', 60], ['greens', 120],
        ['cyans', 180], ['blues', 240], ['magentas', 300],
      ];
      for (const [range, center] of hueRanges) {
        let dist = Math.abs(h - center) % 360;
        if (dist > 180) dist = 360 - dist;
        if (dist < 60) {
          ranges.push({ range, weight: (1 - dist / 60) * chroma });
        }
      }
    }

    // Tonal ranges
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 0.67) ranges.push({ range: 'whites', weight: (lum - 0.67) / 0.33 });
    if (lum < 0.33) ranges.push({ range: 'blacks', weight: (0.33 - lum) / 0.33 });
    if (lum >= 0.25 && lum <= 0.75) ranges.push({ range: 'neutrals', weight: 1 - Math.abs(lum - 0.5) * 4 });

    // Apply adjustments for each matching range
    let dc = 0, dm = 0, dy = 0, dk = 0;
    for (const { range, weight } of ranges) {
      const adj = adjustments[range];
      if (!adj) continue;
      const w = weight;
      if (isAbsolute) {
        dc += (adj.cyan / 100) * w;
        dm += (adj.magenta / 100) * w;
        dy += (adj.yellow / 100) * w;
        dk += (adj.black / 100) * w;
      } else {
        dc += (adj.cyan / 100) * (1 - c) * w;
        dm += (adj.magenta / 100) * (1 - m) * w;
        dy += (adj.yellow / 100) * (1 - y) * w;
        dk += (adj.black / 100) * (1 - k) * w;
      }
    }

    c = clamp(c + dc, 0, 1);
    m = clamp(m + dm, 0, 1);
    y = clamp(y + dy, 0, 1);
    const kAdj = clamp(dk, -1, 1);

    d[i]     = clamp((1 - c) * (1 - kAdj) * 255, 0, 255);
    d[i + 1] = clamp((1 - m) * (1 - kAdj) * 255, 0, 255);
    d[i + 2] = clamp((1 - y) * (1 - kAdj) * 255, 0, 255);
  }
  return result;
}

export interface ChannelMixerValues {
  outputRed:   { red: number; green: number; blue: number; constant: number };
  outputGreen: { red: number; green: number; blue: number; constant: number };
  outputBlue:  { red: number; green: number; blue: number; constant: number };
  monochrome: boolean;
}

/**
 * Channel Mixer — remap output channels from input channel percentages.
 * Each output channel = (R * red%) + (G * green%) + (B * blue%) + constant
 */
export function applyChannelMixer(
  imageData: ImageData,
  values: ChannelMixerValues
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;

  const rr = values.outputRed.red / 100,   rg = values.outputRed.green / 100,   rb = values.outputRed.blue / 100,   rc = values.outputRed.constant * 2.55;
  const gr = values.outputGreen.red / 100, gg = values.outputGreen.green / 100, gb = values.outputGreen.blue / 100, gc = values.outputGreen.constant * 2.55;
  const br = values.outputBlue.red / 100,  bg = values.outputBlue.green / 100,  bb = values.outputBlue.blue / 100,  bc = values.outputBlue.constant * 2.55;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];

    if (values.monochrome) {
      const gray = clamp(r * rr + g * rg + b * rb + rc, 0, 255);
      d[i] = gray;
      d[i + 1] = gray;
      d[i + 2] = gray;
    } else {
      d[i]     = clamp(r * rr + g * rg + b * rb + rc, 0, 255);
      d[i + 1] = clamp(r * gr + g * gg + b * gb + gc, 0, 255);
      d[i + 2] = clamp(r * br + g * bg + b * bb + bc, 0, 255);
    }
  }
  return result;
}

export interface GradientStop {
  position: number;  // 0.0 to 1.0
  color: { r: number; g: number; b: number };
}

/**
 * Gradient Map — maps pixel luminance to a user-defined gradient.
 * Dark pixels get colors from the left of the gradient, bright from the right.
 */
export function applyGradientMap(
  imageData: ImageData,
  stops: GradientStop[]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;

  // Sort stops by position
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return result;
  if (sorted[0].position > 0) sorted.unshift({ position: 0, color: sorted[0].color });
  if (sorted[sorted.length - 1].position < 1) sorted.push({ position: 1, color: sorted[sorted.length - 1].color });

  // Build 256-entry LUT for each channel
  const lutR = new Uint8ClampedArray(256);
  const lutG = new Uint8ClampedArray(256);
  const lutB = new Uint8ClampedArray(256);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    // Find surrounding stops
    let seg = sorted.length - 2;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (t <= sorted[j + 1].position) { seg = j; break; }
    }
    const range = sorted[seg + 1].position - sorted[seg].position;
    const localT = range > 0 ? (t - sorted[seg].position) / range : 0;

    lutR[i] = Math.round(sorted[seg].color.r + (sorted[seg + 1].color.r - sorted[seg].color.r) * localT);
    lutG[i] = Math.round(sorted[seg].color.g + (sorted[seg + 1].color.g - sorted[seg].color.g) * localT);
    lutB[i] = Math.round(sorted[seg].color.b + (sorted[seg + 1].color.b - sorted[seg].color.b) * localT);
  }

  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i]     = lutR[lum];
    d[i + 1] = lutG[lum];
    d[i + 2] = lutB[lum];
  }
  return result;
}

export type LutPreset = 'warm' | 'cool' | 'vintage' | 'cinematic' | 'noir' | 'cross-process' | 'bleach-bypass' | 'teal-orange';

/**
 * Apply a Color Lookup Table (LUT) adjustment.
 * Supports built-in presets or a custom 256-entry RGB lookup table.
 */
export function colorLookup(
  imageData: ImageData,
  preset: LutPreset = 'warm',
  intensity: number = 100,
  customLut?: Uint8ClampedArray
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const factor = clamp(intensity, 0, 100) / 100;

  // Generate LUT based on preset
  const lut = customLut || generatePresetLut(preset);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lutR = lut[r * 3];
    const lutG = lut[g * 3 + 1];
    const lutB = lut[b * 3 + 2];

    d[i]     = clamp(Math.round(r + (lutR - r) * factor), 0, 255);
    d[i + 1] = clamp(Math.round(g + (lutG - g) * factor), 0, 255);
    d[i + 2] = clamp(Math.round(b + (lutB - b) * factor), 0, 255);
    d[i + 3] = data[i + 3];
  }
  return result;
}

function generatePresetLut(preset: LutPreset): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = i, g = i, b = i;

    switch (preset) {
      case 'warm':
        r = clamp(Math.round(i * 1.1 + 10), 0, 255);
        g = clamp(Math.round(i * 1.02), 0, 255);
        b = clamp(Math.round(i * 0.9 - 5), 0, 255);
        break;
      case 'cool':
        r = clamp(Math.round(i * 0.9 - 5), 0, 255);
        g = clamp(Math.round(i * 1.0), 0, 255);
        b = clamp(Math.round(i * 1.1 + 10), 0, 255);
        break;
      case 'vintage':
        r = clamp(Math.round(i * 1.05 + 15), 0, 255);
        g = clamp(Math.round(i * 0.95 + 5), 0, 255);
        b = clamp(Math.round(i * 0.8), 0, 255);
        break;
      case 'cinematic':
        r = clamp(Math.round(i * 0.95), 0, 255);
        g = clamp(Math.round(i * 0.9), 0, 255);
        b = clamp(Math.round(i * 1.05 + 5), 0, 255);
        break;
      case 'noir': {
        const gray = Math.round(0.299 * i + 0.587 * i + 0.114 * i);
        const contrast = clamp(Math.round((gray - 128) * 1.3 + 128), 0, 255);
        r = g = b = contrast;
        break;
      }
      case 'cross-process':
        r = clamp(Math.round(255 * (0.5 + 0.6 * Math.sin(t * Math.PI - 0.2))), 0, 255);
        g = clamp(Math.round(255 * (0.3 + 0.7 * t)), 0, 255);
        b = clamp(Math.round(255 * (0.2 + 0.5 * Math.pow(t, 0.8))), 0, 255);
        break;
      case 'bleach-bypass': {
        const lum = Math.round(0.299 * i + 0.587 * i + 0.114 * i);
        r = clamp(Math.round((i + lum) / 2 * 1.1), 0, 255);
        g = clamp(Math.round((i + lum) / 2 * 1.0), 0, 255);
        b = clamp(Math.round((i + lum) / 2 * 0.95), 0, 255);
        break;
      }
      case 'teal-orange':
        r = clamp(Math.round(i * 1.15 + (t > 0.5 ? 10 : -10)), 0, 255);
        g = clamp(Math.round(i * 0.92 + (t > 0.5 ? -5 : 8)), 0, 255);
        b = clamp(Math.round(i * 0.85 + (t > 0.5 ? -15 : 20)), 0, 255);
        break;
    }

    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

/**
 * Transfer color statistics from a reference image to a target image.
 * Uses mean/std matching in Lab-approximated color space.
 */
export function colorTransfer(target: ImageData, reference: ImageData): ImageData {
  const tLab = rgbStatsToLabApprox(target.data);
  const rLab = rgbStatsToLabApprox(reference.data);

  const out = new ImageData(new Uint8ClampedArray(target.data), target.width, target.height);
  const od = out.data;

  for (let i = 0; i < od.length; i += 4) {
    // Shift each channel: (pixel - targetMean) * (refStd / targetStd) + refMean
    for (let c = 0; c < 3; c++) {
      const tStd = tLab.std[c] || 1;
      const val = (od[i + c] - tLab.mean[c]) * (rLab.std[c] / tStd) + rLab.mean[c];
      od[i + c] = clamp(Math.round(val), 0, 255);
    }
  }
  return out;
}

function rgbStatsToLabApprox(data: Uint8ClampedArray): { mean: number[]; std: number[] } {
  const n = data.length / 4;
  const sum = [0, 0, 0], sum2 = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      sum[c] += data[i + c];
      sum2[c] += data[i + c] * data[i + c];
    }
  }
  const mean = sum.map(s => s / n);
  const std = sum.map((_s, c) => Math.sqrt(Math.max(0, sum2[c] / n - mean[c] * mean[c])));
  return { mean, std };
}
