/**
 * Utility filters (channel math, morphology, framing)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { applyConvolution } from './core';

/** Calculations — blend two channels from source image(s) using blend mode */
export function calculations(
  imageData1: ImageData,
  channel1: 'red' | 'green' | 'blue' | 'gray' = 'gray',
  imageData2: ImageData | null,
  channel2: 'red' | 'green' | 'blue' | 'gray' = 'gray',
  blendMode: 'add' | 'subtract' | 'multiply' | 'screen' | 'difference' = 'multiply'
): ImageData {
  const { width, height } = imageData1;
  const data1 = imageData1.data;
  const data2 = (imageData2 || imageData1).data;
  const result = new ImageData(width, height);
  const d = result.data;

  const getChannel = (data: Uint8ClampedArray, i: number, ch: string): number => {
    if (ch === 'red') return data[i];
    if (ch === 'green') return data[i + 1];
    if (ch === 'blue') return data[i + 2];
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  for (let i = 0; i < data1.length; i += 4) {
    const a = getChannel(data1, i, channel1) / 255;
    const b = getChannel(data2, i, channel2) / 255;
    let v: number;

    switch (blendMode) {
      case 'add': v = Math.min(1, a + b); break;
      case 'subtract': v = Math.max(0, a - b); break;
      case 'multiply': v = a * b; break;
      case 'screen': v = 1 - (1 - a) * (1 - b); break;
      case 'difference': v = Math.abs(a - b); break;
    }

    const val = Math.round(v * 255);
    d[i] = val; d[i + 1] = val; d[i + 2] = val; d[i + 3] = 255;
  }
  return result;
}

/** Apply Image — blend a source image onto the target using blend mode and opacity */
export function applyImage(
  targetData: ImageData,
  sourceData: ImageData,
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light' = 'normal',
  opacity: number = 100
): ImageData {
  const { width, height } = targetData;
  const result = new ImageData(width, height);
  const d = result.data;
  const t = targetData.data;
  const s = sourceData.data;
  const op = opacity / 100;

  for (let i = 0; i < t.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const tVal = t[i + c] / 255;
      const sVal = s[i + c] / 255;
      let blended: number;

      switch (blendMode) {
        case 'normal': blended = sVal; break;
        case 'multiply': blended = tVal * sVal; break;
        case 'screen': blended = 1 - (1 - tVal) * (1 - sVal); break;
        case 'overlay':
          blended = tVal < 0.5 ? 2 * tVal * sVal : 1 - 2 * (1 - tVal) * (1 - sVal);
          break;
        case 'soft-light':
          blended = sVal < 0.5
            ? tVal - (1 - 2 * sVal) * tVal * (1 - tVal)
            : tVal + (2 * sVal - 1) * (Math.sqrt(tVal) - tVal);
          break;
        case 'hard-light':
          blended = sVal < 0.5 ? 2 * tVal * sVal : 1 - 2 * (1 - tVal) * (1 - sVal);
          break;
        default: blended = sVal;
      }

      d[i + c] = Math.round((tVal * (1 - op) + blended * op) * 255);
    }
    d[i + 3] = t[i + 3];
  }
  return result;
}

/**
 * Maximum filter — morphological dilation (expands bright areas)
 * Replaces each pixel with the maximum value in its neighborhood
 */
export function maximumFilter(imageData: ImageData, radius: number = 1): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const r = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let maxR = 0, maxG = 0, maxB = 0;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const nIdx = (ny * width + nx) * 4;
          maxR = Math.max(maxR, data[nIdx]);
          maxG = Math.max(maxG, data[nIdx + 1]);
          maxB = Math.max(maxB, data[nIdx + 2]);
        }
      }

      resultData[idx] = maxR;
      resultData[idx + 1] = maxG;
      resultData[idx + 2] = maxB;
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

/**
 * Minimum filter — morphological erosion (expands dark areas)
 * Replaces each pixel with the minimum value in its neighborhood
 */
export function minimumFilter(imageData: ImageData, radius: number = 1): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const r = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let minR = 255, minG = 255, minB = 255;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const nIdx = (ny * width + nx) * 4;
          minR = Math.min(minR, data[nIdx]);
          minG = Math.min(minG, data[nIdx + 1]);
          minB = Math.min(minB, data[nIdx + 2]);
        }
      }

      resultData[idx] = minR;
      resultData[idx + 1] = minG;
      resultData[idx + 2] = minB;
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

/**
 * Offset filter — shifts image horizontally/vertically with wrap-around or repeat-edge
 */
export function offsetFilter(
  imageData: ImageData,
  horizontal: number = 0,
  vertical: number = 0,
  wrapAround: boolean = true
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const dx = Math.round(horizontal);
  const dy = Math.round(vertical);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx = x - dx;
      let sy = y - dy;

      if (wrapAround) {
        sx = ((sx % width) + width) % width;
        sy = ((sy % height) + height) % height;
      } else {
        sx = Math.min(width - 1, Math.max(0, sx));
        sy = Math.min(height - 1, Math.max(0, sy));
      }

      const dstIdx = (y * width + x) * 4;
      const srcIdx = (sy * width + sx) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return result;
}

/**
 * Picture Frame — renders a decorative frame overlay around the image
 */
export function pictureFrame(
  imageData: ImageData,
  frameWidth: number = 20,
  style: 'simple' | 'ornate' | 'shadow' | 'double' = 'simple',
  color: [number, number, number] = [139, 90, 43]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  resultData.set(data);

  const fw = Math.max(2, Math.round(frameWidth));
  const [fr, fg, fb] = color;

  function setPixel(x: number, y: number, r: number, g: number, b: number, a: number = 255) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    const alpha = a / 255;
    resultData[idx] = Math.round(r * alpha + resultData[idx] * (1 - alpha));
    resultData[idx + 1] = Math.round(g * alpha + resultData[idx + 1] * (1 - alpha));
    resultData[idx + 2] = Math.round(b * alpha + resultData[idx + 2] * (1 - alpha));
    resultData[idx + 3] = 255;
  }

  if (style === 'simple' || style === 'ornate' || style === 'double') {
    // Main frame border
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distTop = y;
        const distBottom = height - 1 - y;
        const distLeft = x;
        const distRight = width - 1 - x;
        const dist = Math.min(distTop, distBottom, distLeft, distRight);

        if (dist < fw) {
          const t = dist / fw;
          // Bevel effect: outer edge lighter, inner edge darker
          const bevel = style === 'ornate'
            ? (t < 0.3 ? 1.3 : t > 0.7 ? 0.7 : 1.0)
            : 1.0;
          setPixel(x, y,
            Math.min(255, Math.round(fr * bevel)),
            Math.min(255, Math.round(fg * bevel)),
            Math.min(255, Math.round(fb * bevel))
          );
        }
      }
    }

    // Inner border line
    for (let x = fw - 1; x < width - fw + 1; x++) {
      setPixel(x, fw - 1, fr * 0.5, fg * 0.5, fb * 0.5);
      setPixel(x, height - fw, fr * 0.5, fg * 0.5, fb * 0.5);
    }
    for (let y = fw - 1; y < height - fw + 1; y++) {
      setPixel(fw - 1, y, fr * 0.5, fg * 0.5, fb * 0.5);
      setPixel(width - fw, y, fr * 0.5, fg * 0.5, fb * 0.5);
    }

    if (style === 'double') {
      // Second inner frame
      const fw2 = Math.round(fw * 0.4);
      const offset = fw + 3;
      for (let y = offset; y < height - offset; y++) {
        for (let x = offset; x < width - offset; x++) {
          const dTop = y - offset;
          const dBot = height - 1 - offset - y;
          const dLeft = x - offset;
          const dRight = width - 1 - offset - x;
          const d = Math.min(dTop, dBot, dLeft, dRight);
          if (d < fw2) {
            setPixel(x, y, fr * 0.8, fg * 0.8, fb * 0.8);
          }
        }
      }
    }
  }

  if (style === 'shadow') {
    // Inner shadow effect
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distTop = y;
        const distBottom = height - 1 - y;
        const distLeft = x;
        const distRight = width - 1 - x;
        const dist = Math.min(distTop, distBottom, distLeft, distRight);

        if (dist < fw) {
          const alpha = Math.round(200 * (1 - dist / fw));
          setPixel(x, y, 0, 0, 0, alpha);
        }
      }
    }
  }

  return result;
}

/**
 * Other > Custom Filter — user-defined convolution matrix
 */
export function customFilter(
  imageData: ImageData,
  matrix: number[][],
  scale: number = 1,
  offset: number = 0
): ImageData {
  const divisor = scale === 0 ? 1 : scale;
  return applyConvolution(imageData, matrix, divisor, offset);
}
