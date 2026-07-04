/**
 * Blur filters
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { applyConvolution } from './core';

/**
 * Gaussian blur using separable kernel (faster)
 */
export function gaussianBlur(
  imageData: ImageData,
  radius: number
): ImageData {
  if (radius <= 0) return imageData;

  const { width, height, data } = imageData;

  // Generate 1D Gaussian kernel
  const sigma = radius / 3;
  const kernelSize = Math.ceil(radius) * 2 + 1;
  const kernel: number[] = [];
  let sum = 0;

  for (let i = 0; i < kernelSize; i++) {
    const x = i - Math.floor(kernelSize / 2);
    const value = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(value);
    sum += value;
  }

  // Normalize kernel
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }

  // Two-pass separable blur
  const temp = new Float32Array(width * height * 4);
  const result = new ImageData(width, height);
  const resultData = result.data;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let k = 0; k < kernelSize; k++) {
        const px = Math.min(width - 1, Math.max(0, x + k - Math.floor(kernelSize / 2)));
        const idx = (y * width + px) * 4;
        const weight = kernel[k];

        r += data[idx] * weight;
        g += data[idx + 1] * weight;
        b += data[idx + 2] * weight;
        a += data[idx + 3] * weight;
      }

      const dstIdx = (y * width + x) * 4;
      temp[dstIdx] = r;
      temp[dstIdx + 1] = g;
      temp[dstIdx + 2] = b;
      temp[dstIdx + 3] = a;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let k = 0; k < kernelSize; k++) {
        const py = Math.min(height - 1, Math.max(0, y + k - Math.floor(kernelSize / 2)));
        const idx = (py * width + x) * 4;
        const weight = kernel[k];

        r += temp[idx] * weight;
        g += temp[idx + 1] * weight;
        b += temp[idx + 2] * weight;
        a += temp[idx + 3] * weight;
      }

      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = Math.min(255, Math.max(0, Math.round(r)));
      resultData[dstIdx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      resultData[dstIdx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      resultData[dstIdx + 3] = Math.min(255, Math.max(0, Math.round(a)));
    }
  }

  return result;
}

/**
 * Motion blur
 */
export function motionBlur(
  imageData: ImageData,
  angle: number,
  distance: number
): ImageData {
  if (distance <= 0) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const samples = Math.ceil(distance);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let i = -samples; i <= samples; i++) {
        const px = Math.min(width - 1, Math.max(0, Math.round(x + dx * i)));
        const py = Math.min(height - 1, Math.max(0, Math.round(y + dy * i)));
        const idx = (py * width + px) * 4;

        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        a += data[idx + 3];
      }

      const count = samples * 2 + 1;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = Math.round(r / count);
      resultData[dstIdx + 1] = Math.round(g / count);
      resultData[dstIdx + 2] = Math.round(b / count);
      resultData[dstIdx + 3] = Math.round(a / count);
    }
  }

  return result;
}

/**
 * Radial Blur — Spin (rotation) or Zoom (radial) blur from a center point.
 */
export function radialBlur(
  imageData: ImageData,
  amount: number,
  mode: 'spin' | 'zoom' = 'zoom',
  centerX: number = 0.5,
  centerY: number = 0.5
): ImageData {
  if (amount <= 0) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width * centerX;
  const cy = height * centerY;
  const samples = Math.max(3, Math.ceil(amount / 2));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let s = 0; s < samples; s++) {
        const t = (s / (samples - 1)) - 0.5; // -0.5 to 0.5
        let sx: number, sy: number;

        if (mode === 'zoom') {
          // Zoom: sample along radial line
          const scale = 1 + t * (amount / 100);
          sx = cx + (x - cx) * scale;
          sy = cy + (y - cy) * scale;
        } else {
          // Spin: sample along circular arc
          const angle = t * (amount / 100) * Math.PI * 0.1;
          const cos = Math.cos(angle), sin = Math.sin(angle);
          const dx = x - cx, dy = y - cy;
          sx = cx + dx * cos - dy * sin;
          sy = cy + dx * sin + dy * cos;
        }

        const px = Math.min(width - 1, Math.max(0, Math.round(sx)));
        const py = Math.min(height - 1, Math.max(0, Math.round(sy)));
        const idx = (py * width + px) * 4;

        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        a += data[idx + 3];
      }

      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx]     = Math.round(r / samples);
      resultData[dstIdx + 1] = Math.round(g / samples);
      resultData[dstIdx + 2] = Math.round(b / samples);
      resultData[dstIdx + 3] = Math.round(a / samples);
    }
  }

  return result;
}

/**
 * Surface Blur — blurs flat areas while preserving edges (bilateral filter).
 * Essential for portrait skin retouching.
 */
export function surfaceBlur(
  imageData: ImageData,
  radius: number,
  threshold: number
): ImageData {
  if (radius <= 0) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const r = Math.min(radius, 10); // Cap for performance

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cIdx = (y * width + x) * 4;
      const cR = data[cIdx], cG = data[cIdx + 1], cB = data[cIdx + 2];

      let sumR = 0, sumG = 0, sumB = 0, sumWeight = 0;

      for (let dy = -r; dy <= r; dy++) {
        const py = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -r; dx <= r; dx++) {
          const px = Math.min(width - 1, Math.max(0, x + dx));
          const nIdx = (py * width + px) * 4;

          // Color difference as edge indicator
          const diff = Math.abs(data[nIdx] - cR) + Math.abs(data[nIdx + 1] - cG) + Math.abs(data[nIdx + 2] - cB);

          if (diff <= threshold * 3) {
            const weight = 1 - diff / (threshold * 3 + 1);
            sumR += data[nIdx] * weight;
            sumG += data[nIdx + 1] * weight;
            sumB += data[nIdx + 2] * weight;
            sumWeight += weight;
          }
        }
      }

      resultData[cIdx]     = sumWeight > 0 ? Math.round(sumR / sumWeight) : cR;
      resultData[cIdx + 1] = sumWeight > 0 ? Math.round(sumG / sumWeight) : cG;
      resultData[cIdx + 2] = sumWeight > 0 ? Math.round(sumB / sumWeight) : cB;
      resultData[cIdx + 3] = data[cIdx + 3];
    }
  }

  return result;
}

/**
 * Lens Blur (Bokeh) — simulates depth-of-field with disc/hexagonal aperture
 * Uses averaging of samples in a circular region to simulate optical blur.
 */
export function lensBlur(
  imageData: ImageData,
  radius: number = 10,
  brightness: number = 0,
  threshold: number = 200,
  bladeCount: number = 6,
  rotation: number = 0
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const r = Math.max(1, Math.round(radius));

  // Pre-compute disc sample offsets for bokeh shape
  const samples: Array<{ dx: number; dy: number }> = [];
  const angleStep = (2 * Math.PI) / Math.max(bladeCount, 3);
  const rotRad = (rotation * Math.PI) / 180;

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r) continue;

      // Check if point is inside polygonal aperture (blade count)
      const angle = Math.atan2(dy, dx) - rotRad;
      const polyRadius = r * Math.cos(Math.PI / bladeCount) / Math.max(0.001, Math.cos(((angle - rotRad) % angleStep) - angleStep / 2));

      if (dist <= Math.abs(polyRadius) * 1.1) {
        samples.push({ dx, dy });
      }
    }
  }
  if (samples.length === 0) samples.push({ dx: 0, dy: 0 });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0, weightSum = 0;

      for (const { dx, dy } of samples) {
        const sx = Math.min(width - 1, Math.max(0, x + dx));
        const sy = Math.min(height - 1, Math.max(0, y + dy));
        const idx = (sy * width + sx) * 4;

        // Highlight boost for specular highlights (bokeh brightness)
        const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
        const weight = lum > threshold ? 1 + brightness / 100 : 1;

        sumR += data[idx] * weight;
        sumG += data[idx + 1] * weight;
        sumB += data[idx + 2] * weight;
        sumA += data[idx + 3];
        weightSum += weight;
      }

      const idx = (y * width + x) * 4;
      resultData[idx] = Math.min(255, sumR / weightSum);
      resultData[idx + 1] = Math.min(255, sumG / weightSum);
      resultData[idx + 2] = Math.min(255, sumB / weightSum);
      resultData[idx + 3] = sumA / samples.length;
    }
  }

  return result;
}

/** Average — fill entire image (or selection) with average color */
export function average(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  let r = 0, g = 0, b = 0;
  const count = width * height;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  const ar = Math.round(r / count), ag = Math.round(g / count), ab = Math.round(b / count);
  for (let i = 0; i < d.length; i += 4) { d[i] = ar; d[i + 1] = ag; d[i + 2] = ab; d[i + 3] = data[i + 3]; }
  return result;
}

/** Blur More — stronger basic blur (3x3 average applied twice) */
export function blurMore(imageData: ImageData): ImageData {
  const kernel = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
  const pass1 = applyConvolution(imageData, kernel);
  return applyConvolution(pass1, kernel);
}

/** Box Blur — uniform NxN kernel blur */
export function boxBlur(imageData: ImageData, radius: number = 3): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const r = Math.max(1, Math.round(radius));
  const size = r * 2 + 1;
  const area = size * size;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rs = 0, gs = 0, bs = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          rs += data[si]; gs += data[si + 1]; bs += data[si + 2];
        }
      }
      const i = (y * width + x) * 4;
      d[i] = Math.round(rs / area); d[i + 1] = Math.round(gs / area);
      d[i + 2] = Math.round(bs / area); d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Shape Blur — blur with shaped kernel (circle, diamond, square) */
export function shapeBlur(imageData: ImageData, radius: number = 5, shape: 'circle' | 'diamond' | 'square' = 'circle'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const r = Math.max(1, Math.round(radius));

  // Build kernel mask
  const kernelMask: boolean[][] = [];
  for (let dy = -r; dy <= r; dy++) {
    const row: boolean[] = [];
    for (let dx = -r; dx <= r; dx++) {
      if (shape === 'circle') row.push(dx * dx + dy * dy <= r * r);
      else if (shape === 'diamond') row.push(Math.abs(dx) + Math.abs(dy) <= r);
      else row.push(true);
    }
    kernelMask.push(row);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rs = 0, gs = 0, bs = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (!kernelMask[dy + r][dx + r]) continue;
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          rs += data[si]; gs += data[si + 1]; bs += data[si + 2]; count++;
        }
      }
      const i = (y * width + x) * 4;
      d[i] = Math.round(rs / count); d[i + 1] = Math.round(gs / count);
      d[i + 2] = Math.round(bs / count); d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Smart Blur — edge-preserving blur with mode selection */
export function smartBlur(imageData: ImageData, radius: number = 3, threshold: number = 25, _quality: number = 1, mode: 'normal' | 'edgeOnly' | 'overlayEdge' = 'normal'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const r = Math.max(1, Math.round(radius));
  const thresh = threshold * 3;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = (y * width + x) * 4;
      let rs = 0, gs = 0, bs = 0, count = 0;
      let isEdge = false;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          const diff = Math.abs(data[ci] - data[si]) + Math.abs(data[ci + 1] - data[si + 1]) + Math.abs(data[ci + 2] - data[si + 2]);
          if (diff < thresh) { rs += data[si]; gs += data[si + 1]; bs += data[si + 2]; count++; }
          else { isEdge = true; }
        }
      }

      if (mode === 'edgeOnly') {
        const val = isEdge ? 255 : 0;
        d[ci] = d[ci + 1] = d[ci + 2] = val;
      } else if (mode === 'overlayEdge') {
        if (isEdge) { d[ci] = 255; d[ci + 1] = 255; d[ci + 2] = 255; }
        else if (count > 0) { d[ci] = Math.round(rs / count); d[ci + 1] = Math.round(gs / count); d[ci + 2] = Math.round(bs / count); }
        else { d[ci] = data[ci]; d[ci + 1] = data[ci + 1]; d[ci + 2] = data[ci + 2]; }
      } else {
        if (count > 0) { d[ci] = Math.round(rs / count); d[ci + 1] = Math.round(gs / count); d[ci + 2] = Math.round(bs / count); }
        else { d[ci] = data[ci]; d[ci + 1] = data[ci + 1]; d[ci + 2] = data[ci + 2]; }
      }
      d[ci + 3] = data[ci + 3];
    }
  }
  return result;
}

/**
 * Basic blur — simple 3x3 average convolution (softer than Gaussian)
 */
export function blur(imageData: ImageData): ImageData {
  const kernel = [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ];
  return applyConvolution(imageData, kernel, 9);
}
