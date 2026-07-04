/**
 * Enhancement / repair adjustments (dehaze, texture, JPEG artifacts, skin smoothing, depth blur, style transfer)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

import { clamp } from '../colorUtils';

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
