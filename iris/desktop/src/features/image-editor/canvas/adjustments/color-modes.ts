/**
 * Color mode conversions (Lab, indexed, bitmap, duotone, multichannel, float32)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

import { clamp } from '../colorUtils';

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

export function bilinearResize(imageData: ImageData, nw: number, nh: number): ImageData {
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
