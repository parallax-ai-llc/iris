/**
 * Color adjustments applied as filters (levels, curves, balance, HSL)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

/**
 * Posterize (reduce colors)
 */
export function posterize(
  imageData: ImageData,
  levels: number
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const step = 255 / (levels - 1);

  for (let i = 0; i < data.length; i += 4) {
    resultData[i] = Math.round(Math.round(data[i] / step) * step);
    resultData[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
    resultData[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Invert colors
 */
export function invert(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let i = 0; i < data.length; i += 4) {
    resultData[i] = 255 - data[i];
    resultData[i + 1] = 255 - data[i + 1];
    resultData[i + 2] = 255 - data[i + 2];
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Grayscale
 */
export function grayscale(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let i = 0; i < data.length; i += 4) {
    // Use luminance formula
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    resultData[i] = gray;
    resultData[i + 1] = gray;
    resultData[i + 2] = gray;
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Sepia tone
 */
export function sepia(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    resultData[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
    resultData[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
    resultData[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Compute luminance histogram (256 bins) from ImageData
 */
export function computeHistogram(imageData: ImageData): Uint32Array {
  const histogram = new Uint32Array(256);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[lum]++;
  }
  return histogram;
}

export interface LevelsParams {
  inputBlack: number;   // 0-255
  inputWhite: number;   // 0-255
  gamma: number;        // 0.1-9.99
  outputBlack: number;  // 0-255
  outputWhite: number;  // 0-255
}

/**
 * Apply Photoshop-style Levels adjustment
 * Builds a 256-entry LUT then applies it to each RGB channel
 */
export function applyLevels(imageData: ImageData, params: LevelsParams): ImageData {
  const { inputBlack, inputWhite, gamma, outputBlack, outputWhite } = params;
  const inRange = Math.max(1, inputWhite - inputBlack);
  const outRange = outputWhite - outputBlack;
  const gammaInv = gamma > 0 ? 1 / gamma : 1;

  // Pre-compute 256-entry LUT
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    // 1. Input levels: remap [inputBlack, inputWhite] → [0, 1]
    let v = (i - inputBlack) / inRange;
    v = Math.max(0, Math.min(1, v));
    // 2. Gamma correction on midtones
    v = Math.pow(v, gammaInv);
    // 3. Output levels: remap [0, 1] → [outputBlack, outputWhite]
    lut[i] = Math.round(outputBlack + v * outRange);
  }

  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const d = result.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
    // alpha unchanged
  }
  return result;
}

export interface CurvePoint {
  x: number;  // 0-255 input
  y: number;  // 0-255 output
}

/**
 * Build a 256-entry LUT from an array of control points using monotone cubic spline.
 * Points must be sorted by x and include (0,0) and (255,255) anchors.
 */
function buildCurveLut(points: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);

  // Sort by x, ensure endpoints
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length === 0 || pts[0].x > 0) pts.unshift({ x: 0, y: 0 });
  if (pts[pts.length - 1].x < 255) pts.push({ x: 255, y: 255 });

  const n = pts.length;
  if (n === 2) {
    // Linear
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      lut[i] = Math.round(pts[0].y + t * (pts[1].y - pts[0].y));
    }
    return lut;
  }

  // Compute slopes for monotone cubic (Fritsch-Carlson)
  const dx = new Float64Array(n - 1);
  const dy = new Float64Array(n - 1);
  const m = new Float64Array(n);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    dy[i] = (pts[i + 1].y - pts[i].y) / Math.max(1, dx[i]);
  }
  m[0] = dy[0];
  m[n - 1] = dy[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (dy[i - 1] + dy[i]) / 2;

  // Enforce monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (dy[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const alpha = m[i] / dy[i];
    const beta = m[i + 1] / dy[i];
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * alpha * dy[i];
      m[i + 1] = tau * beta * dy[i];
    }
  }

  // Interpolate
  for (let i = 0; i < 256; i++) {
    // Find segment
    let seg = n - 2;
    for (let j = 0; j < n - 1; j++) {
      if (i <= pts[j + 1].x) { seg = j; break; }
    }
    const t = dx[seg] > 0 ? (i - pts[seg].x) / dx[seg] : 0;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    lut[i] = Math.round(
      Math.max(0, Math.min(255,
        h00 * pts[seg].y + h10 * dx[seg] * m[seg] +
        h01 * pts[seg + 1].y + h11 * dx[seg] * m[seg + 1]
      ))
    );
  }
  return lut;
}

/**
 * Apply Photoshop-style Curves adjustment.
 * curves[0] = composite RGB, curves[1] = R, curves[2] = G, curves[3] = B
 */
export function applyCurves(imageData: ImageData, curves: CurvePoint[][]): ImageData {
  const lutR = buildCurveLut(curves[1] ?? []);
  const lutG = buildCurveLut(curves[2] ?? []);
  const lutB = buildCurveLut(curves[3] ?? []);
  const lutRGB = buildCurveLut(curves[0] ?? []);

  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const d = result.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = lutR[lutRGB[d[i]]];
    d[i + 1] = lutG[lutRGB[d[i + 1]]];
    d[i + 2] = lutB[lutRGB[d[i + 2]]];
  }
  return result;
}

export interface ColorBalanceToneParams {
  cyan: number;    // -100 to 100 (negative = Cyan, positive = Red)
  magenta: number; // -100 to 100 (negative = Magenta, positive = Green)
  yellow: number;  // -100 to 100 (negative = Yellow, positive = Blue)
}

export interface ColorBalanceParams {
  shadows: ColorBalanceToneParams;
  midtones: ColorBalanceToneParams;
  highlights: ColorBalanceToneParams;
  preserveLuminosity: boolean;
}

function getLuminosity(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function setLuminosity(r: number, g: number, b: number, lum: number): [number, number, number] {
  const delta = lum - getLuminosity(r, g, b);
  return [
    Math.max(0, Math.min(255, r + delta)),
    Math.max(0, Math.min(255, g + delta)),
    Math.max(0, Math.min(255, b + delta)),
  ];
}

/**
 * Apply Photoshop-style Color Balance adjustment
 * Tone ranges overlap: shadows (dark), midtones (medium), highlights (bright)
 * Each channel shift: cyan↔red (+red), magenta↔green (+green), yellow↔blue (+blue)
 */
export function applyColorBalance(imageData: ImageData, params: ColorBalanceParams): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const d = result.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const origLum = getLuminosity(r, g, b);

    // Normalized luminosity [0, 1]
    const lum = origLum / 255;

    // Shadow weight: peaks at 0, fades by 0.5
    const sw = Math.max(0, 1 - lum / 0.5) * (1 - lum);
    // Highlight weight: peaks at 1, fades below 0.5
    const hw = Math.max(0, (lum - 0.5) / 0.5) * lum;
    // Midtone weight: peaks at 0.5
    const mw = 1 - sw - hw;

    // Apply RGB offsets: cyan=-R, magenta=-G, yellow=-B; and their inverses
    const dr = (params.shadows.cyan * sw + params.midtones.cyan * mw + params.highlights.cyan * hw) * 0.3;
    const dg = (params.shadows.magenta * sw + params.midtones.magenta * mw + params.highlights.magenta * hw) * 0.3;
    const db_ = (params.shadows.yellow * sw + params.midtones.yellow * mw + params.highlights.yellow * hw) * 0.3;

    r = Math.max(0, Math.min(255, r + dr));
    g = Math.max(0, Math.min(255, g + dg));
    b = Math.max(0, Math.min(255, b + db_));

    if (params.preserveLuminosity) {
      [r, g, b] = setLuminosity(r, g, b, origLum);
    }

    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  return result;
}

export type HueSatChannel = 'master' | 'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas';

export interface HueSatChannelParams {
  hue: number;        // -180 to 180
  saturation: number; // -100 to 100
  lightness: number;  // -100 to 100
}

// Hue range centers for each channel (degrees)
const CHANNEL_HUE_CENTERS: Record<HueSatChannel, number> = {
  master: -1,
  reds: 0,
  yellows: 60,
  greens: 120,
  cyans: 180,
  blues: 240,
  magentas: 300,
};

const HUE_RANGE = 30; // ±degrees around center

function hueDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function rgbToHslLocal(r: number, g: number, b: number): [number, number, number] {
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

function hslToRgbLocal(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const toRgb = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return [
    Math.round(toRgb(hk + 1/3) * 255),
    Math.round(toRgb(hk) * 255),
    Math.round(toRgb(hk - 1/3) * 255),
  ];
}

/**
 * Apply Photoshop-style channel-selective Hue/Saturation adjustment.
 * params is a map of channel → {hue, saturation, lightness} adjustments.
 */
export function applySelectiveHSL(
  imageData: ImageData,
  params: Partial<Record<HueSatChannel, HueSatChannelParams>>
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const d = result.data;

  const channels = Object.keys(params) as HueSatChannel[];
  const hasMaster = channels.includes('master');
  const specific = channels.filter(c => c !== 'master');

  for (let i = 0; i < d.length; i += 4) {
    let [h, s, l] = rgbToHslLocal(d[i], d[i + 1], d[i + 2]);

    // Apply master first
    if (hasMaster) {
      const m = params.master!;
      h += m.hue;
      s = Math.max(0, Math.min(1, s + m.saturation / 100));
      l = Math.max(0, Math.min(1, l + m.lightness / 100));
    }

    // Apply specific channel adjustments weighted by hue proximity
    for (const ch of specific) {
      const center = CHANNEL_HUE_CENTERS[ch];
      const dist = hueDist(h, center);
      if (dist > HUE_RANGE * 2) continue;
      const weight = Math.max(0, 1 - dist / HUE_RANGE);
      const p = params[ch]!;
      h += p.hue * weight;
      s = Math.max(0, Math.min(1, s + (p.saturation / 100) * weight));
      l = Math.max(0, Math.min(1, l + (p.lightness / 100) * weight));
    }

    const [nr, ng, nb] = hslToRgbLocal(h, s, l);
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
  }
  return result;
}
