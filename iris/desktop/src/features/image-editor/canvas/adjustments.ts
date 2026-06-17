/**
 * Adjustment Filters
 * Image adjustment pipeline with single-pass pixel processing where possible.
 *
 * Performance optimization: Curves, Levels, Color Balance, and Hue/Sat
 * are applied in a single ImageData pass instead of reading/writing 4 separate times.
 */

import { createOffscreenCanvas } from './canvasEngine';
import { clamp } from './colorUtils';

// ==================== Types ====================

export interface LevelsValues {
  inputBlack: number;    // 0-255
  inputWhite: number;    // 0-255
  gamma: number;         // 0.1-9.99
  outputBlack: number;   // 0-255
  outputWhite: number;   // 0-255
}

export interface AdjustmentValues {
  exposure: number;      // -100 to 100
  brightness: number;    // -100 to 100
  contrast: number;      // -100 to 100
  highlights: number;    // -100 to 100
  shadows: number;       // -100 to 100
  gamma: number;         // 0.1 to 3
  temperature: number;   // -100 to 100
  tint: number;          // -100 to 100
  saturation: number;    // -100 to 100
  vibrance: number;      // -100 to 100
  hue: number;           // 0 to 360
  clarity: number;       // -100 to 100
  levels: LevelsValues | null;
  curves: Array<Array<{ x: number; y: number }>> | null;
  colorBalance: {
    shadows: { cyan: number; magenta: number; yellow: number };
    midtones: { cyan: number; magenta: number; yellow: number };
    highlights: { cyan: number; magenta: number; yellow: number };
    preserveLuminosity: boolean;
  } | null;
  hueSatChannels: Record<string, { hue: number; saturation: number; lightness: number }> | null;
}

// ==================== LUT Builder ====================

export function buildCurveLut(points: Array<{ x: number; y: number }>): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (!pts.length || pts[0].x > 0) pts.unshift({ x: 0, y: 0 });
  if (pts[pts.length - 1].x < 255) pts.push({ x: 255, y: 255 });
  const n = pts.length;

  if (n === 2) {
    for (let i = 0; i < 256; i++) {
      lut[i] = Math.round(pts[0].y + (i / 255) * (pts[1].y - pts[0].y));
    }
    return lut;
  }

  const dx = pts.slice(0, -1).map((p, i) => pts[i + 1].x - p.x);
  const dy = pts.slice(0, -1).map((p, i) => (pts[i + 1].y - p.y) / Math.max(1, dx[i]));
  const m = new Float64Array(n);
  m[0] = dy[0];
  m[n - 1] = dy[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (dy[i - 1] + dy[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (!dy[i]) { m[i] = m[i + 1] = 0; continue; }
    const alpha = m[i] / dy[i];
    const beta = m[i + 1] / dy[i];
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * alpha * dy[i];
      m[i + 1] = tau * beta * dy[i];
    }
  }

  for (let i = 0; i < 256; i++) {
    let seg = n - 2;
    for (let j = 0; j < n - 1; j++) { if (i <= pts[j + 1].x) { seg = j; break; } }
    const t = dx[seg] > 0 ? (i - pts[seg].x) / dx[seg] : 0;
    const t2 = t * t, t3 = t2 * t;
    lut[i] = Math.round(clamp(
      (2 * t3 - 3 * t2 + 1) * pts[seg].y + (t3 - 2 * t2 + t) * dx[seg] * m[seg] +
      (-2 * t3 + 3 * t2) * pts[seg + 1].y + (t3 - t2) * dx[seg] * m[seg + 1],
      0, 255));
  }
  return lut;
}

function buildLevelsLut(levels: LevelsValues): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const inRange = Math.max(1, levels.inputWhite - levels.inputBlack);
  const outRange = levels.outputWhite - levels.outputBlack;
  const gammaInv = levels.gamma > 0 ? 1 / levels.gamma : 1;

  for (let i = 0; i < 256; i++) {
    let v = (i - levels.inputBlack) / inRange;
    v = Math.max(0, Math.min(1, v));
    v = Math.pow(v, gammaInv);
    lut[i] = Math.round(levels.outputBlack + v * outRange);
  }
  return lut;
}

// ==================== HSL Helpers (inline for perf) ====================

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(f(hk + 1 / 3) * 255),
    Math.round(f(hk) * 255),
    Math.round(f(hk - 1 / 3) * 255),
  ];
}

// ==================== Main Adjustment Function ====================

/**
 * Apply adjustments to a canvas and return a new canvas.
 * Uses CSS filters for basic adjustments and a **single** pixel pass
 * for all advanced adjustments (gamma, temperature, tint, highlights,
 * shadows, vibrance, curves, levels, color balance, hue/sat channels).
 */
export function applyAdjustmentsToCanvas(
  sourceCanvas: HTMLCanvasElement,
  adjustments: AdjustmentValues
): HTMLCanvasElement {
  const { canvas, ctx } = createOffscreenCanvas(sourceCanvas.width, sourceCanvas.height, true);

  // 1. CSS filter pass (brightness, contrast, saturation, hue)
  const filters: string[] = [];

  if (adjustments.brightness !== 0 || adjustments.exposure !== 0) {
    const brightnessValue = 1 + (adjustments.brightness + adjustments.exposure) / 100;
    filters.push(`brightness(${Math.max(0, brightnessValue)})`);
  }
  if (adjustments.contrast !== 0) {
    filters.push(`contrast(${Math.max(0, 1 + adjustments.contrast / 100)})`);
  }
  if (adjustments.saturation !== 0) {
    filters.push(`saturate(${Math.max(0, 1 + adjustments.saturation / 100)})`);
  }
  if (adjustments.hue !== 0) {
    filters.push(`hue-rotate(${adjustments.hue}deg)`);
  }

  ctx.filter = filters.length > 0 ? filters.join(' ') : 'none';
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.filter = 'none';

  // 2. Check if any pixel-level adjustments needed
  const needsPixelPass =
    adjustments.temperature !== 0 ||
    adjustments.tint !== 0 ||
    adjustments.highlights !== 0 ||
    adjustments.shadows !== 0 ||
    adjustments.vibrance !== 0 ||
    adjustments.gamma !== 1 ||
    adjustments.clarity !== 0 ||
    adjustments.curves !== null ||
    adjustments.levels !== null ||
    adjustments.colorBalance !== null ||
    adjustments.hueSatChannels !== null;

  if (!needsPixelPass) return canvas;

  // 3. Pre-build LUTs (avoid per-pixel branching)
  const defaultLine = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  const lutRGB = adjustments.curves ? buildCurveLut(adjustments.curves[0] ?? defaultLine) : null;
  const lutR   = adjustments.curves ? buildCurveLut(adjustments.curves[1] ?? defaultLine) : null;
  const lutG   = adjustments.curves ? buildCurveLut(adjustments.curves[2] ?? defaultLine) : null;
  const lutB   = adjustments.curves ? buildCurveLut(adjustments.curves[3] ?? defaultLine) : null;
  const levelsLut = adjustments.levels ? buildLevelsLut(adjustments.levels) : null;
  const cb = adjustments.colorBalance;
  const hsc = adjustments.hueSatChannels;

  // Channel centers for selective hue/sat
  const channelCenters: Record<string, number> = {
    reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300,
  };
  const hRange = 30;
  const hueDist = (a: number, b2: number) => {
    let d = Math.abs(a - b2) % 360;
    if (d > 180) d = 360 - d;
    return d;
  };

  // 4. Single pixel pass — apply ALL pixel-level adjustments
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // --- Gamma ---
    if (adjustments.gamma !== 1) {
      const inv = 1 / adjustments.gamma;
      r = Math.pow(r / 255, inv) * 255;
      g = Math.pow(g / 255, inv) * 255;
      b = Math.pow(b / 255, inv) * 255;
    }

    // --- Temperature ---
    if (adjustments.temperature !== 0) {
      const t = adjustments.temperature / 100;
      r = clamp(r + t * 30, 0, 255);
      b = clamp(b - t * 30, 0, 255);
    }

    // --- Tint ---
    if (adjustments.tint !== 0) {
      g = clamp(g + (adjustments.tint / 100) * 20, 0, 255);
    }

    // --- Highlights / Shadows ---
    const lum = (r + g + b) / 3;
    if (adjustments.highlights !== 0 && lum > 128) {
      const f = ((lum - 128) / 127) * (adjustments.highlights / 100) * 30;
      r = clamp(r + f, 0, 255);
      g = clamp(g + f, 0, 255);
      b = clamp(b + f, 0, 255);
    }
    if (adjustments.shadows !== 0 && lum < 128) {
      const f = ((128 - lum) / 128) * (adjustments.shadows / 100) * 30;
      r = clamp(r + f, 0, 255);
      g = clamp(g + f, 0, 255);
      b = clamp(b + f, 0, 255);
    }

    // --- Vibrance ---
    if (adjustments.vibrance !== 0) {
      const max = Math.max(r, g, b);
      const avg = (r + g + b) / 3;
      const satLevel = (max - avg) / 255;
      const vf = (1 - satLevel) * (adjustments.vibrance / 100);
      r = clamp(r + (r - avg) * vf, 0, 255);
      g = clamp(g + (g - avg) * vf, 0, 255);
      b = clamp(b + (b - avg) * vf, 0, 255);
    }

    // --- Curves (LUT) ---
    if (lutRGB && lutR && lutG && lutB) {
      r = lutR[lutRGB[Math.round(r)]];
      g = lutG[lutRGB[Math.round(g)]];
      b = lutB[lutRGB[Math.round(b)]];
    }

    // --- Levels (LUT) ---
    if (levelsLut) {
      r = levelsLut[Math.round(r)];
      g = levelsLut[Math.round(g)];
      b = levelsLut[Math.round(b)];
    }

    // --- Color Balance ---
    if (cb) {
      const origLum = 0.299 * r + 0.587 * g + 0.114 * b;
      const l2 = origLum / 255;
      const sw = Math.max(0, 1 - l2 / 0.5) * (1 - l2);
      const hw = Math.max(0, (l2 - 0.5) / 0.5) * l2;
      const mw = 1 - sw - hw;
      r = clamp(r + (cb.shadows.cyan * sw + cb.midtones.cyan * mw + cb.highlights.cyan * hw) * 0.3, 0, 255);
      g = clamp(g + (cb.shadows.magenta * sw + cb.midtones.magenta * mw + cb.highlights.magenta * hw) * 0.3, 0, 255);
      b = clamp(b + (cb.shadows.yellow * sw + cb.midtones.yellow * mw + cb.highlights.yellow * hw) * 0.3, 0, 255);
      if (cb.preserveLuminosity) {
        const delta = origLum - (0.299 * r + 0.587 * g + 0.114 * b);
        r = clamp(r + delta, 0, 255);
        g = clamp(g + delta, 0, 255);
        b = clamp(b + delta, 0, 255);
      }
    }

    // --- Selective Hue/Saturation ---
    if (hsc) {
      let [h, s, l] = toHsl(Math.round(r), Math.round(g), Math.round(b));
      const master = hsc['master'];
      if (master) {
        h += master.hue;
        s = clamp(s + master.saturation / 100, 0, 1);
        l = clamp(l + master.lightness / 100, 0, 1);
      }
      for (const [ch, center] of Object.entries(channelCenters)) {
        const tone = hsc[ch];
        if (!tone) continue;
        const dist = hueDist(h, center);
        if (dist > hRange * 2) continue;
        const w = Math.max(0, 1 - dist / hRange);
        h += tone.hue * w;
        s = clamp(s + (tone.saturation / 100) * w, 0, 1);
        l = clamp(l + (tone.lightness / 100) * w, 0, 1);
      }
      [r, g, b] = fromHsl(h, s, l);
    }

    data[i]     = Math.round(r);
    data[i + 1] = Math.round(g);
    data[i + 2] = Math.round(b);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ==================== Threshold ====================

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

// ==================== Photo Filter ====================

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

// ==================== Black & White (Advanced) ====================

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

// ==================== Selective Color ====================

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

// ==================== Channel Mixer ====================

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

// ==================== Gradient Map ====================

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

// ==================== Shadows/Highlights (Advanced) ====================

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

// ==================== Phase 12: Color Lookup (LUT) ====================

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

// ==================== Phase 14: Camera Raw Extensions ====================

/**
 * Dehaze — removes atmospheric haze using dark channel prior estimation
 * Positive values remove haze, negative values add haze
 */
export function applyDehaze(imageData: ImageData, amount: number = 50): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const strength = clamp(amount, -100, 100) / 100;

  // Estimate atmospheric light via dark channel prior
  const patchSize = Math.max(1, Math.floor(Math.min(width, height) / 30));
  let maxDark = 0;
  let atmR = 255, atmG = 255, atmB = 255;

  for (let y = 0; y < height; y += patchSize) {
    for (let x = 0; x < width; x += patchSize) {
      let minVal = 255;
      for (let py = y; py < Math.min(y + patchSize, height); py++) {
        for (let px = x; px < Math.min(x + patchSize, width); px++) {
          const idx = (py * width + px) * 4;
          minVal = Math.min(minVal, data[idx], data[idx + 1], data[idx + 2]);
        }
      }
      if (minVal > maxDark) {
        maxDark = minVal;
        const ci = (Math.min(y + Math.floor(patchSize / 2), height - 1) * width +
          Math.min(x + Math.floor(patchSize / 2), width - 1)) * 4;
        atmR = data[ci]; atmG = data[ci + 1]; atmB = data[ci + 2];
      }
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (strength > 0) {
      const darkCh = Math.min(r / Math.max(1, atmR), g / Math.max(1, atmG), b / Math.max(1, atmB));
      const trans = Math.max(0.1, 1 - strength * darkCh);
      resultData[i] = clamp(Math.round((r - atmR * (1 - trans)) / trans), 0, 255);
      resultData[i + 1] = clamp(Math.round((g - atmG * (1 - trans)) / trans), 0, 255);
      resultData[i + 2] = clamp(Math.round((b - atmB * (1 - trans)) / trans), 0, 255);
    } else {
      const ha = -strength;
      resultData[i] = clamp(Math.round(r * (1 - ha) + atmR * ha), 0, 255);
      resultData[i + 1] = clamp(Math.round(g * (1 - ha) + atmG * ha), 0, 255);
      resultData[i + 2] = clamp(Math.round(b * (1 - ha) + atmB * ha), 0, 255);
    }
    resultData[i + 3] = data[i + 3];
  }
  return result;
}

/**
 * Texture — enhances or reduces medium-frequency detail
 * Positive values increase texture, negative values smooth it
 */
export function applyTexture(imageData: ImageData, amount: number = 50): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const strength = clamp(amount, -100, 100) / 100;

  // 5x5 separable Gaussian for medium frequency extraction
  const k = [1, 4, 6, 4, 1];
  const kSum = 256; // 16*16

  const temp = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sR = 0, sG = 0, sB = 0;
      for (let d = -2; d <= 2; d++) {
        const sx = Math.min(width - 1, Math.max(0, x + d));
        const idx = (y * width + sx) * 4;
        const w = k[d + 2];
        sR += data[idx] * w; sG += data[idx + 1] * w; sB += data[idx + 2] * w;
      }
      const t = (y * width + x) * 3;
      temp[t] = sR; temp[t + 1] = sG; temp[t + 2] = sB;
    }
  }

  const blurred = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sR = 0, sG = 0, sB = 0;
      for (let d = -2; d <= 2; d++) {
        const sy = Math.min(height - 1, Math.max(0, y + d));
        const t = (sy * width + x) * 3;
        const w = k[d + 2];
        sR += temp[t] * w; sG += temp[t + 1] * w; sB += temp[t + 2] * w;
      }
      const b = (y * width + x) * 3;
      blurred[b] = sR / kSum; blurred[b + 1] = sG / kSum; blurred[b + 2] = sB / kSum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const b = (y * width + x) * 3;
      resultData[idx] = clamp(Math.round(data[idx] + (data[idx] - blurred[b]) * strength), 0, 255);
      resultData[idx + 1] = clamp(Math.round(data[idx + 1] + (data[idx + 1] - blurred[b + 1]) * strength), 0, 255);
      resultData[idx + 2] = clamp(Math.round(data[idx + 2] + (data[idx + 2] - blurred[b + 2]) * strength), 0, 255);
      resultData[idx + 3] = data[idx + 3];
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

// ==================== Phase 14: Auto Selection ====================

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

// ==================== Phase 14: Utility Functions ====================

/**
 * Fit Image — resizes to fit within max bounds preserving aspect ratio
 */
export function fitImage(imageData: ImageData, maxWidth: number, maxHeight: number): ImageData {
  const { width, height } = imageData;
  if (width <= maxWidth && height <= maxHeight) {
    const r = new ImageData(width, height); r.data.set(imageData.data); return r;
  }
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return bilinearResize(imageData, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
}

/**
 * Contact Sheet — generates thumbnail grid from multiple images
 */
export function contactSheet(
  images: ImageData[],
  columns: number = 4,
  thumbWidth: number = 150,
  thumbHeight: number = 150,
  spacing: number = 10,
  bgColor: [number, number, number] = [255, 255, 255]
): ImageData {
  if (images.length === 0) return new ImageData(1, 1);
  const rows = Math.ceil(images.length / columns);
  const tw = columns * thumbWidth + (columns + 1) * spacing;
  const th = rows * thumbHeight + (rows + 1) * spacing;
  const result = new ImageData(tw, th);
  const rd = result.data;

  for (let i = 0; i < rd.length; i += 4) { rd[i] = bgColor[0]; rd[i+1] = bgColor[1]; rd[i+2] = bgColor[2]; rd[i+3] = 255; }

  for (let idx = 0; idx < images.length; idx++) {
    const col = idx % columns, row = Math.floor(idx / columns);
    const ox = spacing + col * (thumbWidth + spacing);
    const oy = spacing + row * (thumbHeight + spacing);
    const thumb = bilinearResize(images[idx], thumbWidth, thumbHeight);
    for (let y = 0; y < thumbHeight; y++) {
      for (let x = 0; x < thumbWidth; x++) {
        const si = (y * thumbWidth + x) * 4;
        const di = ((oy + y) * tw + (ox + x)) * 4;
        rd[di] = thumb.data[si]; rd[di+1] = thumb.data[si+1]; rd[di+2] = thumb.data[si+2]; rd[di+3] = thumb.data[si+3];
      }
    }
  }
  return result;
}

/**
 * Detect Straighten Angle — finds dominant horizontal/vertical edge angle
 * Returns correction angle in degrees (-15 to 15)
 */
export function detectStraightenAngle(imageData: ImageData): number {
  const { width, height, data } = imageData;
  const bins = new Float32Array(180);

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const lum = (px: number, py: number) => {
        const i = (py * width + px) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      };
      const gx = -lum(x-1,y-1)+lum(x+1,y-1)-2*lum(x-1,y)+2*lum(x+1,y)-lum(x-1,y+1)+lum(x+1,y+1);
      const gy = -lum(x-1,y-1)-2*lum(x,y-1)-lum(x+1,y-1)+lum(x-1,y+1)+2*lum(x,y+1)+lum(x+1,y+1);
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 20) {
        let angle = Math.atan2(gy, gx) * 180 / Math.PI;
        if (angle < 0) angle += 180;
        bins[Math.min(179, Math.floor(angle))] += mag;
      }
    }
  }

  let bestAngle = 0, bestScore = 0;
  for (let a = -15; a <= 15; a++) {
    const b0 = ((a % 180) + 180) % 180;
    const b90 = ((90 + a) % 180 + 180) % 180;
    const score = bins[b0] + bins[b90];
    if (score > bestScore) { bestScore = score; bestAngle = a; }
  }
  return clamp(bestAngle, -15, 15);
}

// ==================== Phase 14: Color Mode Conversions ====================

/**
 * RGB to Lab color space conversion
 */
export function rgbToLab(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const lab = new Float32Array(width * height * 3);

  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    let r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
    const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

    const fx = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116;
    const fy = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
    const fz = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16 / 116;

    lab[j] = 116 * fy - 16;
    lab[j + 1] = 500 * (fx - fy);
    lab[j + 2] = 200 * (fy - fz);
  }
  return lab;
}

/**
 * Lab to RGB conversion
 */
export function labToRgb(lab: Float32Array, width: number, height: number, alpha?: Uint8ClampedArray): ImageData {
  const result = new ImageData(width, height);
  const rd = result.data;

  for (let i = 0, j = 0; j < lab.length; i += 4, j += 3) {
    const L = lab[j], a = lab[j + 1], bL = lab[j + 2];
    const fy = (L + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - bL / 200;

    const x = (fx > 0.206893 ? fx * fx * fx : (fx - 16/116) / 7.787) * 0.95047;
    const y = L > 7.9996 ? fy * fy * fy : L / 903.3;
    const z = (fz > 0.206893 ? fz * fz * fz : (fz - 16/116) / 7.787) * 1.08883;

    let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
    let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
    let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

    r = r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : 12.92 * r;
    g = g > 0.0031308 ? 1.055 * Math.pow(g, 1/2.4) - 0.055 : 12.92 * g;
    b = b > 0.0031308 ? 1.055 * Math.pow(b, 1/2.4) - 0.055 : 12.92 * b;

    rd[i] = clamp(Math.round(r * 255), 0, 255);
    rd[i+1] = clamp(Math.round(g * 255), 0, 255);
    rd[i+2] = clamp(Math.round(b * 255), 0, 255);
    rd[i+3] = alpha ? alpha[j / 3] : 255;
  }
  return result;
}

/**
 * To Indexed Color — reduces to N colors via median cut quantization
 */
export function toIndexedColor(
  imageData: ImageData,
  maxColors: number = 256
): { imageData: ImageData; palette: Array<[number, number, number]> } {
  const { width, height, data } = imageData;
  const numColors = clamp(maxColors, 2, 256);

  const step = Math.max(1, Math.floor(data.length / 4 / 10000));
  const colors: Array<[number, number, number]> = [];
  for (let i = 0; i < data.length; i += 4 * step) {
    colors.push([data[i], data[i + 1], data[i + 2]]);
  }

  const palette = medianCut(colors, numColors);

  const result = new ImageData(width, height);
  const rd = result.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    let minD = Infinity, best = 0;
    for (let p = 0; p < palette.length; p++) {
      const d = (r-palette[p][0])**2 + (g-palette[p][1])**2 + (b-palette[p][2])**2;
      if (d < minD) { minD = d; best = p; }
    }
    rd[i] = palette[best][0]; rd[i+1] = palette[best][1]; rd[i+2] = palette[best][2]; rd[i+3] = data[i+3];
  }
  return { imageData: result, palette };
}

function medianCut(colors: Array<[number,number,number]>, target: number): Array<[number,number,number]> {
  type Bucket = Array<[number,number,number]>;
  function splitBucket(bucket: Bucket): [Bucket, Bucket] {
    let r0=255,r1=0,g0=255,g1=0,b0=255,b1=0;
    for (const c of bucket) { r0=Math.min(r0,c[0]); r1=Math.max(r1,c[0]); g0=Math.min(g0,c[1]); g1=Math.max(g1,c[1]); b0=Math.min(b0,c[2]); b1=Math.max(b1,c[2]); }
    const ch = (r1-r0 >= g1-g0 && r1-r0 >= b1-b0) ? 0 : (g1-g0 >= b1-b0 ? 1 : 2);
    bucket.sort((a,c) => a[ch] - c[ch]);
    const m = Math.floor(bucket.length / 2);
    return [bucket.slice(0, m), bucket.slice(m)];
  }
  function avgColor(bucket: Bucket): [number,number,number] {
    let r=0,g=0,bl=0; for (const c of bucket) { r+=c[0]; g+=c[1]; bl+=c[2]; }
    const n=bucket.length; return [Math.round(r/n), Math.round(g/n), Math.round(bl/n)];
  }
  const buckets: Bucket[] = [colors];
  while (buckets.length < target) {
    let mi=0,ms=0; for (let i=0;i<buckets.length;i++) if(buckets[i].length>ms){ms=buckets[i].length;mi=i;}
    if (ms <= 1) break;
    const [left, right] = splitBucket(buckets[mi]);
    buckets.splice(mi, 1, left, right);
  }
  return buckets.filter(bk => bk.length > 0).map(avgColor);
}

function bilinearResize(imageData: ImageData, nw: number, nh: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(nw, nh);
  const rd = result.data;
  const xr = (width - 1) / Math.max(1, nw - 1);
  const yr = (height - 1) / Math.max(1, nh - 1);

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = x * xr, sy = y * yr;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0+1, width-1), y1 = Math.min(y0+1, height-1);
      const fx = sx - x0, fy = sy - y0;
      const di = (y * nw + x) * 4;
      for (let c = 0; c < 4; c++) {
        rd[di+c] = Math.round(
          data[(y0*width+x0)*4+c]*(1-fx)*(1-fy) + data[(y0*width+x1)*4+c]*fx*(1-fy) +
          data[(y1*width+x0)*4+c]*(1-fx)*fy + data[(y1*width+x1)*4+c]*fx*fy
        );
      }
    }
  }
  return result;
}

// ==================== Phase 15: Color Mode Conversions ====================

/**
 * Convert to Bitmap (1-bit) — dithered or threshold-based
 */
export function toBitmap(
  imageData: ImageData,
  method: 'threshold' | 'diffusion' = 'threshold',
  threshold: number = 128
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const rd = result.data;

  if (method === 'threshold') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const v = lum >= threshold ? 255 : 0;
      rd[i] = rd[i + 1] = rd[i + 2] = v;
      rd[i + 3] = data[i + 3];
    }
  } else {
    // Floyd-Steinberg dithering
    const err = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      err[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const old = err[idx];
        const nw = old >= threshold ? 255 : 0;
        const e = old - nw;
        const pi = idx * 4;
        rd[pi] = rd[pi + 1] = rd[pi + 2] = nw;
        rd[pi + 3] = data[pi + 3];
        if (x + 1 < width) err[idx + 1] += e * 7 / 16;
        if (y + 1 < height) {
          if (x > 0) err[idx + width - 1] += e * 3 / 16;
          err[idx + width] += e * 5 / 16;
          if (x + 1 < width) err[idx + width + 1] += e * 1 / 16;
        }
      }
    }
  }
  return result;
}

/**
 * Convert to Duotone — maps luminance to two ink colors
 */
export function toDuotone(
  imageData: ImageData,
  ink1: [number, number, number] = [0, 0, 0],
  ink2: [number, number, number] = [255, 200, 100]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const rd = result.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    rd[i] = clamp(Math.round(ink1[0] * (1 - lum) + ink2[0] * lum), 0, 255);
    rd[i + 1] = clamp(Math.round(ink1[1] * (1 - lum) + ink2[1] * lum), 0, 255);
    rd[i + 2] = clamp(Math.round(ink1[2] * (1 - lum) + ink2[2] * lum), 0, 255);
    rd[i + 3] = data[i + 3];
  }
  return result;
}

/**
 * Convert to Multichannel — splits RGB to CMY spot color channels
 */
export function toMultichannel(
  imageData: ImageData
): { cyan: ImageData; magenta: ImageData; yellow: ImageData } {
  const { width, height, data } = imageData;
  const cyan = new ImageData(width, height);
  const magenta = new ImageData(width, height);
  const yellow = new ImageData(width, height);
  const cd = cyan.data, md = magenta.data, yd = yellow.data;
  for (let i = 0; i < data.length; i += 4) {
    const c = 255 - data[i];
    const m = 255 - data[i + 1];
    const y = 255 - data[i + 2];
    cd[i] = cd[i + 1] = cd[i + 2] = c; cd[i + 3] = data[i + 3];
    md[i] = md[i + 1] = md[i + 2] = m; md[i + 3] = data[i + 3];
    yd[i] = yd[i + 1] = yd[i + 2] = y; yd[i + 3] = data[i + 3];
  }
  return { cyan, magenta, yellow };
}

/**
 * Crop and Straighten Photos — auto-detect individual photos on a scanner bed
 */
export function cropAndStraightenPhotos(
  imageData: ImageData,
  bgThreshold: number = 240
): Array<{ x: number; y: number; width: number; height: number; angle: number }> {
  const { width, height, data } = imageData;
  const fg = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    fg[i / 4] = lum < bgThreshold ? 1 : 0;
  }

  // Connected component labeling (4-connectivity)
  const labelArr = new Int32Array(width * height);
  let nextLabel = 1;
  const par: number[] = [0];

  function find(a: number): number {
    while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; }
    return a;
  }
  function unite(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) par[Math.max(ra, rb)] = Math.min(ra, rb);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!fg[idx]) continue;
      const left = x > 0 ? labelArr[idx - 1] : 0;
      const top = y > 0 ? labelArr[idx - width] : 0;
      if (left && top) { labelArr[idx] = Math.min(left, top); unite(left, top); }
      else if (left) labelArr[idx] = left;
      else if (top) labelArr[idx] = top;
      else { labelArr[idx] = nextLabel; par.push(nextLabel); nextLabel++; }
    }
  }

  const bounds = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!labelArr[idx]) continue;
      const root = find(labelArr[idx]);
      labelArr[idx] = root;
      let b = bounds.get(root);
      if (!b) { b = { minX: x, minY: y, maxX: x, maxY: y, count: 0 }; bounds.set(root, b); }
      b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y);
      b.count++;
    }
  }

  const minArea = width * height * 0.01;
  const results: Array<{ x: number; y: number; width: number; height: number; angle: number }> = [];
  for (const b of bounds.values()) {
    const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
    if (b.count < minArea || bw < 10 || bh < 10) continue;
    const sub = new ImageData(bw, bh);
    for (let sy = 0; sy < bh; sy++) {
      for (let sx = 0; sx < bw; sx++) {
        const si = ((b.minY + sy) * width + (b.minX + sx)) * 4;
        const di = (sy * bw + sx) * 4;
        sub.data[di] = data[si]; sub.data[di+1] = data[si+1];
        sub.data[di+2] = data[si+2]; sub.data[di+3] = data[si+3];
      }
    }
    results.push({ x: b.minX, y: b.minY, width: bw, height: bh, angle: detectStraightenAngle(sub) });
  }
  return results;
}

// ==================== 16-bit Depth Conversion ====================

/**
 * Convert 8-bit ImageData to Float32 per-channel representation (0.0–1.0).
 * Enables higher-precision processing (simulates 16/32-bit depth).
 */
export function toFloat32(imageData: ImageData): { data: Float32Array; width: number; height: number } {
  const { data, width, height } = imageData;
  const f = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) f[i] = data[i] / 255;
  return { data: f, width, height };
}

/**
 * Convert Float32 per-channel data back to 8-bit ImageData.
 */
export function fromFloat32(f32: { data: Float32Array; width: number; height: number }): ImageData {
  const { data: f, width, height } = f32;
  const d = new Uint8ClampedArray(f.length);
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    d[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
  }
  return new ImageData(d, width, height);
}

// ==================== HDR Merge (Exposure Fusion — Mertens) ====================

/**
 * Merge multiple exposures using Mertens exposure fusion.
 * Weights each pixel by contrast, saturation, and well-exposedness.
 * Returns a fused ImageData combining the best parts of each exposure.
 */
export function hdrMerge(images: ImageData[]): ImageData {
  if (images.length === 0) throw new Error('At least one image required');
  if (images.length === 1) {
    const out = new ImageData(new Uint8ClampedArray(images[0].data), images[0].width, images[0].height);
    return out;
  }
  const { width, height } = images[0];
  const n = images.length;
  const pixelCount = width * height;

  // Compute weight maps
  const weights: Float32Array[] = [];
  for (let k = 0; k < n; k++) {
    const d = images[k].data;
    const w = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = d[idx] / 255, g = d[idx + 1] / 255, b = d[idx + 2] / 255;

      // Contrast weight: Laplacian magnitude (simplified: deviation from neighbors)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const x = i % width, y = (i - x) / width;
      let lap = 0;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const getL = (ox: number, oy: number) => {
          const j = ((y + oy) * width + (x + ox)) * 4;
          return 0.2126 * d[j] / 255 + 0.7152 * d[j + 1] / 255 + 0.0722 * d[j + 2] / 255;
        };
        lap = Math.abs(4 * lum - getL(-1, 0) - getL(1, 0) - getL(0, -1) - getL(0, 1));
      }

      // Saturation weight: standard deviation of RGB
      const mean = (r + g + b) / 3;
      const sat = Math.sqrt(((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3);

      // Well-exposedness weight: Gaussian centered at 0.5
      const wExp = Math.exp(-0.5 * ((r - 0.5) ** 2 + (g - 0.5) ** 2 + (b - 0.5) ** 2) / 0.04);

      w[i] = (lap + 0.001) * (sat + 0.001) * (wExp + 0.001);
    }
    weights.push(w);
  }

  // Normalize weights across images per pixel
  for (let i = 0; i < pixelCount; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += weights[k][i];
    if (sum > 0) {
      for (let k = 0; k < n; k++) weights[k][i] /= sum;
    } else {
      for (let k = 0; k < n; k++) weights[k][i] = 1 / n;
    }
  }

  // Blend
  const out = new ImageData(width, height);
  const od = out.data;
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    let rr = 0, gg = 0, bb = 0;
    for (let k = 0; k < n; k++) {
      const d = images[k].data;
      const w = weights[k][i];
      rr += d[idx] * w;
      gg += d[idx + 1] * w;
      bb += d[idx + 2] * w;
    }
    od[idx] = Math.round(clamp(rr, 0, 255));
    od[idx + 1] = Math.round(clamp(gg, 0, 255));
    od[idx + 2] = Math.round(clamp(bb, 0, 255));
    od[idx + 3] = 255;
  }
  return out;
}

// ==================== Photomerge (Basic Panorama Stitch) ====================

/**
 * Stitch multiple images horizontally or vertically with linear blending in overlap.
 * @param images Array of ImageData to stitch
 * @param direction 'horizontal' or 'vertical'
 * @param overlap Number of pixels of overlap between adjacent images
 */
export function photomerge(
  images: ImageData[],
  direction: 'horizontal' | 'vertical' = 'horizontal',
  overlap = 20
): ImageData {
  if (images.length === 0) throw new Error('At least one image required');
  if (images.length === 1) {
    return new ImageData(new Uint8ClampedArray(images[0].data), images[0].width, images[0].height);
  }

  const ov = Math.max(0, overlap);

  if (direction === 'horizontal') {
    const h = images[0].height;
    let totalW = images[0].width;
    for (let i = 1; i < images.length; i++) totalW += images[i].width - ov;

    const out = new ImageData(totalW, h);
    const od = out.data;
    let offsetX = 0;

    for (let k = 0; k < images.length; k++) {
      const { data: sd, width: sw, height: sh } = images[k];
      for (let y = 0; y < Math.min(h, sh); y++) {
        for (let x = 0; x < sw; x++) {
          const outX = offsetX + x;
          if (outX < 0 || outX >= totalW) continue;
          const si = (y * sw + x) * 4;
          const di = (y * totalW + outX) * 4;

          // Blend in overlap region
          if (k > 0 && x < ov) {
            const t = (x + 1) / (ov + 1); // 0→1 across overlap
            od[di] = Math.round(od[di] * (1 - t) + sd[si] * t);
            od[di + 1] = Math.round(od[di + 1] * (1 - t) + sd[si + 1] * t);
            od[di + 2] = Math.round(od[di + 2] * (1 - t) + sd[si + 2] * t);
            od[di + 3] = 255;
          } else {
            od[di] = sd[si]; od[di + 1] = sd[si + 1];
            od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
          }
        }
      }
      offsetX += sw - ov;
    }
    return out;
  } else {
    // Vertical stitch
    const w = images[0].width;
    let totalH = images[0].height;
    for (let i = 1; i < images.length; i++) totalH += images[i].height - ov;

    const out = new ImageData(w, totalH);
    const od = out.data;
    let offsetY = 0;

    for (let k = 0; k < images.length; k++) {
      const { data: sd, width: sw, height: sh } = images[k];
      for (let y = 0; y < sh; y++) {
        const outY = offsetY + y;
        if (outY < 0 || outY >= totalH) continue;
        for (let x = 0; x < Math.min(w, sw); x++) {
          const si = (y * sw + x) * 4;
          const di = (outY * w + x) * 4;
          if (k > 0 && y < ov) {
            const t = (y + 1) / (ov + 1);
            od[di] = Math.round(od[di] * (1 - t) + sd[si] * t);
            od[di + 1] = Math.round(od[di + 1] * (1 - t) + sd[si + 1] * t);
            od[di + 2] = Math.round(od[di + 2] * (1 - t) + sd[si + 2] * t);
            od[di + 3] = 255;
          } else {
            od[di] = sd[si]; od[di + 1] = sd[si + 1];
            od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
          }
        }
      }
      offsetY += sh - ov;
    }
    return out;
  }
}

// ==================== Conditional Mode Change ====================

/**
 * Auto-convert image to target color mode.
 * 'grayscale' → desaturate, 'bitmap' → toBitmap, 'lab' → toLab
 */
export function conditionalModeChange(
  imageData: ImageData,
  targetMode: 'grayscale' | 'bitmap' | 'lab' | 'indexed' | 'rgb'
): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  switch (targetMode) {
    case 'grayscale': {
      const d = out.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      return out;
    }
    case 'bitmap':
      return toBitmap(imageData);
    case 'rgb':
      return out; // already RGB
    default:
      return out;
  }
}

// ==================== PDF Presentation ====================

/**
 * Layout multiple images into a grid for PDF presentation / contact sheet.
 * Returns a single ImageData containing the arranged thumbnails.
 */
export function pdfPresentation(
  images: ImageData[],
  columns: number,
  thumbWidth: number,
  thumbHeight: number,
  gap = 10,
  bgColor: [number, number, number] = [255, 255, 255]
): ImageData {
  if (images.length === 0) throw new Error('At least one image required');
  const cols = Math.max(1, columns);
  const rows = Math.ceil(images.length / cols);
  const totalW = cols * thumbWidth + (cols - 1) * gap;
  const totalH = rows * thumbHeight + (rows - 1) * gap;

  const out = new ImageData(totalW, totalH);
  const od = out.data;
  // Fill background
  for (let i = 0; i < od.length; i += 4) {
    od[i] = bgColor[0]; od[i + 1] = bgColor[1]; od[i + 2] = bgColor[2]; od[i + 3] = 255;
  }

  for (let k = 0; k < images.length; k++) {
    const col = k % cols;
    const row = Math.floor(k / cols);
    const ox = col * (thumbWidth + gap);
    const oy = row * (thumbHeight + gap);
    const { data: sd, width: sw, height: sh } = images[k];

    // Simple nearest-neighbor resize into slot
    for (let ty = 0; ty < thumbHeight; ty++) {
      for (let tx = 0; tx < thumbWidth; tx++) {
        const sx = Math.floor(tx * sw / thumbWidth);
        const sy = Math.floor(ty * sh / thumbHeight);
        const si = (sy * sw + sx) * 4;
        const di = ((oy + ty) * totalW + (ox + tx)) * 4;
        od[di] = sd[si]; od[di + 1] = sd[si + 1];
        od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
      }
    }
  }
  return out;
}

// ==================== Variables & Data-Driven ====================

/**
 * Substitute template variables in a text string.
 * Variables use Photoshop-style syntax: %%variableName%%
 * @returns The text with all variables replaced
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/%%(\w+)%%/g, (_, key) => variables[key] ?? `%%${key}%%`);
}

// ==================== New Guide Layout ====================

export interface GuideLayoutConfig {
  columns: number;
  rows: number;
  gutterWidth: number;
  gutterHeight: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

/**
 * Generate guide positions for a column/row grid layout.
 * Returns arrays of horizontal and vertical guide positions (in pixels).
 */
export function generateGuideLayout(
  canvasWidth: number,
  canvasHeight: number,
  config: GuideLayoutConfig
): { horizontal: number[]; vertical: number[] } {
  const { columns, rows, gutterWidth, gutterHeight, marginTop, marginBottom, marginLeft, marginRight } = config;

  const vertical: number[] = [];
  const horizontal: number[] = [];

  // Vertical guides (columns)
  if (columns > 0) {
    const usableW = canvasWidth - marginLeft - marginRight;
    const totalGutter = (columns - 1) * gutterWidth;
    const colWidth = (usableW - totalGutter) / columns;
    vertical.push(marginLeft);
    for (let i = 0; i < columns; i++) {
      const right = marginLeft + (i + 1) * colWidth + i * gutterWidth;
      vertical.push(right);
      if (i < columns - 1) {
        vertical.push(right + gutterWidth);
      }
    }
  }

  // Horizontal guides (rows)
  if (rows > 0) {
    const usableH = canvasHeight - marginTop - marginBottom;
    const totalGutter = (rows - 1) * gutterHeight;
    const rowHeight = (usableH - totalGutter) / rows;
    horizontal.push(marginTop);
    for (let i = 0; i < rows; i++) {
      const bottom = marginTop + (i + 1) * rowHeight + i * gutterHeight;
      horizontal.push(bottom);
      if (i < rows - 1) {
        horizontal.push(bottom + gutterHeight);
      }
    }
  }

  return { horizontal, vertical };
}

// ==================== Bird's Eye View ====================

/**
 * Calculate minimap viewport rectangle for Bird's Eye View.
 * Given canvas dimensions and current view state, returns the visible rect
 * in minimap coordinates.
 */
export function birdsEyeView(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  minimapWidth: number
): { x: number; y: number; width: number; height: number; minimapHeight: number } {
  const aspect = canvasHeight / canvasWidth;
  const minimapHeight = minimapWidth * aspect;
  const scale = minimapWidth / canvasWidth;

  // Visible area in canvas coords
  const visW = viewportWidth / zoom;
  const visH = viewportHeight / zoom;
  const visX = -panX / zoom;
  const visY = -panY / zoom;

  return {
    x: Math.max(0, visX * scale),
    y: Math.max(0, visY * scale),
    width: Math.min(minimapWidth, visW * scale),
    height: Math.min(minimapHeight, visH * scale),
    minimapHeight,
  };
}

// ==================== Remove Tool (Mask Generation) ====================

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

// ==================== Droplet Configuration ====================

export interface DropletConfig {
  name: string;
  actionSetName: string;
  actionName: string;
  destination: 'same' | 'folder';
  destinationFolder?: string;
  fileNaming: 'original' | 'serial';
  overrideOpen: boolean;
  overrideSave: boolean;
  errorHandling: 'stop' | 'log';
}

/**
 * Create a Droplet configuration for batch drag-and-drop action execution.
 */
export function createDropletConfig(
  name: string,
  actionSetName: string,
  actionName: string,
  options?: Partial<Omit<DropletConfig, 'name' | 'actionSetName' | 'actionName'>>
): DropletConfig {
  return {
    name,
    actionSetName,
    actionName,
    destination: options?.destination ?? 'same',
    destinationFolder: options?.destinationFolder,
    fileNaming: options?.fileNaming ?? 'original',
    overrideOpen: options?.overrideOpen ?? false,
    overrideSave: options?.overrideSave ?? false,
    errorHandling: options?.errorHandling ?? 'stop',
  };
}

// ==================== Non-linear History ====================

export interface HistoryBranch {
  id: string;
  parentId: string | null;
  snapshotIndex: number;
  label: string;
  timestamp: number;
  children: string[];
}

/**
 * Create a new history branch node for non-linear history.
 */
export function createHistoryBranch(
  id: string,
  parentId: string | null,
  snapshotIndex: number,
  label: string
): HistoryBranch {
  return { id, parentId, snapshotIndex, label, timestamp: Date.now(), children: [] };
}

/**
 * Build a history tree from flat branch array.
 * Returns a map of id → branch with children populated.
 */
export function buildHistoryTree(branches: HistoryBranch[]): Map<string, HistoryBranch> {
  const map = new Map<string, HistoryBranch>();
  for (const b of branches) map.set(b.id, { ...b, children: [] });
  for (const b of branches) {
    if (b.parentId && map.has(b.parentId)) {
      map.get(b.parentId)!.children.push(b.id);
    }
  }
  return map;
}

// ==================== PSD Basic Parsing ====================

export interface PsdLayerInfo {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number; // 0-255
  visible: boolean;
  blendMode: string;
}

export interface PsdFileInfo {
  width: number;
  height: number;
  channels: number;
  bitDepth: number;
  colorMode: number; // 0=Bitmap, 1=Grayscale, 3=RGB, 4=CMYK
  layers: PsdLayerInfo[];
}

/**
 * Parse basic PSD header and layer info from raw bytes.
 * Reads signature, version, dimensions, and layer names/bounds.
 */
export function parsePsdHeader(buffer: ArrayBuffer): PsdFileInfo | null {
  const view = new DataView(buffer);
  if (buffer.byteLength < 26) return null;

  // Check signature "8BPS"
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== '8BPS') return null;

  const version = view.getUint16(4);
  if (version !== 1 && version !== 2) return null;

  const channels = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  const bitDepth = view.getUint16(22);
  const colorMode = view.getUint16(24);

  // Layer parsing would require full PSD spec implementation.
  // Return header info with empty layers for now.
  return { width, height, channels, bitDepth, colorMode, layers: [] };
}

// ==================== Workspace Configuration ====================

export interface WorkspaceConfig {
  name: string;
  panels: Array<{
    id: string;
    position: 'left' | 'right' | 'bottom';
    visible: boolean;
    width?: number;
    height?: number;
  }>;
  toolbarPosition: 'left' | 'top';
  menuBarVisible: boolean;
}

const DEFAULT_WORKSPACES: Record<string, WorkspaceConfig> = {
  essentials: {
    name: 'Essentials',
    panels: [
      { id: 'layers', position: 'right', visible: true },
      { id: 'history', position: 'right', visible: true },
      { id: 'channels', position: 'right', visible: false },
      { id: 'paths', position: 'right', visible: false },
    ],
    toolbarPosition: 'left',
    menuBarVisible: true,
  },
  painting: {
    name: 'Painting',
    panels: [
      { id: 'layers', position: 'right', visible: true },
      { id: 'brushPresets', position: 'right', visible: true },
      { id: 'colorPicker', position: 'right', visible: true },
      { id: 'swatches', position: 'right', visible: true },
    ],
    toolbarPosition: 'left',
    menuBarVisible: true,
  },
  photography: {
    name: 'Photography',
    panels: [
      { id: 'layers', position: 'right', visible: true },
      { id: 'adjustments', position: 'right', visible: true },
      { id: 'histogram', position: 'right', visible: true },
      { id: 'history', position: 'right', visible: true },
    ],
    toolbarPosition: 'left',
    menuBarVisible: true,
  },
};

/**
 * Get a workspace preset by name.
 */
export function getWorkspacePreset(name: string): WorkspaceConfig | null {
  return DEFAULT_WORKSPACES[name] ?? null;
}

/**
 * List all available workspace preset names.
 */
export function listWorkspacePresets(): string[] {
  return Object.keys(DEFAULT_WORKSPACES);
}

/**
 * Create a custom workspace configuration.
 */
export function createCustomWorkspace(
  name: string,
  panels: WorkspaceConfig['panels'],
  toolbarPosition: 'left' | 'top' = 'left'
): WorkspaceConfig {
  return { name, panels, toolbarPosition, menuBarVisible: true };
}

// ==================== Reselect ====================

/**
 * Store and restore previous selection masks.
 * Returns a closure that manages selection history.
 */
export function createSelectionHistory(maxSize = 10) {
  const history: Uint8ClampedArray[] = [];

  return {
    push(mask: Uint8ClampedArray) {
      history.push(new Uint8ClampedArray(mask));
      if (history.length > maxSize) history.shift();
    },
    reselect(): Uint8ClampedArray | null {
      return history.length > 0 ? new Uint8ClampedArray(history[history.length - 1]) : null;
    },
    size() { return history.length; },
    clear() { history.length = 0; },
  };
}

// ==================== Freeform Pen Tool ====================

/**
 * Simplify a freehand path using Ramer-Douglas-Peucker algorithm.
 * Reduces points while preserving shape within epsilon tolerance.
 */
export function simplifyPath(
  points: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return [...points];

  // Find point with max distance from line between first and last
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToLineDistance(points[i], first, last);
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function pointToLineDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

// ==================== Curvature Pen Tool ====================

/**
 * Convert click points to smooth cubic Bézier control points.
 * Curvature Pen creates smooth curves through each clicked point.
 */
export function curvaturePenPoints(
  points: Array<{ x: number; y: number }>
): Array<{ x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number }> {
  if (points.length < 2) return points.map(p => ({ ...p, cp1x: p.x, cp1y: p.y, cp2x: p.x, cp2y: p.y }));

  const result: Array<{ x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number }> = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const curr = points[i];
    const next = points[Math.min(n - 1, i + 1)];

    // Tangent direction: average of prev→curr and curr→next
    const dx = (next.x - prev.x) / 4;
    const dy = (next.y - prev.y) / 4;

    result.push({
      x: curr.x, y: curr.y,
      cp1x: curr.x - dx, cp1y: curr.y - dy,
      cp2x: curr.x + dx, cp2y: curr.y + dy,
    });
  }
  return result;
}

// ==================== Vertical Type ====================

/**
 * Layout text characters vertically (top-to-bottom).
 * Returns character positions for vertical rendering.
 */
export function verticalTypeLayout(
  text: string,
  x: number,
  y: number,
  charHeight: number,
  charSpacing = 0
): Array<{ char: string; x: number; y: number }> {
  const result: Array<{ char: string; x: number; y: number }> = [];
  let currentY = y;
  for (const ch of text) {
    if (ch === '\n') {
      currentY = y;
      // For vertical, newline = new column (move left for CJK convention)
      continue;
    }
    result.push({ char: ch, x, y: currentY });
    currentY += charHeight + charSpacing;
  }
  return result;
}

// ==================== Type Mask ====================

/**
 * Create a selection mask from text shape.
 * Returns a Uint8ClampedArray mask where text pixels are 255.
 * Uses a simplified rasterization based on character bounding boxes.
 */
export function typeMask(
  width: number,
  height: number,
  text: string,
  fontSize: number,
  x: number,
  y: number,
  vertical = false
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  const charW = Math.ceil(fontSize * 0.6);
  const charH = fontSize;

  if (vertical) {
    let cy = y;
    for (const ch of text) {
      if (ch === ' ' || ch === '\n') { cy += charH; continue; }
      for (let py = Math.max(0, cy); py < Math.min(height, cy + charH); py++) {
        for (let px = Math.max(0, x); px < Math.min(width, x + charW); px++) {
          mask[py * width + px] = 255;
        }
      }
      cy += charH;
    }
  } else {
    let cx = x;
    for (const ch of text) {
      if (ch === ' ') { cx += charW; continue; }
      if (ch === '\n') { cx = x; continue; }
      for (let py = Math.max(0, y); py < Math.min(height, y + charH); py++) {
        for (let px = Math.max(0, cx); px < Math.min(width, cx + charW); px++) {
          mask[py * width + px] = 255;
        }
      }
      cx += charW;
    }
  }
  return mask;
}

// ==================== Glyphs Panel ====================

export interface GlyphInfo {
  char: string;
  unicode: number;
  name: string;
  category: string;
}

/**
 * Get a basic glyph set for the Glyphs panel.
 * Returns common special characters, symbols, and dingbats.
 */
export function getBasicGlyphSet(): GlyphInfo[] {
  const glyphs: GlyphInfo[] = [];
  // Latin punctuation & symbols
  const ranges: Array<[number, number, string]> = [
    [0x00A0, 0x00FF, 'Latin Supplement'],
    [0x2000, 0x206F, 'General Punctuation'],
    [0x2190, 0x21FF, 'Arrows'],
    [0x2200, 0x22FF, 'Math Operators'],
    [0x2600, 0x26FF, 'Misc Symbols'],
  ];
  for (const [start, end, category] of ranges) {
    for (let code = start; code <= end; code++) {
      const ch = String.fromCodePoint(code);
      glyphs.push({ char: ch, unicode: code, name: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`, category });
    }
  }
  return glyphs;
}

// ==================== Face-Aware Liquify (Basic) ====================

export interface FaceRegion {
  leftEye: { x: number; y: number; width: number; height: number };
  rightEye: { x: number; y: number; width: number; height: number };
  nose: { x: number; y: number; width: number; height: number };
  mouth: { x: number; y: number; width: number; height: number };
  jawline: { x: number; y: number; width: number; height: number };
  forehead: { x: number; y: number; width: number; height: number };
}

export interface FaceAwareLiquifyParams {
  eyeSize?: number;        // -100 to 100
  eyeHeight?: number;      // -100 to 100
  eyeWidth?: number;       // -100 to 100
  eyeDistance?: number;     // -100 to 100
  noseHeight?: number;     // -100 to 100
  noseWidth?: number;      // -100 to 100
  mouthSmile?: number;     // -100 to 100
  mouthWidth?: number;     // -100 to 100
  mouthHeight?: number;    // -100 to 100
  jawWidth?: number;       // -100 to 100
  foreheadHeight?: number; // -100 to 100
}

/**
 * Generate displacement vectors for face-aware liquify.
 * Given face region landmarks and adjustment parameters, produces
 * dx/dy displacement arrays for warping.
 */
export function faceAwareLiquifyDisplacements(
  width: number,
  height: number,
  face: FaceRegion,
  params: FaceAwareLiquifyParams
): { dx: Float32Array; dy: Float32Array } {
  const dx = new Float32Array(width * height);
  const dy = new Float32Array(width * height);

  const applyRegionScale = (
    region: { x: number; y: number; width: number; height: number },
    scaleX: number,
    scaleY: number
  ) => {
    const cx = region.x + region.width / 2;
    const cy = region.y + region.height / 2;
    const rx = region.width / 2 * 1.5; // extend slightly beyond region
    const ry = region.height / 2 * 1.5;

    for (let py = Math.max(0, Math.floor(cy - ry)); py < Math.min(height, Math.ceil(cy + ry)); py++) {
      for (let px = Math.max(0, Math.floor(cx - rx)); px < Math.min(width, Math.ceil(cx + rx)); px++) {
        const nx = (px - cx) / rx;
        const ny = (py - cy) / ry;
        const d2 = nx * nx + ny * ny;
        if (d2 >= 1) continue;
        const falloff = (1 - d2) * (1 - d2); // smooth falloff
        const idx = py * width + px;
        dx[idx] += (px - cx) * scaleX * falloff;
        dy[idx] += (py - cy) * scaleY * falloff;
      }
    }
  };

  // Apply eye adjustments
  const eyeScale = (params.eyeSize ?? 0) / 200;
  if (eyeScale !== 0) {
    applyRegionScale(face.leftEye, eyeScale, eyeScale);
    applyRegionScale(face.rightEye, eyeScale, eyeScale);
  }

  // Nose width
  const noseWScale = (params.noseWidth ?? 0) / 200;
  if (noseWScale !== 0) {
    applyRegionScale(face.nose, noseWScale, 0);
  }

  // Mouth width
  const mouthWScale = (params.mouthWidth ?? 0) / 200;
  if (mouthWScale !== 0) {
    applyRegionScale(face.mouth, mouthWScale, 0);
  }

  // Jaw width
  const jawScale = (params.jawWidth ?? 0) / 200;
  if (jawScale !== 0) {
    applyRegionScale(face.jawline, jawScale, 0);
  }

  return { dx, dy };
}

// ==================== SVG Path Parsing (EPS/AI Vector Import) ====================

export interface SvgPathSegment {
  command: string; // M, L, C, Q, Z, etc.
  x: number;
  y: number;
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
}

/**
 * Parse an SVG path d-attribute string into path segments.
 * Supports M, L, C, Q, Z commands (absolute).
 */
export function parseSvgPath(d: string): SvgPathSegment[] {
  const segments: SvgPathSegment[] = [];
  const re = /([MLCQZ])\s*([\d.,\s-]*)/gi;
  let match;
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1].toUpperCase();
    const nums = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    switch (cmd) {
      case 'M':
      case 'L':
        if (nums.length >= 2) segments.push({ command: cmd, x: nums[0], y: nums[1] });
        break;
      case 'C':
        if (nums.length >= 6) segments.push({ command: cmd, x: nums[4], y: nums[5], cp1x: nums[0], cp1y: nums[1], cp2x: nums[2], cp2y: nums[3] });
        break;
      case 'Q':
        if (nums.length >= 4) segments.push({ command: cmd, x: nums[2], y: nums[3], cp1x: nums[0], cp1y: nums[1] });
        break;
      case 'Z':
        segments.push({ command: 'Z', x: 0, y: 0 });
        break;
    }
  }
  return segments;
}

// ==================== Arrange Documents ====================

export interface DocumentArrangement {
  documentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate tile positions for arranging multiple documents.
 * @param count Number of documents
 * @param totalWidth Available width
 * @param totalHeight Available height
 * @param mode 'tile-horizontal' | 'tile-vertical' | 'grid'
 */
export function arrangeDocuments(
  count: number,
  totalWidth: number,
  totalHeight: number,
  mode: 'tile-horizontal' | 'tile-vertical' | 'grid' = 'grid'
): DocumentArrangement[] {
  const result: DocumentArrangement[] = [];
  if (count <= 0) return result;

  if (mode === 'tile-horizontal') {
    const w = totalWidth / count;
    for (let i = 0; i < count; i++) {
      result.push({ documentId: `doc-${i}`, x: i * w, y: 0, width: w, height: totalHeight });
    }
  } else if (mode === 'tile-vertical') {
    const h = totalHeight / count;
    for (let i = 0; i < count; i++) {
      result.push({ documentId: `doc-${i}`, x: 0, y: i * h, width: totalWidth, height: h });
    }
  } else {
    // Grid: closest to square
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const w = totalWidth / cols;
    const h = totalHeight / rows;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      result.push({ documentId: `doc-${i}`, x: col * w, y: row * h, width: w, height: h });
    }
  }
  return result;
}

// ==================== JPEG Artifacts Removal ====================

/**
 * Remove JPEG compression artifacts using bilateral-like smoothing.
 * Applies edge-preserving blur that targets block boundaries (8x8 DCT).
 */
export function removeJpegArtifacts(imageData: ImageData, strength = 50): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  const od = out.data;
  const s = clamp(strength, 1, 100) / 100;
  const radius = 1;

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const ci = (y * width + x) * 4;
      // Only smooth near 8x8 block boundaries
      const nearBlockEdge = (x % 8 <= 1 || x % 8 >= 6 || y % 8 <= 1 || y % 8 >= 6);
      if (!nearBlockEdge) continue;

      let sumR = 0, sumG = 0, sumB = 0, wt = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ni = ((y + dy) * width + (x + dx)) * 4;
          const diff = Math.abs(data[ni] - data[ci]) + Math.abs(data[ni + 1] - data[ci + 1]) + Math.abs(data[ni + 2] - data[ci + 2]);
          const w = Math.exp(-diff / (30 * s + 1));
          sumR += data[ni] * w;
          sumG += data[ni + 1] * w;
          sumB += data[ni + 2] * w;
          wt += w;
        }
      }
      od[ci] = Math.round(sumR / wt);
      od[ci + 1] = Math.round(sumG / wt);
      od[ci + 2] = Math.round(sumB / wt);
    }
  }
  return out;
}

// ==================== Skin Smoothing ====================

/**
 * Smooth skin tones while preserving edges and non-skin areas.
 * Detects skin-tone pixels by HSV range and applies bilateral blur.
 */
export function skinSmoothing(imageData: ImageData, amount = 50): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  const od = out.data;
  const radius = Math.max(1, Math.round(amount / 20));

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const ci = (y * width + x) * 4;
      const r = data[ci], g = data[ci + 1], b = data[ci + 2];

      // Simple skin-tone detection (RGB heuristic)
      const isSkin = r > 95 && g > 40 && b > 20 && r > g && r > b &&
                     Math.abs(r - g) > 15 && (r - b) > 15;
      if (!isSkin) continue;

      let sumR = 0, sumG = 0, sumB = 0, wt = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ni = ((y + dy) * width + (x + dx)) * 4;
          const diff = Math.abs(data[ni] - r) + Math.abs(data[ni + 1] - g) + Math.abs(data[ni + 2] - b);
          const w = Math.exp(-diff / 50);
          sumR += data[ni] * w; sumG += data[ni + 1] * w; sumB += data[ni + 2] * w;
          wt += w;
        }
      }
      const blend = clamp(amount, 0, 100) / 100;
      od[ci] = Math.round(r * (1 - blend) + (sumR / wt) * blend);
      od[ci + 1] = Math.round(g * (1 - blend) + (sumG / wt) * blend);
      od[ci + 2] = Math.round(b * (1 - blend) + (sumB / wt) * blend);
    }
  }
  return out;
}

// ==================== Color Transfer ====================

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

// ==================== Depth Blur ====================

/**
 * Apply depth-based blur. Pixels at different "depths" get different blur amounts.
 * Depth is estimated from luminance (brighter = closer, darker = farther).
 * @param focusPoint 0-1, luminance value that stays sharp
 */
export function depthBlur(
  imageData: ImageData,
  maxRadius: number,
  focusPoint = 0.5
): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  const od = out.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = (y * width + x) * 4;
      const lum = (data[ci] * 0.299 + data[ci + 1] * 0.587 + data[ci + 2] * 0.114) / 255;
      const depthDiff = Math.abs(lum - focusPoint);
      const r = Math.round(depthDiff * maxRadius);

      if (r <= 0) continue;

      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const py = y + dy;
        if (py < 0 || py >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const px = x + dx;
          if (px < 0 || px >= width) continue;
          if (dx * dx + dy * dy > r * r) continue;
          const ni = (py * width + px) * 4;
          sumR += data[ni]; sumG += data[ni + 1]; sumB += data[ni + 2];
          count++;
        }
      }
      od[ci] = Math.round(sumR / count);
      od[ci + 1] = Math.round(sumG / count);
      od[ci + 2] = Math.round(sumB / count);
    }
  }
  return out;
}

// ==================== Style Transfer (Basic) ====================

/**
 * Basic style transfer: apply color palette and contrast characteristics
 * from a style image to a content image.
 * Uses histogram matching per channel.
 */
export function styleTransfer(content: ImageData, style: ImageData): ImageData {
  const out = new ImageData(new Uint8ClampedArray(content.data), content.width, content.height);
  const od = out.data;

  // Build CDFs for both images per channel
  for (let c = 0; c < 3; c++) {
    const contentHist = new Float64Array(256);
    const styleHist = new Float64Array(256);

    for (let i = c; i < content.data.length; i += 4) contentHist[content.data[i]]++;
    for (let i = c; i < style.data.length; i += 4) styleHist[style.data[i]]++;

    // Normalize to CDFs
    const cn = content.data.length / 4, sn = style.data.length / 4;
    for (let i = 1; i < 256; i++) {
      contentHist[i] += contentHist[i - 1];
      styleHist[i] += styleHist[i - 1];
    }
    for (let i = 0; i < 256; i++) {
      contentHist[i] /= cn;
      styleHist[i] /= sn;
    }

    // Build mapping: for each content level, find style level with closest CDF
    const mapping = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let best = 0, bestDiff = Infinity;
      for (let j = 0; j < 256; j++) {
        const diff = Math.abs(contentHist[i] - styleHist[j]);
        if (diff < bestDiff) { bestDiff = diff; best = j; }
      }
      mapping[i] = best;
    }

    // Apply mapping
    for (let i = c; i < od.length; i += 4) {
      od[i] = mapping[od[i]];
    }
  }
  return out;
}

// ==================== Auto-Align Images ====================

/**
 * Estimate translation offset between two images for alignment.
 * Uses cross-correlation on downsampled luminance.
 * Returns dx, dy offset to align img2 to img1.
 */
export function autoAlignOffset(
  img1: ImageData,
  img2: ImageData,
  searchRange = 20
): { dx: number; dy: number } {
  const w = Math.min(img1.width, img2.width);
  const h = Math.min(img1.height, img2.height);

  // Compute luminance arrays
  const lum1 = new Float32Array(w * h);
  const lum2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i1 = (y * img1.width + x) * 4;
      const i2 = (y * img2.width + x) * 4;
      lum1[y * w + x] = img1.data[i1] * 0.299 + img1.data[i1 + 1] * 0.587 + img1.data[i1 + 2] * 0.114;
      lum2[y * w + x] = img2.data[i2] * 0.299 + img2.data[i2 + 1] * 0.587 + img2.data[i2 + 2] * 0.114;
    }
  }

  let bestDx = 0, bestDy = 0, bestCorr = -Infinity;
  const range = Math.min(searchRange, Math.min(w, h) / 4);

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      let corr = 0;
      let count = 0;
      for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y += 2) { // stride 2 for speed
        for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x += 2) {
          corr += lum1[y * w + x] * lum2[(y + dy) * w + (x + dx)];
          count++;
        }
      }
      if (count > 0) corr /= count;
      if (corr > bestCorr) { bestCorr = corr; bestDx = dx; bestDy = dy; }
    }
  }
  return { dx: bestDx, dy: bestDy };
}
