/**
 * Core adjustment pipeline (AdjustmentValues, LUT builders, fused single-pass apply)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

import { createOffscreenCanvas } from '../canvasEngine';
import { clamp } from '../colorUtils';

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

export function toHsl(r: number, g: number, b: number): [number, number, number] {
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

export function fromHsl(h: number, s: number, l: number): [number, number, number] {
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
