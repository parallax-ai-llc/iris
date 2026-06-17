/**
 * Image Filters Library
 * Various image processing filters and effects
 */

import { createOffscreenCanvas } from './canvasEngine';

// ==================== Convolution Filters ====================

/**
 * Apply a convolution kernel to an image
 */
export function applyConvolution(
  imageData: ImageData,
  kernel: number[][],
  divisor?: number,
  offset: number = 0
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const kSize = kernel.length;
  const kHalf = Math.floor(kSize / 2);

  // Calculate divisor if not provided
  const div = divisor ?? (kernel.flat().reduce((a, b) => a + b, 0) || 1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;

      for (let ky = 0; ky < kSize; ky++) {
        for (let kx = 0; kx < kSize; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx - kHalf));
          const py = Math.min(height - 1, Math.max(0, y + ky - kHalf));
          const idx = (py * width + px) * 4;
          const weight = kernel[ky][kx];

          r += data[idx] * weight;
          g += data[idx + 1] * weight;
          b += data[idx + 2] * weight;
        }
      }

      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = Math.min(255, Math.max(0, r / div + offset));
      resultData[dstIdx + 1] = Math.min(255, Math.max(0, g / div + offset));
      resultData[dstIdx + 2] = Math.min(255, Math.max(0, b / div + offset));
      resultData[dstIdx + 3] = data[dstIdx + 3]; // Preserve alpha
    }
  }

  return result;
}

// ==================== Blur Filters ====================

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

// ==================== Sharpen Filters ====================

/**
 * Basic sharpen
 */
export function sharpen(
  imageData: ImageData,
  amount: number = 1
): ImageData {
  const kernel = [
    [0, -amount, 0],
    [-amount, 1 + 4 * amount, -amount],
    [0, -amount, 0],
  ];
  return applyConvolution(imageData, kernel, 1);
}

/**
 * Unsharp mask (professional sharpening)
 */
export function unsharpMask(
  imageData: ImageData,
  amount: number,
  radius: number,
  threshold: number
): ImageData {
  // Create blurred version
  const blurred = gaussianBlur(imageData, radius);
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const factor = amount / 100;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const original = data[i + c];
      const blur = blurred.data[i + c];
      const diff = original - blur;

      // Apply threshold
      if (Math.abs(diff) > threshold) {
        resultData[i + c] = Math.min(255, Math.max(0, original + diff * factor));
      } else {
        resultData[i + c] = original;
      }
    }
    resultData[i + 3] = data[i + 3]; // Preserve alpha
  }

  return result;
}

// ==================== Noise Filters ====================

/**
 * Add noise to image
 */
export function addNoise(
  imageData: ImageData,
  amount: number,
  monochrome: boolean = false
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const intensity = amount * 2.55; // Convert 0-100 to 0-255

  for (let i = 0; i < data.length; i += 4) {
    if (monochrome) {
      const noise = (Math.random() - 0.5) * intensity;
      resultData[i] = Math.min(255, Math.max(0, data[i] + noise));
      resultData[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      resultData[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    } else {
      resultData[i] = Math.min(255, Math.max(0, data[i] + (Math.random() - 0.5) * intensity));
      resultData[i + 1] = Math.min(255, Math.max(0, data[i + 1] + (Math.random() - 0.5) * intensity));
      resultData[i + 2] = Math.min(255, Math.max(0, data[i + 2] + (Math.random() - 0.5) * intensity));
    }
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Reduce noise (simple median filter)
 */
export function reduceNoise(
  imageData: ImageData,
  strength: number
): ImageData {
  // Use blur as a simple noise reduction
  const radius = Math.ceil(strength / 20);
  return gaussianBlur(imageData, radius);
}

// ==================== Stylize Filters ====================

/**
 * Vignette effect
 */
export function vignette(
  imageData: ImageData,
  amount: number,
  size: number
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const sizeNorm = 1 - size / 100;
  const amountNorm = amount / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = dist / maxDist;

      // Calculate vignette factor
      const vignetteFactor = 1 - Math.pow(Math.max(0, normalizedDist - sizeNorm) / (1 - sizeNorm), 2) * amountNorm;

      const idx = (y * width + x) * 4;
      resultData[idx] = Math.round(data[idx] * vignetteFactor);
      resultData[idx + 1] = Math.round(data[idx + 1] * vignetteFactor);
      resultData[idx + 2] = Math.round(data[idx + 2] * vignetteFactor);
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

/**
 * Pixelate effect
 */
export function pixelate(
  imageData: ImageData,
  blockSize: number
): ImageData {
  if (blockSize <= 1) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      // Calculate average color of block
      let r = 0, g = 0, b = 0, a = 0, count = 0;

      for (let dy = 0; dy < blockSize && by + dy < height; dy++) {
        for (let dx = 0; dx < blockSize && bx + dx < width; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
          count++;
        }
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      a = Math.round(a / count);

      // Fill block with average color
      for (let dy = 0; dy < blockSize && by + dy < height; dy++) {
        for (let dx = 0; dx < blockSize && bx + dx < width; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          resultData[idx] = r;
          resultData[idx + 1] = g;
          resultData[idx + 2] = b;
          resultData[idx + 3] = a;
        }
      }
    }
  }

  return result;
}

/**
 * Emboss effect
 */
export function emboss(
  imageData: ImageData,
  strength: number = 1,
  angle: number = 135
): ImageData {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const kernel = [
    [-strength * dx - strength * dy, -strength * dy, strength * dx - strength * dy],
    [-strength * dx, 1, strength * dx],
    [-strength * dx + strength * dy, strength * dy, strength * dx + strength * dy],
  ];

  return applyConvolution(imageData, kernel, 1, 128);
}

/**
 * Edge detection (Sobel operator)
 */
export function edgeDetect(imageData: ImageData): ImageData {
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];

  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  const gx = applyConvolution(imageData, sobelX, 1);
  const gy = applyConvolution(imageData, sobelY, 1);

  const result = new ImageData(imageData.width, imageData.height);
  const resultData = result.data;

  for (let i = 0; i < gx.data.length; i += 4) {
    const magnitude = Math.sqrt(
      gx.data[i] * gx.data[i] + gy.data[i] * gy.data[i]
    );
    resultData[i] = Math.min(255, magnitude);
    resultData[i + 1] = Math.min(255, magnitude);
    resultData[i + 2] = Math.min(255, magnitude);
    resultData[i + 3] = imageData.data[i + 3];
  }

  return result;
}

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

// ==================== Radial Blur ====================

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

// ==================== Surface Blur ====================

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

// ==================== Smart Sharpen ====================

/**
 * Smart Sharpen — advanced sharpening with blur type selection
 * and separate shadow/highlight controls.
 */
export function smartSharpen(
  imageData: ImageData,
  amount: number,
  radius: number,
  reduceNoise: number = 0,
  removeType: 'gaussian' | 'lens' | 'motion' = 'gaussian',
  motionAngle: number = 0
): ImageData {
  if (amount <= 0 || radius <= 0) return imageData;

  // Create the blur based on remove type
  let blurred: ImageData;
  switch (removeType) {
    case 'motion':
      blurred = motionBlur(imageData, motionAngle, radius);
      break;
    case 'lens':
      // Approximate lens blur with slightly different Gaussian
      blurred = gaussianBlur(imageData, radius * 0.8);
      break;
    default:
      blurred = gaussianBlur(imageData, radius);
  }

  // Optional noise reduction pre-pass
  if (reduceNoise > 0) {
    blurred = gaussianBlur(blurred, reduceNoise * 0.3);
  }

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const factor = amount / 100;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const original = data[i + c];
      const blur = blurred.data[i + c];
      const diff = original - blur;
      resultData[i + c] = Math.min(255, Math.max(0, Math.round(original + diff * factor)));
    }
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

// ==================== Distort Filters ====================

/**
 * Twirl distortion — rotates pixels around center with decreasing strength.
 */
export function twirl(
  imageData: ImageData,
  angle: number,
  centerX: number = 0.5,
  centerY: number = 0.5
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width * centerX, cy = height * centerY;
  const maxRadius = Math.min(width, height) / 2;
  const rad = (angle * Math.PI) / 180;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dstIdx = (y * width + x) * 4;

      if (dist < maxRadius) {
        const twirlAmount = rad * (1 - dist / maxRadius);
        const cos = Math.cos(twirlAmount), sin = Math.sin(twirlAmount);
        const sx = Math.round(cx + dx * cos - dy * sin);
        const sy = Math.round(cy + dx * sin + dy * cos);
        const srcIdx = (Math.min(height - 1, Math.max(0, sy)) * width + Math.min(width - 1, Math.max(0, sx))) * 4;
        resultData[dstIdx] = data[srcIdx];
        resultData[dstIdx + 1] = data[srcIdx + 1];
        resultData[dstIdx + 2] = data[srcIdx + 2];
        resultData[dstIdx + 3] = data[srcIdx + 3];
      } else {
        resultData[dstIdx] = data[dstIdx];
        resultData[dstIdx + 1] = data[dstIdx + 1];
        resultData[dstIdx + 2] = data[dstIdx + 2];
        resultData[dstIdx + 3] = data[dstIdx + 3];
      }
    }
  }
  return result;
}

/**
 * Spherize distortion — wraps image around a sphere.
 */
export function spherize(
  imageData: ImageData,
  amount: number,
  mode: 'normal' | 'horizontal' | 'vertical' = 'normal'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;
  const factor = amount / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx = (x - cx) / cx; // -1 to 1
      let ny = (y - cy) / cy;

      const r2 = nx * nx + ny * ny;
      if (r2 < 1) {
        const r = Math.sqrt(r2);
        const theta = Math.atan2(ny, nx);
        const newR = r + (1 - r) * r * factor * 0.5;

        if (mode === 'horizontal') {
          nx = Math.cos(theta) * newR;
        } else if (mode === 'vertical') {
          ny = Math.sin(theta) * newR;
        } else {
          nx = Math.cos(theta) * newR;
          ny = Math.sin(theta) * newR;
        }
      }

      const sx = Math.round(nx * cx + cx);
      const sy = Math.round(ny * cy + cy);
      const srcIdx = (Math.min(height - 1, Math.max(0, sy)) * width + Math.min(width - 1, Math.max(0, sx))) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/**
 * Pinch distortion — pinches or expands from center.
 */
export function pinch(
  imageData: ImageData,
  amount: number
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;
  const maxR = Math.min(cx, cy);
  const factor = amount / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dstIdx = (y * width + x) * 4;

      if (dist < maxR && dist > 0) {
        const normalizedDist = dist / maxR;
        const newDist = Math.pow(normalizedDist, 1 + factor) * maxR;
        const sx = Math.round(cx + (dx / dist) * newDist);
        const sy = Math.round(cy + (dy / dist) * newDist);
        const srcIdx = (Math.min(height - 1, Math.max(0, sy)) * width + Math.min(width - 1, Math.max(0, sx))) * 4;
        resultData[dstIdx] = data[srcIdx];
        resultData[dstIdx + 1] = data[srcIdx + 1];
        resultData[dstIdx + 2] = data[srcIdx + 2];
        resultData[dstIdx + 3] = data[srcIdx + 3];
      } else {
        resultData[dstIdx] = data[dstIdx];
        resultData[dstIdx + 1] = data[dstIdx + 1];
        resultData[dstIdx + 2] = data[dstIdx + 2];
        resultData[dstIdx + 3] = data[dstIdx + 3];
      }
    }
  }
  return result;
}

/**
 * Wave distortion — applies sine wave displacement.
 */
export function wave(
  imageData: ImageData,
  amplitude: number,
  wavelength: number,
  type: 'sine' | 'triangle' | 'square' = 'sine'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let offsetX = 0, offsetY = 0;
      const phase = (2 * Math.PI * x) / Math.max(1, wavelength);

      switch (type) {
        case 'sine':
          offsetY = Math.sin(phase) * amplitude;
          offsetX = Math.sin((2 * Math.PI * y) / Math.max(1, wavelength)) * amplitude;
          break;
        case 'triangle':
          offsetY = (2 * Math.abs(2 * ((x / Math.max(1, wavelength)) % 1) - 1) - 1) * amplitude;
          break;
        case 'square':
          offsetY = (Math.sin(phase) >= 0 ? 1 : -1) * amplitude;
          break;
      }

      const sx = Math.min(width - 1, Math.max(0, Math.round(x + offsetX)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + offsetY)));
      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/**
 * Ripple distortion — concentric ripple effect from center.
 */
export function ripple(
  imageData: ImageData,
  amplitude: number,
  frequency: number
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.sin(dist * frequency * 0.1) * amplitude;

      const angle = Math.atan2(dy, dx);
      const sx = Math.round(x + Math.cos(angle) * offset);
      const sy = Math.round(y + Math.sin(angle) * offset);

      const srcIdx = (Math.min(height - 1, Math.max(0, sy)) * width + Math.min(width - 1, Math.max(0, sx))) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/**
 * Polar Coordinates — converts between rectangular and polar coordinates.
 */
export function polarCoordinates(
  imageData: ImageData,
  mode: 'rectangular-to-polar' | 'polar-to-rectangular'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx: number, sy: number;

      if (mode === 'rectangular-to-polar') {
        const angle = (x / width) * 2 * Math.PI;
        const radius = (y / height) * maxR;
        sx = Math.round(cx + radius * Math.cos(angle));
        sy = Math.round(cy + radius * Math.sin(angle));
      } else {
        const dx = x - cx, dy = y - cy;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        sx = Math.round((angle / (2 * Math.PI) + 0.5) * width) % width;
        sy = Math.round((radius / maxR) * height);
      }

      sx = Math.min(width - 1, Math.max(0, sx));
      sy = Math.min(height - 1, Math.max(0, sy));
      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/**
 * ZigZag distortion — pond ripple effect.
 */
export function zigZag(
  imageData: ImageData,
  amount: number,
  ridges: number,
  style: 'around-center' | 'out-from-center' | 'pond-ripples' = 'pond-ripples'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const normalizedDist = dist / maxR;
      const displacement = Math.sin(normalizedDist * ridges * Math.PI * 2) * amount;

      let sx: number, sy: number;
      if (style === 'around-center') {
        const newAngle = angle + (displacement / maxR);
        sx = Math.round(cx + dist * Math.cos(newAngle));
        sy = Math.round(cy + dist * Math.sin(newAngle));
      } else {
        sx = Math.round(x + Math.cos(angle) * displacement);
        sy = Math.round(y + Math.sin(angle) * displacement);
      }

      sx = Math.min(width - 1, Math.max(0, sx));
      sy = Math.min(height - 1, Math.max(0, sy));
      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

// ==================== Apply Filter to Canvas ====================

// ==================== Levels ====================

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

// ==================== Curves ====================

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

// ==================== Color Balance ====================

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

// ==================== Selective Hue/Saturation ====================

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

// ==================== High Pass Filter ====================

/**
 * High Pass filter — extracts edges/detail by subtracting a blurred version.
 * Result is centered at gray (128). Used with Overlay blend for sharpening.
 */
export function highPass(imageData: ImageData, radius: number): ImageData {
  if (radius <= 0) return imageData;

  const blurred = gaussianBlur(imageData, radius);
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let i = 0; i < data.length; i += 4) {
    resultData[i]     = Math.min(255, Math.max(0, (data[i]     - blurred.data[i])     + 128));
    resultData[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - blurred.data[i + 1]) + 128));
    resultData[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - blurred.data[i + 2]) + 128));
    resultData[i + 3] = data[i + 3];
  }

  return result;
}

// ==================== Oil Paint Filter ====================

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

// ==================== Phase 5: Complex Filters ====================

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

/**
 * Liquify — mesh-based warp deformation
 * Uses forward warp at brush position with configurable tools.
 */
export function liquify(
  imageData: ImageData,
  deformations: LiquifyDeformation[]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  // Build displacement map from all deformations
  const dispX = new Float32Array(width * height);
  const dispY = new Float32Array(width * height);

  for (const def of deformations) {
    const { cx, cy, radius, dx, dy, pressure, tool } = def;
    const r2 = radius * radius;

    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distX = x - cx;
        const distY = y - cy;
        const dist2 = distX * distX + distY * distY;
        if (dist2 >= r2) continue;

        // Gaussian falloff
        const falloff = Math.exp(-dist2 / (2 * (radius * 0.5) * (radius * 0.5))) * pressure;
        const idx = y * width + x;

        switch (tool) {
          case 'push':
            dispX[idx] += dx * falloff;
            dispY[idx] += dy * falloff;
            break;
          case 'twirl-cw':
            dispX[idx] += -distY * falloff * 0.05;
            dispY[idx] += distX * falloff * 0.05;
            break;
          case 'twirl-ccw':
            dispX[idx] += distY * falloff * 0.05;
            dispY[idx] += -distX * falloff * 0.05;
            break;
          case 'pucker':
            dispX[idx] += -distX * falloff * 0.1;
            dispY[idx] += -distY * falloff * 0.1;
            break;
          case 'bloat':
            dispX[idx] += distX * falloff * 0.1;
            dispY[idx] += distY * falloff * 0.1;
            break;
          case 'reconstruct':
            dispX[idx] *= (1 - falloff);
            dispY[idx] *= (1 - falloff);
            break;
          case 'freeze':
            // Freeze prevents further modifications — handled externally
            break;
          case 'smooth': {
            // Average neighboring displacements to smooth the warp
            let avgDx = 0, avgDy = 0, cnt = 0;
            for (let sy = -1; sy <= 1; sy++) {
              for (let sx = -1; sx <= 1; sx++) {
                const nx = x + sx, ny = y + sy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const ni = ny * width + nx;
                  avgDx += dispX[ni]; avgDy += dispY[ni]; cnt++;
                }
              }
            }
            if (cnt > 0) {
              dispX[idx] += (avgDx / cnt - dispX[idx]) * falloff;
              dispY[idx] += (avgDy / cnt - dispY[idx]) * falloff;
            }
            break;
          }
          case 'push-left': {
            // Pushes pixels perpendicular (left) to brush stroke direction
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            dispX[idx] += (dy / len) * falloff * radius * 0.1;
            dispY[idx] += (-dx / len) * falloff * radius * 0.1;
            break;
          }
          case 'thaw':
            // Thaw removes freeze — resets freeze state (handled externally, but also reconstruct-like)
            dispX[idx] *= (1 - falloff);
            dispY[idx] *= (1 - falloff);
            break;
        }
      }
    }
  }

  // Apply displacement map with bilinear interpolation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const srcX = x - dispX[idx];
      const srcY = y - dispY[idx];

      // Bilinear interpolation
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, width - 1);
      const y1 = Math.min(y0 + 1, height - 1);
      const fx = srcX - x0;
      const fy = srcY - y0;

      const sx0 = Math.max(0, Math.min(x0, width - 1));
      const sy0 = Math.max(0, Math.min(y0, height - 1));
      const sx1 = Math.max(0, Math.min(x1, width - 1));
      const sy1 = Math.max(0, Math.min(y1, height - 1));

      const i00 = (sy0 * width + sx0) * 4;
      const i10 = (sy0 * width + sx1) * 4;
      const i01 = (sy1 * width + sx0) * 4;
      const i11 = (sy1 * width + sx1) * 4;

      const outIdx = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        resultData[outIdx + c] = Math.round(
          data[i00 + c] * (1 - fx) * (1 - fy) +
          data[i10 + c] * fx * (1 - fy) +
          data[i01 + c] * (1 - fx) * fy +
          data[i11 + c] * fx * fy
        );
      }
    }
  }

  return result;
}

export interface LiquifyDeformation {
  cx: number;         // center X
  cy: number;         // center Y
  radius: number;     // brush radius
  dx: number;         // displacement X (for push tool)
  dy: number;         // displacement Y (for push tool)
  pressure: number;   // 0-1 brush pressure
  tool: LiquifyTool;
}

export type LiquifyTool = 'push' | 'twirl-cw' | 'twirl-ccw' | 'pucker' | 'bloat' | 'reconstruct' | 'freeze' | 'smooth' | 'push-left' | 'thaw';

/**
 * Lens Correction — correct barrel/pincushion distortion, chromatic aberration, and vignette
 */
export function lensCorrection(
  imageData: ImageData,
  barrelDistortion: number = 0,       // -100 to 100
  chromaticAberration: number = 0,     // 0 to 100
  vignette: number = 0,               // -100 to 100
  verticalPerspective: number = 0,     // -100 to 100
  horizontalPerspective: number = 0    // -100 to 100
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2;
  const cy = height / 2;
  const k = barrelDistortion / 5000;  // normalize
  const ca = chromaticAberration / 1000;
  const vp = verticalPerspective / 500;
  const hp = horizontalPerspective / 500;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalize coordinates to [-1, 1]
      let nx = (x - cx) / cx;
      let ny = (y - cy) / cy;

      // Perspective correction
      const perspDenom = 1 + hp * nx + vp * ny;
      nx /= perspDenom;
      ny /= perspDenom;

      // Barrel/pincushion distortion
      const r2 = nx * nx + ny * ny;
      const distortionFactor = 1 + k * r2;

      // Sample each color channel with slight offset for chromatic aberration
      const outIdx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        const channelOffset = c === 0 ? -ca : c === 2 ? ca : 0;
        const factor = distortionFactor + channelOffset * r2;

        const srcNx = nx * factor;
        const srcNy = ny * factor;
        const srcX = srcNx * cx + cx;
        const srcY = srcNy * cy + cy;

        if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
          // Bilinear interpolation
          const x0 = Math.floor(srcX);
          const y0 = Math.floor(srcY);
          const fx = srcX - x0;
          const fy = srcY - y0;
          const i00 = (y0 * width + x0) * 4 + c;
          const i10 = (y0 * width + x0 + 1) * 4 + c;
          const i01 = ((y0 + 1) * width + x0) * 4 + c;
          const i11 = ((y0 + 1) * width + x0 + 1) * 4 + c;
          resultData[outIdx + c] = Math.round(
            data[i00] * (1 - fx) * (1 - fy) +
            data[i10] * fx * (1 - fy) +
            data[i01] * (1 - fx) * fy +
            data[i11] * fx * fy
          );
        } else {
          resultData[outIdx + c] = 0;
        }
      }

      // Alpha channel (no CA)
      const srcX = nx * distortionFactor * cx + cx;
      const srcY = ny * distortionFactor * cy + cy;
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const si = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        resultData[outIdx + 3] = data[si + 3];
      } else {
        resultData[outIdx + 3] = 0;
      }

      // Vignette
      if (vignette !== 0) {
        const r = Math.sqrt(r2) / Math.SQRT2;
        const vigFactor = 1 + (vignette / 100) * r * r;
        for (let c = 0; c < 3; c++) {
          resultData[outIdx + c] = Math.max(0, Math.min(255, resultData[outIdx + c] * vigFactor));
        }
      }
    }
  }

  return result;
}

// ==================== Phase 6: Artistic Filters (15) ====================

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

// ==================== Phase 6: Sketch Filters (14) ====================

/** Bas Relief — embossed relief effect */
export function basRelief(imageData: ImageData, detail: number = 13, _smoothness: number = 3, lightDirection: number = 0): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const dx = Math.round(Math.cos(lightDirection * Math.PI / 180));
  const dy = Math.round(Math.sin(lightDirection * Math.PI / 180));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const sx = Math.max(0, Math.min(width - 1, x + dx));
      const sy = Math.max(0, Math.min(height - 1, y + dy));
      const si = (sy * width + sx) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const lumN = data[si] * 0.299 + data[si + 1] * 0.587 + data[si + 2] * 0.114;
      const relief = 128 + (lum - lumN) * detail / 10;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, relief));
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Chalk & Charcoal */
export function chalkAndCharcoal(imageData: ImageData, chalkArea: number = 6, charcoalArea: number = 6, pressure: number = 1): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const threshold = 128 + (chalkArea - charcoalArea) * 5;
    const val = lum > threshold ? Math.min(255, 200 + (lum - threshold) * pressure) : Math.max(0, 50 - (threshold - lum) * pressure);
    d[i] = d[i + 1] = d[i + 2] = val;
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Charcoal */
export function charcoal(imageData: ImageData, thickness: number = 1, detail: number = 5): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + thickness, width - 1);
      const ny = Math.min(y + thickness, height - 1);
      const ni = (ny * width + nx) * 4;
      const edge = Math.abs(data[i] - data[ni]) + Math.abs(data[i + 1] - data[ni + 1]) + Math.abs(data[i + 2] - data[ni + 2]);
      const val = edge > detail * 10 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Chrome — metallic chrome surface */
export function chrome(imageData: ImageData, detail: number = 4, _smoothness: number = 7): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + 1, width - 1);
      const ny = Math.min(y + 1, height - 1);
      const ni = (ny * width + nx) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const lumN = data[ni] * 0.299 + data[ni + 1] * 0.587 + data[ni + 2] * 0.114;
      const val = Math.sin((lum - lumN) * detail / 50 * Math.PI) * 127 + 128;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, val));
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Conte Crayon — conte crayon on textured paper */
export function conteCrayon(imageData: ImageData, fgLevel: number = 11, bgLevel: number = 7): ImageData {
  return chalkAndCharcoal(imageData, bgLevel, fgLevel, 1);
}

/** Graphic Pen — fine ink pen strokes */
export function graphicPen(imageData: ImageData, strokeLength: number = 15, lightDarkBalance: number = 50, strokeDirection: number = 45): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const dirX = Math.cos(strokeDirection * Math.PI / 180);
  const dirY = Math.sin(strokeDirection * Math.PI / 180);
  const threshold = lightDarkBalance * 2.55;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const sx = Math.max(0, Math.min(width - 1, x + Math.round(dirX * strokeLength / 5)));
      const sy = Math.max(0, Math.min(height - 1, y + Math.round(dirY * strokeLength / 5)));
      const si = (sy * width + sx) * 4;
      const lumN = data[si] * 0.299 + data[si + 1] * 0.587 + data[si + 2] * 0.114;
      const val = Math.abs(lum - lumN) > threshold / 5 ? 0 : (lum < threshold ? 0 : 255);
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Halftone Pattern — CMYK halftone dots */
export function halftonePattern(imageData: ImageData, dotSize: number = 5, contrast: number = 5, patternType: 'circle' | 'dot' | 'line' = 'circle'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const cellSize = Math.max(2, dotSize);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const cellX = (x % cellSize) - cellSize / 2;
      const cellY = (y % cellSize) - cellSize / 2;
      let dist: number;
      if (patternType === 'line') {
        dist = Math.abs(cellY);
      } else {
        dist = Math.sqrt(cellX * cellX + cellY * cellY);
      }
      const threshold = (255 - lum) / 255 * cellSize * contrast / 10;
      const val = dist < threshold ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Note Paper — embossed paper texture */
export function notePaper(imageData: ImageData, _imageBalance: number = 25, graininess: number = 10, relief: number = 11): ImageData {
  return basRelief(imageData, relief, graininess, 0);
}

/** Photocopy — high contrast photocopy effect */
export function photocopy(imageData: ImageData, detail: number = 7, darkness: number = 8): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const threshold = (10 - darkness) * 25;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = Math.min(x + Math.max(1, Math.round(10 / detail)), width - 1);
      const ny = Math.min(y + Math.max(1, Math.round(10 / detail)), height - 1);
      const ni = (ny * width + nx) * 4;
      const edge = Math.abs(data[i] - data[ni]) + Math.abs(data[i + 1] - data[ni + 1]) + Math.abs(data[i + 2] - data[ni + 2]);
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const val = (edge > threshold || lum < threshold) ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Plaster — embossed plaster effect */
export function plaster(imageData: ImageData, _imageBalance: number = 25, smoothness: number = 2, lightDirection: number = 0): ImageData {
  return basRelief(imageData, 10, smoothness, lightDirection);
}

/** Reticulation — grainy reticulation pattern */
export function reticulation(imageData: ImageData, density: number = 12, fgLevel: number = 40, bgLevel: number = 5): ImageData {
  const { data } = imageData;
  const result = new ImageData(imageData.width, imageData.height);
  const d = result.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const grain = (Math.random() - 0.5) * density * 5;
    const val = lum + grain;
    d[i] = d[i + 1] = d[i + 2] = Math.max(bgLevel, Math.min(fgLevel * 6, val));
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Stamp — rubber stamp effect */
export function stamp(imageData: ImageData, lightDarkBalance: number = 25, _smoothness: number = 5): ImageData {
  const { data } = imageData;
  const result = new ImageData(imageData.width, imageData.height);
  const d = result.data;
  const threshold = lightDarkBalance * 10;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const val = lum > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = val;
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Torn Edges — torn paper edge effect */
export function tornEdges(imageData: ImageData, imageBalance: number = 25, _smoothness: number = 11, contrast: number = 17): ImageData {
  const { data } = imageData;
  const result = new ImageData(imageData.width, imageData.height);
  const d = result.data;
  const threshold = imageBalance * 10;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const noise = (Math.random() - 0.5) * contrast;
    const val = (lum + noise) > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = val;
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Water Paper — fibrous wet paper texture */
export function waterPaper(imageData: ImageData, fiberLength: number = 15, brightness: number = 60, _contrast: number = 80): ImageData {
  return dryBrush(imageData, Math.max(1, Math.round(fiberLength / 5)), Math.max(1, Math.round(brightness / 10)));
}

// ==================== Stylize Filters (Advanced) ====================

/**
 * Solarize — invert pixels above threshold
 * Simulates partial exposure of photographic film to light
 */
export function solarize(imageData: ImageData, threshold: number = 128): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < data.length; i += 4) {
    d[i] = data[i] > threshold ? 255 - data[i] : data[i];
    d[i + 1] = data[i + 1] > threshold ? 255 - data[i + 1] : data[i + 1];
    d[i + 2] = data[i + 2] > threshold ? 255 - data[i + 2] : data[i + 2];
    d[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Find Edges — Sobel edge detection
 * Applies horizontal and vertical Sobel 3x3 kernels and combines magnitude
 */
export function findEdges(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;

  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  const gx = applyConvolution(imageData, sobelX, 1);
  const gy = applyConvolution(imageData, sobelY, 1);

  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < data.length; i += 4) {
    const mr = Math.min(255, Math.sqrt(gx.data[i] * gx.data[i] + gy.data[i] * gy.data[i]));
    const mg = Math.min(255, Math.sqrt(gx.data[i + 1] * gx.data[i + 1] + gy.data[i + 1] * gy.data[i + 1]));
    const mb = Math.min(255, Math.sqrt(gx.data[i + 2] * gx.data[i + 2] + gy.data[i + 2] * gy.data[i + 2]));
    d[i] = mr;
    d[i + 1] = mg;
    d[i + 2] = mb;
    d[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Trace Contour — contour detection at a luminance threshold
 * Draws contour lines where pixel luminance crosses the given level
 */
export function traceContour(imageData: ImageData, level: number = 128, edge: 'lower' | 'upper' = 'lower'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  const getLum = (i: number) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = getLum(idx);
      let isContour = false;

      // Check 4-connected neighbors
      const neighbors = [
        x > 0 ? (y * width + x - 1) * 4 : -1,
        x < width - 1 ? (y * width + x + 1) * 4 : -1,
        y > 0 ? ((y - 1) * width + x) * 4 : -1,
        y < height - 1 ? ((y + 1) * width + x) * 4 : -1,
      ];

      for (const nIdx of neighbors) {
        if (nIdx < 0) continue;
        const nLum = getLum(nIdx);
        if (edge === 'lower') {
          // Contour where pixel is below level and neighbor is at or above
          if (lum < level && nLum >= level) {
            isContour = true;
            break;
          }
        } else {
          // Contour where pixel is above level and neighbor is at or below
          if (lum >= level && nLum < level) {
            isContour = true;
            break;
          }
        }
      }

      const val = isContour ? 255 : 0;
      d[idx] = val;
      d[idx + 1] = val;
      d[idx + 2] = val;
      d[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

/**
 * Diffuse — random pixel displacement
 * Modes: 'normal' (any swap), 'darkenOnly' (swap only if darker), 'lightenOnly' (swap only if lighter)
 */
export function diffuse(imageData: ImageData, mode: 'normal' | 'darkenOnly' | 'lightenOnly' = 'normal'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Copy source data first
  d.set(data);

  const radius = 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ox = x + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
      const oy = y + Math.floor(Math.random() * (radius * 2 + 1)) - radius;

      if (ox < 0 || ox >= width || oy < 0 || oy >= height) continue;

      const srcIdx = (oy * width + ox) * 4;
      const dstIdx = (y * width + x) * 4;

      const srcLum = data[srcIdx] * 0.299 + data[srcIdx + 1] * 0.587 + data[srcIdx + 2] * 0.114;
      const dstLum = data[dstIdx] * 0.299 + data[dstIdx + 1] * 0.587 + data[dstIdx + 2] * 0.114;

      if (mode === 'darkenOnly' && srcLum >= dstLum) continue;
      if (mode === 'lightenOnly' && srcLum <= dstLum) continue;

      d[dstIdx] = data[srcIdx];
      d[dstIdx + 1] = data[srcIdx + 1];
      d[dstIdx + 2] = data[srcIdx + 2];
      // Preserve original alpha
    }
  }

  return result;
}

/**
 * Glowing Edges — neon edge glow on black background
 * Finds edges, boosts brightness, and applies blur for glow effect
 */
export function glowingEdges(imageData: ImageData, edgeWidth: number = 2, edgeBrightness: number = 6, smoothness: number = 5): ImageData {
  const { width, height, data } = imageData;

  // Step 1: Edge detection with Sobel
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  const gx = applyConvolution(imageData, sobelX, 1);
  const gy = applyConvolution(imageData, sobelY, 1);

  // Step 2: Compute edge magnitude per channel with brightness boost
  const edges = new ImageData(width, height);
  const ed = edges.data;
  const brightnessFactor = edgeBrightness;

  for (let i = 0; i < data.length; i += 4) {
    const mr = Math.min(255, Math.sqrt(gx.data[i] * gx.data[i] + gy.data[i] * gy.data[i]) * brightnessFactor);
    const mg = Math.min(255, Math.sqrt(gx.data[i + 1] * gx.data[i + 1] + gy.data[i + 1] * gy.data[i + 1]) * brightnessFactor);
    const mb = Math.min(255, Math.sqrt(gx.data[i + 2] * gx.data[i + 2] + gy.data[i + 2] * gy.data[i + 2]) * brightnessFactor);
    ed[i] = mr;
    ed[i + 1] = mg;
    ed[i + 2] = mb;
    ed[i + 3] = data[i + 3];
  }

  // Step 3: Thicken edges by dilation
  let current = edges;
  for (let pass = 1; pass < edgeWidth; pass++) {
    const dilated = new ImageData(width, height);
    const dd = dilated.data;
    const cd = current.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let maxR = cd[idx], maxG = cd[idx + 1], maxB = cd[idx + 2];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const ni = (ny * width + nx) * 4;
              maxR = Math.max(maxR, cd[ni]);
              maxG = Math.max(maxG, cd[ni + 1]);
              maxB = Math.max(maxB, cd[ni + 2]);
            }
          }
        }
        dd[idx] = maxR;
        dd[idx + 1] = maxG;
        dd[idx + 2] = maxB;
        dd[idx + 3] = data[idx + 3];
      }
    }
    current = dilated;
  }

  // Step 4: Apply blur for glow
  if (smoothness > 0) {
    current = gaussianBlur(current, smoothness);
  }

  return current;
}

/**
 * Tiles — split image into NxN tiles with random offsets
 * Empty space is filled with fillColor
 */
export function tiles(
  imageData: ImageData,
  numberOfTiles: number = 10,
  maxOffset: number = 10,
  fillColor: number[] = [128, 128, 128]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Fill background with fillColor
  for (let i = 0; i < d.length; i += 4) {
    d[i] = fillColor[0];
    d[i + 1] = fillColor[1];
    d[i + 2] = fillColor[2];
    d[i + 3] = 255;
  }

  const tileW = Math.max(1, Math.floor(width / numberOfTiles));
  const tileH = Math.max(1, Math.floor(height / numberOfTiles));

  for (let ty = 0; ty < numberOfTiles; ty++) {
    for (let tx = 0; tx < numberOfTiles; tx++) {
      const offsetX = Math.floor(Math.random() * (maxOffset * 2 + 1)) - maxOffset;
      const offsetY = Math.floor(Math.random() * (maxOffset * 2 + 1)) - maxOffset;

      const srcX = tx * tileW;
      const srcY = ty * tileH;

      for (let py = 0; py < tileH; py++) {
        for (let px = 0; px < tileW; px++) {
          const sx = srcX + px;
          const sy = srcY + py;
          const dx = sx + offsetX;
          const dy = sy + offsetY;

          if (sx >= width || sy >= height) continue;
          if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;

          const srcIdx = (sy * width + sx) * 4;
          const dstIdx = (dy * width + dx) * 4;

          d[dstIdx] = data[srcIdx];
          d[dstIdx + 1] = data[srcIdx + 1];
          d[dstIdx + 2] = data[srcIdx + 2];
          d[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }
  }

  return result;
}

/**
 * Wind — horizontal motion streaks
 * Methods: 'wind' (short streaks), 'blast' (longer), 'stagger' (variable length)
 * Direction: 'left' or 'right'
 */
export function wind(
  imageData: ImageData,
  method: 'wind' | 'blast' | 'stagger' = 'wind',
  direction: 'left' | 'right' = 'right',
  strength: number = 20
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Copy source
  d.set(data);

  const dir = direction === 'right' ? 1 : -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Determine if this pixel triggers a streak based on edge contrast
      const nextX = x + dir;
      if (nextX < 0 || nextX >= width) continue;

      const nextIdx = (y * width + nextX) * 4;
      const diff = Math.abs(data[idx] - data[nextIdx]) +
        Math.abs(data[idx + 1] - data[nextIdx + 1]) +
        Math.abs(data[idx + 2] - data[nextIdx + 2]);

      // Only create streaks at edges (where contrast exists)
      if (diff < 30) continue;

      // Determine streak length based on method
      let streakLen: number;
      if (method === 'wind') {
        streakLen = Math.floor(Math.random() * strength) + 1;
      } else if (method === 'blast') {
        streakLen = Math.floor(Math.random() * strength * 2) + strength;
      } else {
        // stagger: variable length with gaps
        streakLen = Math.random() < 0.5
          ? Math.floor(Math.random() * strength * 0.5) + 1
          : Math.floor(Math.random() * strength * 2) + 1;
      }

      // Draw streak
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      for (let s = 1; s <= streakLen; s++) {
        const sx = x + s * dir;
        if (sx < 0 || sx >= width) break;

        const sIdx = (y * width + sx) * 4;
        const alpha = 1.0 - (s / streakLen); // Fade out along streak

        d[sIdx] = Math.min(255, Math.round(d[sIdx] * (1 - alpha) + r * alpha));
        d[sIdx + 1] = Math.min(255, Math.round(d[sIdx + 1] * (1 - alpha) + g * alpha));
        d[sIdx + 2] = Math.min(255, Math.round(d[sIdx + 2] * (1 - alpha) + b * alpha));
      }
    }
  }

  return result;
}

// ==================== Pixelate Filters ====================

/**
 * Crystallize — Voronoi-style crystallization effect.
 * Divides the image into grid cells of the given size and fills each cell
 * with the average color of the pixels it contains.
 */
export function crystallize(imageData: ImageData, cellSize: number = 10): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const cs = Math.max(1, Math.round(cellSize));

  for (let cy = 0; cy < height; cy += cs) {
    for (let cx = 0; cx < width; cx += cs) {
      const x1 = cx;
      const y1 = cy;
      const x2 = Math.min(cx + cs, width);
      const y2 = Math.min(cy + cs, height);
      const count = (x2 - x1) * (y2 - y1);

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          aSum += data[i + 3];
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          d[i] = rAvg;
          d[i + 1] = gAvg;
          d[i + 2] = bAvg;
          d[i + 3] = aAvg;
        }
      }
    }
  }

  return result;
}

/**
 * Facet — Facet effect that posterizes using neighborhood median.
 * For each pixel, examines a 3x3 neighborhood and replaces the pixel
 * with the median color value, producing a faceted/posterized look.
 */
export function facet(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rArr: number[] = [];
      const gArr: number[] = [];
      const bArr: number[] = [];

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;
          rArr.push(data[idx]);
          gArr.push(data[idx + 1]);
          bArr.push(data[idx + 2]);
        }
      }

      rArr.sort((a, b) => a - b);
      gArr.sort((a, b) => a - b);
      bArr.sort((a, b) => a - b);

      const i = (y * width + x) * 4;
      d[i] = rArr[4];
      d[i + 1] = gArr[4];
      d[i + 2] = bArr[4];
      d[i + 3] = data[i + 3];
    }
  }

  return result;
}

/**
 * Fragment — Ghost/fragment effect.
 * Creates 4 copies of the image offset diagonally by the given distance
 * and averages them together, producing a ghosted/fragmented look.
 */
export function fragment(imageData: ImageData, distance: number = 5): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const dist = Math.round(distance);

  // 4 diagonal offsets
  const offsets = [
    [-dist, -dist],
    [dist, -dist],
    [-dist, dist],
    [dist, dist],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (const [ox, oy] of offsets) {
        const sx = Math.min(width - 1, Math.max(0, x + ox));
        const sy = Math.min(height - 1, Math.max(0, y + oy));
        const idx = (sy * width + sx) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        a += data[idx + 3];
      }

      const i = (y * width + x) * 4;
      d[i] = Math.round(r / 4);
      d[i + 1] = Math.round(g / 4);
      d[i + 2] = Math.round(b / 4);
      d[i + 3] = Math.round(a / 4);
    }
  }

  return result;
}

/**
 * Mezzotint — Mezzotint dithering effect.
 * Converts the image to luminance and applies random dithering patterns
 * based on the specified type.
 *
 * Supported types: 'fineDots', 'mediumDots', 'coarseDots',
 * 'fineLines', 'mediumLines', 'coarseLines',
 * 'shortStrokes', 'mediumStrokes', 'longStrokes', 'grainyDots'
 */
export function mezzotint(
  imageData: ImageData,
  type: 'fineDots' | 'mediumDots' | 'coarseDots' | 'fineLines' | 'mediumLines' | 'coarseLines' | 'shortStrokes' | 'mediumStrokes' | 'longStrokes' | 'grainyDots' = 'fineDots'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Determine noise scale and pattern based on type
  const config: Record<string, { scale: number; lineMode: boolean; strokeLen: number }> = {
    fineDots:      { scale: 0.3, lineMode: false, strokeLen: 0 },
    mediumDots:    { scale: 0.5, lineMode: false, strokeLen: 0 },
    coarseDots:    { scale: 0.8, lineMode: false, strokeLen: 0 },
    fineLines:     { scale: 0.3, lineMode: true,  strokeLen: 0 },
    mediumLines:   { scale: 0.5, lineMode: true,  strokeLen: 0 },
    coarseLines:   { scale: 0.8, lineMode: true,  strokeLen: 0 },
    shortStrokes:  { scale: 0.4, lineMode: true,  strokeLen: 2 },
    mediumStrokes: { scale: 0.5, lineMode: true,  strokeLen: 4 },
    longStrokes:   { scale: 0.6, lineMode: true,  strokeLen: 8 },
    grainyDots:    { scale: 1.0, lineMode: false, strokeLen: 0 },
  };

  const { scale, lineMode, strokeLen } = config[type] || config.fineDots;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

      let noise: number;
      if (lineMode && strokeLen > 0) {
        // Stroke pattern: use quantized x for coherence along strokes
        const qx = Math.floor(x / strokeLen) * strokeLen;
        noise = ((Math.sin(qx * 12.9898 + y * 78.233) * 43758.5453) % 1);
        noise = Math.abs(noise) * 255 * scale;
      } else if (lineMode) {
        // Line pattern: noise varies primarily along y
        noise = ((Math.sin(y * 12.9898 + Math.floor(x * 0.1) * 78.233) * 43758.5453) % 1);
        noise = Math.abs(noise) * 255 * scale;
      } else {
        // Dot pattern: fully random per pixel
        noise = Math.random() * 255 * scale;
      }

      const val = lum > noise ? 255 : 0;

      // Apply as color tint (preserve hue ratios)
      if (lum > 0) {
        const ratio = val / lum;
        d[i] = Math.min(255, Math.round(data[i] * ratio));
        d[i + 1] = Math.min(255, Math.round(data[i + 1] * ratio));
        d[i + 2] = Math.min(255, Math.round(data[i + 2] * ratio));
      } else {
        d[i] = d[i + 1] = d[i + 2] = val;
      }
      d[i + 3] = data[i + 3];
    }
  }

  return result;
}

/**
 * Pointillize — Pointillism effect.
 * Divides the image into cells and draws filled circles of each cell's
 * average color on a background color, simulating a pointillist painting.
 */
export function pointillize(
  imageData: ImageData,
  cellSize: number = 6,
  bgColor: [number, number, number] = [255, 255, 255]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const cs = Math.max(2, Math.round(cellSize));
  const radius = cs / 2;

  // Fill background
  for (let i = 0; i < d.length; i += 4) {
    d[i] = bgColor[0];
    d[i + 1] = bgColor[1];
    d[i + 2] = bgColor[2];
    d[i + 3] = data[i + 3];
  }

  // For each cell, compute average color and draw a filled circle
  for (let cy = 0; cy < height; cy += cs) {
    for (let cx = 0; cx < width; cx += cs) {
      const x1 = cx;
      const y1 = cy;
      const x2 = Math.min(cx + cs, width);
      const y2 = Math.min(cy + cs, height);
      const count = (x2 - x1) * (y2 - y1);

      let rSum = 0, gSum = 0, bSum = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);

      // Draw filled circle centered in the cell
      const centerX = cx + radius;
      const centerY = cy + radius;
      const r2 = radius * radius;

      const drawX1 = Math.max(0, Math.floor(centerX - radius));
      const drawY1 = Math.max(0, Math.floor(centerY - radius));
      const drawX2 = Math.min(width, Math.ceil(centerX + radius));
      const drawY2 = Math.min(height, Math.ceil(centerY + radius));

      for (let y = drawY1; y < drawY2; y++) {
        for (let x = drawX1; x < drawX2; x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          if (dx * dx + dy * dy <= r2) {
            const i = (y * width + x) * 4;
            d[i] = rAvg;
            d[i + 1] = gAvg;
            d[i + 2] = bAvg;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Color Halftone — CMYK halftone dot pattern.
 * For each CMYK channel, generates halftone dots at a specified screen angle.
 * Dot size is proportional to the channel intensity. Channels are combined
 * to produce the final color image.
 */
export function colorHalftone(
  imageData: ImageData,
  maxRadius: number = 8,
  channel1Angle: number = 108,
  channel2Angle: number = 162,
  channel3Angle: number = 90,
  channel4Angle: number = 45
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Initialize result to white
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = data[i + 3];
  }

  const mr = Math.max(1, Math.round(maxRadius));
  const cellSize = mr * 2;
  const angles = [channel1Angle, channel2Angle, channel3Angle, channel4Angle];

  // Convert angles to radians
  const rads = angles.map(a => (a * Math.PI) / 180);

  // Convert RGB to CMYK for each pixel
  const cArr = new Float32Array(width * height);
  const mArr = new Float32Array(width * height);
  const yArr = new Float32Array(width * height);
  const kArr = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    const k = 1 - Math.max(r, g, b);
    const invK = k < 1 ? 1 / (1 - k) : 0;
    cArr[i] = (1 - r - k) * invK;
    mArr[i] = (1 - g - k) * invK;
    yArr[i] = (1 - b - k) * invK;
    kArr[i] = k;
  }

  const channelData = [cArr, mArr, yArr, kArr];

  // For each channel, compute halftone dots
  const halftone: Float32Array[] = [
    new Float32Array(width * height),
    new Float32Array(width * height),
    new Float32Array(width * height),
    new Float32Array(width * height),
  ];

  for (let ch = 0; ch < 4; ch++) {
    const cos = Math.cos(rads[ch]);
    const sin = Math.sin(rads[ch]);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Rotate coordinates into screen space
        const rx = x * cos + y * sin;
        const ry = -x * sin + y * cos;

        // Find cell center in rotated space
        const cellCx = (Math.floor(rx / cellSize) + 0.5) * cellSize;
        const cellCy = (Math.floor(ry / cellSize) + 0.5) * cellSize;

        // Map cell center back to image space to sample channel value
        const icx = Math.round(cellCx * cos - cellCy * sin);
        const icy = Math.round(cellCx * sin + cellCy * cos);
        const sx = Math.min(width - 1, Math.max(0, icx));
        const sy = Math.min(height - 1, Math.max(0, icy));
        const channelVal = channelData[ch][sy * width + sx];

        // Distance from current pixel to cell center in rotated space
        const dx = rx - cellCx;
        const dy = ry - cellCy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Dot radius proportional to channel value
        const dotRadius = mr * Math.sqrt(channelVal);

        halftone[ch][y * width + x] = dist <= dotRadius ? channelVal : 0;
      }
    }
  }

  // Combine CMYK halftone channels back to RGB
  for (let i = 0; i < width * height; i++) {
    const c = halftone[0][i];
    const m = halftone[1][i];
    const y = halftone[2][i];
    const k = halftone[3][i];

    const idx = i * 4;
    d[idx] = Math.round(255 * (1 - c) * (1 - k));
    d[idx + 1] = Math.round(255 * (1 - m) * (1 - k));
    d[idx + 2] = Math.round(255 * (1 - y) * (1 - k));
    // alpha already set
  }

  return result;
}

// ==================== Texture Filters ====================

/**
 * Grain — Add film grain noise to an image.
 * Simulates various analog film grain types with controllable intensity and contrast.
 * @param imageData Source image data
 * @param intensity Amount of grain (0-100)
 * @param contrast Black-white distribution of grain (0-100)
 * @param grainType Type of grain pattern: 'regular', 'soft', 'sprinkle', 'clumped',
 *   'contrasty', 'enlarged', 'stippled', 'horizontal', 'vertical', 'speckle'
 */
export function grain(
  imageData: ImageData,
  intensity: number = 40,
  contrast: number = 50,
  grainType: 'regular' | 'soft' | 'sprinkle' | 'clumped' | 'contrasty' | 'enlarged' | 'stippled' | 'horizontal' | 'vertical' | 'speckle' = 'regular'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const amt = (intensity / 100) * 255;
  const contrastFactor = contrast / 50; // 0..2 range

  // Copy original
  d.set(data);

  // Helper: gaussian random (Box-Muller)
  const gaussRand = (): number => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };

  // Generate grain noise buffer
  const grainBuf = new Float32Array(width * height);

  switch (grainType) {
    case 'soft': {
      for (let i = 0; i < grainBuf.length; i++) {
        grainBuf[i] = gaussRand() * 0.5;
      }
      break;
    }
    case 'sprinkle': {
      for (let i = 0; i < grainBuf.length; i++) {
        grainBuf[i] = Math.random() < 0.05 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      }
      break;
    }
    case 'clumped': {
      // Generate base noise then blur for clustering
      const base = new Float32Array(width * height);
      for (let i = 0; i < base.length; i++) base[i] = (Math.random() - 0.5) * 2;
      // Simple 3x3 box blur
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              sum += base[(y + dy) * width + (x + dx)];
            }
          }
          grainBuf[y * width + x] = sum / 9;
        }
      }
      break;
    }
    case 'contrasty': {
      for (let i = 0; i < grainBuf.length; i++) {
        const n = (Math.random() - 0.5) * 2;
        grainBuf[i] = n > 0 ? 1 : -1;
      }
      break;
    }
    case 'enlarged': {
      const scale = 3;
      const sw = Math.ceil(width / scale);
      const sh = Math.ceil(height / scale);
      const small = new Float32Array(sw * sh);
      for (let i = 0; i < small.length; i++) small[i] = (Math.random() - 0.5) * 2;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx = Math.min(sw - 1, Math.floor(x / scale));
          const sy = Math.min(sh - 1, Math.floor(y / scale));
          grainBuf[y * width + x] = small[sy * sw + sx];
        }
      }
      break;
    }
    case 'stippled': {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dot = ((x + y) % 2 === 0) ? (Math.random() - 0.5) * 2 : 0;
          grainBuf[y * width + x] = dot;
        }
      }
      break;
    }
    case 'horizontal': {
      const rowNoise = new Float32Array(height);
      for (let y = 0; y < height; y++) rowNoise[y] = (Math.random() - 0.5) * 2;
      for (let y = 0; y < height; y++) {
        const base = rowNoise[y];
        for (let x = 0; x < width; x++) {
          grainBuf[y * width + x] = base + (Math.random() - 0.5) * 0.3;
        }
      }
      break;
    }
    case 'vertical': {
      const colNoise = new Float32Array(width);
      for (let x = 0; x < width; x++) colNoise[x] = (Math.random() - 0.5) * 2;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          grainBuf[y * width + x] = colNoise[x] + (Math.random() - 0.5) * 0.3;
        }
      }
      break;
    }
    case 'speckle': {
      for (let i = 0; i < grainBuf.length; i++) {
        grainBuf[i] = Math.random() < 0.1 ? 1 : 0;
      }
      break;
    }
    default: {
      // 'regular' — uniform random
      for (let i = 0; i < grainBuf.length; i++) {
        grainBuf[i] = (Math.random() - 0.5) * 2;
      }
      break;
    }
  }

  // Apply grain to pixels
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    let noise = grainBuf[i] * amt;
    // Apply contrast: push toward extremes
    noise = noise * contrastFactor;
    d[idx] = Math.min(255, Math.max(0, d[idx] + noise));
    d[idx + 1] = Math.min(255, Math.max(0, d[idx + 1] + noise));
    d[idx + 2] = Math.min(255, Math.max(0, d[idx + 2] + noise));
    // alpha preserved
  }

  return result;
}

/**
 * Mosaic Tiles — Divide image into rectangular tiles with grout lines.
 * Each tile shows the average color of its region. Grout lines are darkened
 * to simulate the gap between real mosaic tiles.
 * @param imageData Source image data
 * @param tileSize Size of each tile in pixels
 * @param groutWidth Width of grout lines in pixels
 * @param lightenGrout Amount to darken grout (subtracted from RGB, 0-255)
 */
export function mosaicTiles(
  imageData: ImageData,
  tileSize: number = 10,
  groutWidth: number = 1,
  lightenGrout: number = 10
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const ts = Math.max(2, Math.round(tileSize));
  const gw = Math.max(0, Math.round(groutWidth));
  const groutDarken = Math.max(0, lightenGrout) * 10; // scale up for visible effect

  for (let ty = 0; ty < height; ty += ts) {
    for (let tx = 0; tx < width; tx += ts) {
      const x1 = tx;
      const y1 = ty;
      const x2 = Math.min(tx + ts, width);
      const y2 = Math.min(ty + ts, height);
      const count = (x2 - x1) * (y2 - y1);

      // Compute average color for this tile
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          aSum += data[i + 3];
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      // Fill tile with average color, apply grout on edges
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          const isGrout =
            (x - tx) < gw || (tx + ts - 1 - x) < gw ||
            (y - ty) < gw || (ty + ts - 1 - y) < gw;

          if (isGrout) {
            d[i] = Math.max(0, rAvg - groutDarken);
            d[i + 1] = Math.max(0, gAvg - groutDarken);
            d[i + 2] = Math.max(0, bAvg - groutDarken);
          } else {
            d[i] = rAvg;
            d[i + 1] = gAvg;
            d[i + 2] = bAvg;
          }
          d[i + 3] = aAvg;
        }
      }
    }
  }

  return result;
}

/**
 * Patchwork — Similar to mosaic but with embossed edges on each square patch.
 * Each patch shows the average color of its region with a 3D relief effect
 * created by lightening top/left edges and darkening bottom/right edges.
 * @param imageData Source image data
 * @param squareSize Size of each patch in pixels
 * @param relief Strength of emboss relief (0-10)
 */
export function patchwork(
  imageData: ImageData,
  squareSize: number = 5,
  relief: number = 3
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const ss = Math.max(2, Math.round(squareSize));
  const reliefAmt = Math.max(0, Math.min(10, relief)) * 8;

  for (let ty = 0; ty < height; ty += ss) {
    for (let tx = 0; tx < width; tx += ss) {
      const x1 = tx;
      const y1 = ty;
      const x2 = Math.min(tx + ss, width);
      const y2 = Math.min(ty + ss, height);
      const count = (x2 - x1) * (y2 - y1);

      // Compute average color
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          aSum += data[i + 3];
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      // Fill patch with embossed edges
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          const localX = x - tx;
          const localY = y - ty;
          const patchW = x2 - x1;
          const patchH = y2 - y1;

          let offset = 0;
          // Top and left edges: lighten (highlight)
          if (localY === 0 || localX === 0) {
            offset = reliefAmt;
          }
          // Bottom and right edges: darken (shadow)
          else if (localY === patchH - 1 || localX === patchW - 1) {
            offset = -reliefAmt;
          }

          d[i] = Math.min(255, Math.max(0, rAvg + offset));
          d[i + 1] = Math.min(255, Math.max(0, gAvg + offset));
          d[i + 2] = Math.min(255, Math.max(0, bAvg + offset));
          d[i + 3] = aAvg;
        }
      }
    }
  }

  return result;
}

/**
 * Stained Glass — Create a stained glass effect using Voronoi-like cells
 * with thick dark borders. Uses a grid-jittered approach for cell centers
 * and draws dark border lines between cells.
 * @param imageData Source image data
 * @param cellSize Approximate size of each glass cell in pixels
 * @param borderThickness Thickness of dark borders in pixels
 * @param lightIntensity Brightness boost for cell interiors (0-10)
 */
export function stainedGlass(
  imageData: ImageData,
  cellSize: number = 10,
  borderThickness: number = 2,
  lightIntensity: number = 3
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const cs = Math.max(3, Math.round(cellSize));
  const lightBoost = lightIntensity * 5;

  // Generate grid-jittered cell centers
  const cols = Math.ceil(width / cs) + 1;
  const rows = Math.ceil(height / cs) + 1;
  const centers: { x: number; y: number }[] = [];

  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      centers.push({
        x: c * cs + (Math.random() - 0.5) * cs * 0.8,
        y: r * cs + (Math.random() - 0.5) * cs * 0.8,
      });
    }
  }

  // For each pixel, find nearest cell center and second-nearest distance
  const cellMap = new Int32Array(width * height);
  const distMap = new Float32Array(width * height);
  const dist2Map = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minDist = Infinity;
      let min2Dist = Infinity;
      let minIdx = 0;

      // Only check nearby cells for performance
      const approxCol = Math.floor(x / cs);
      const approxRow = Math.floor(y / cs);

      for (let r = approxRow - 2; r <= approxRow + 2; r++) {
        for (let c = approxCol - 2; c <= approxCol + 2; c++) {
          const ci = (r + 1) * (cols + 2) + (c + 1);
          if (ci < 0 || ci >= centers.length) continue;
          const center = centers[ci];
          const dx = x - center.x;
          const dy = y - center.y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            min2Dist = minDist;
            minDist = dist;
            minIdx = ci;
          } else if (dist < min2Dist) {
            min2Dist = dist;
          }
        }
      }

      const idx = y * width + x;
      cellMap[idx] = minIdx;
      distMap[idx] = Math.sqrt(minDist);
      dist2Map[idx] = Math.sqrt(min2Dist);
    }
  }

  // Compute average color per cell
  const cellColors: { r: number; g: number; b: number; a: number; count: number }[] =
    new Array(centers.length).fill(null).map(() => ({ r: 0, g: 0, b: 0, a: 0, count: 0 }));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = cellMap[y * width + x];
      const si = (y * width + x) * 4;
      cellColors[ci].r += data[si];
      cellColors[ci].g += data[si + 1];
      cellColors[ci].b += data[si + 2];
      cellColors[ci].a += data[si + 3];
      cellColors[ci].count++;
    }
  }

  for (const cc of cellColors) {
    if (cc.count > 0) {
      cc.r = Math.round(cc.r / cc.count);
      cc.g = Math.round(cc.g / cc.count);
      cc.b = Math.round(cc.b / cc.count);
      cc.a = Math.round(cc.a / cc.count);
    }
  }

  // Render pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pi = idx * 4;
      const d1 = distMap[idx];
      const d2 = dist2Map[idx];
      const edgeDist = (d2 - d1);

      if (edgeDist < borderThickness) {
        // Border pixel — dark
        d[pi] = 0;
        d[pi + 1] = 0;
        d[pi + 2] = 0;
        d[pi + 3] = 255;
      } else {
        // Cell interior — use cell average color with light boost
        const cc = cellColors[cellMap[idx]];
        d[pi] = Math.min(255, cc.r + lightBoost);
        d[pi + 1] = Math.min(255, cc.g + lightBoost);
        d[pi + 2] = Math.min(255, cc.b + lightBoost);
        d[pi + 3] = cc.a;
      }
    }
  }

  return result;
}

/**
 * Texturizer — Apply a bump-map texture overlay to the image.
 * Generates a procedural texture pattern and applies it as a bump-map
 * with directional lighting to create a tactile surface appearance.
 * @param imageData Source image data
 * @param textureType Type of texture: 'brick', 'burlap', 'canvas', 'sandstone'
 * @param scaling Scale of the texture pattern (50-200, as percentage)
 * @param relief Depth of the bump-map effect (1-10)
 * @param lightDirection Direction of simulated light: 'top', 'bottom', 'left', 'right',
 *   'topLeft', 'topRight', 'bottomLeft', 'bottomRight'
 */
export function texturizer(
  imageData: ImageData,
  textureType: 'brick' | 'burlap' | 'canvas' | 'sandstone' = 'canvas',
  scaling: number = 100,
  relief: number = 4,
  lightDirection: 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' = 'top'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const scaleFactor = scaling / 100;
  const reliefAmt = Math.max(1, Math.min(10, relief));

  // Generate texture height map
  const texMap = new Float32Array(width * height);

  switch (textureType) {
    case 'brick': {
      const brickW = Math.round(24 * scaleFactor);
      const brickH = Math.round(12 * scaleFactor);
      const mortarW = Math.max(1, Math.round(2 * scaleFactor));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const row = Math.floor(y / brickH);
          const offsetX = (row % 2 === 0) ? 0 : Math.floor(brickW / 2);
          const bx = (x + offsetX) % brickW;
          const by = y % brickH;
          const isMortar = bx < mortarW || by < mortarW;
          texMap[y * width + x] = isMortar ? 0 : 0.8 + Math.random() * 0.2;
        }
      }
      break;
    }
    case 'burlap': {
      const freq = 4.0 / scaleFactor;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = (Math.sin(x * freq) + Math.sin(y * freq)) * 0.25 + 0.5;
          texMap[y * width + x] = v + (Math.random() - 0.5) * 0.15;
        }
      }
      break;
    }
    case 'canvas': {
      const freq = 6.0 / scaleFactor;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const warp = Math.sin(x * freq * 0.7) * Math.sin(y * freq) * 0.3;
          const weft = Math.sin(x * freq) * Math.sin(y * freq * 0.7) * 0.3;
          texMap[y * width + x] = 0.5 + warp + weft + (Math.random() - 0.5) * 0.1;
        }
      }
      break;
    }
    case 'sandstone': {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Multi-octave noise approximation
          const n1 = Math.sin(x * 0.1 / scaleFactor + y * 0.13 / scaleFactor) * 0.3;
          const n2 = Math.sin(x * 0.37 / scaleFactor - y * 0.29 / scaleFactor) * 0.2;
          const n3 = (Math.random() - 0.5) * 0.3;
          texMap[y * width + x] = 0.5 + n1 + n2 + n3;
        }
      }
      break;
    }
  }

  // Compute light direction vectors
  let lx = 0, ly = 0;
  switch (lightDirection) {
    case 'top':         lx = 0;  ly = -1; break;
    case 'bottom':      lx = 0;  ly = 1;  break;
    case 'left':        lx = -1; ly = 0;  break;
    case 'right':       lx = 1;  ly = 0;  break;
    case 'topLeft':     lx = -1; ly = -1; break;
    case 'topRight':    lx = 1;  ly = -1; break;
    case 'bottomLeft':  lx = -1; ly = 1;  break;
    case 'bottomRight': lx = 1;  ly = 1;  break;
  }
  // Normalize
  const len = Math.sqrt(lx * lx + ly * ly) || 1;
  lx /= len;
  ly /= len;

  // Apply bump-map lighting
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pi = idx * 4;

      // Compute gradient from height map
      const left = x > 0 ? texMap[idx - 1] : texMap[idx];
      const right = x < width - 1 ? texMap[idx + 1] : texMap[idx];
      const up = y > 0 ? texMap[idx - width] : texMap[idx];
      const down = y < height - 1 ? texMap[idx + width] : texMap[idx];

      const gx = (right - left) * reliefAmt;
      const gy = (down - up) * reliefAmt;

      // Dot product with light direction gives shading
      const shade = (gx * lx + gy * ly) * 40;

      d[pi] = Math.min(255, Math.max(0, data[pi] + shade));
      d[pi + 1] = Math.min(255, Math.max(0, data[pi + 1] + shade));
      d[pi + 2] = Math.min(255, Math.max(0, data[pi + 2] + shade));
      d[pi + 3] = data[pi + 3];
    }
  }

  return result;
}

/**
 * Craquelure — Create a crackle/crack pattern overlay on the image.
 * Generates noise-based crack lines that simulate aged paint or ceramic cracking.
 * @param imageData Source image data
 * @param crackSpacing Average spacing between cracks in pixels (5-100)
 * @param crackDepth Darkness/depth of cracks (1-10)
 * @param crackBrightness Brightness of raised areas between cracks (1-10)
 */
export function craquelure(
  imageData: ImageData,
  crackSpacing: number = 15,
  crackDepth: number = 6,
  crackBrightness: number = 9
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const spacing = Math.max(5, Math.round(crackSpacing));
  const depth = Math.max(1, Math.min(10, crackDepth));
  const brightness = Math.max(1, Math.min(10, crackBrightness));

  // Copy original
  d.set(data);

  // Generate two layers of noise for crack pattern detection
  const noise1 = new Float32Array(width * height);
  const noise2 = new Float32Array(width * height);
  const freq1 = (1.0 / spacing);
  const freq2 = freq1 * 2.3; // Higher frequency for secondary cracks

  // Simple pseudo-noise using sin combinations
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      noise1[idx] = Math.sin(x * freq1 * 3.7 + y * freq1 * 2.3) * 0.5
                   + Math.sin(x * freq1 * 1.1 - y * freq1 * 4.1) * 0.3
                   + Math.sin((x + y) * freq1 * 2.7) * 0.2;
      noise2[idx] = Math.sin(x * freq2 * 2.1 + y * freq2 * 3.9) * 0.4
                   + Math.sin(x * freq2 * 4.3 - y * freq2 * 1.7) * 0.35
                   + Math.sin((x - y) * freq2 * 3.1) * 0.25;
    }
  }

  // Detect cracks at zero-crossings of noise gradient magnitude
  const depthDarken = depth * 15;
  const brightLift = brightness * 3;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const pi = idx * 4;

      // Compute gradient magnitude of noise1
      const gx1 = noise1[idx + 1] - noise1[idx - 1];
      const gy1 = noise1[idx + width] - noise1[idx - width];
      const grad1 = Math.abs(gx1) + Math.abs(gy1);

      // Compute gradient magnitude of noise2
      const gx2 = noise2[idx + 1] - noise2[idx - 1];
      const gy2 = noise2[idx + width] - noise2[idx - width];
      const grad2 = Math.abs(gx2) + Math.abs(gy2);

      // Cracks occur where noise value is near zero (zero-crossing)
      const isCrack1 = Math.abs(noise1[idx]) < 0.06 && grad1 > 0.01;
      const isCrack2 = Math.abs(noise2[idx]) < 0.04 && grad2 > 0.01;

      if (isCrack1 || isCrack2) {
        // Darken for crack
        const darken = isCrack1 ? depthDarken : depthDarken * 0.6;
        d[pi] = Math.max(0, d[pi] - darken);
        d[pi + 1] = Math.max(0, d[pi + 1] - darken);
        d[pi + 2] = Math.max(0, d[pi + 2] - darken);
      } else {
        // Slightly brighten raised areas
        d[pi] = Math.min(255, d[pi] + brightLift);
        d[pi + 1] = Math.min(255, d[pi + 1] + brightLift);
        d[pi + 2] = Math.min(255, d[pi + 2] + brightLift);
      }
    }
  }

  return result;
}

// ==================== Brush Strokes Filters ====================

/**
 * Accented Edges — Detect edges using Sobel operator with configurable width,
 * accent bright edges toward white and dark edges toward black based on
 * brightness parameter, then apply Gaussian smoothing.
 * @param imageData Source image data
 * @param edgeWidth Width of edge detection influence (1-14)
 * @param edgeBrightness Brightness threshold for edge accenting (0-50)
 * @param smoothness Amount of post-smoothing via Gaussian blur (1-15)
 */
export function accentedEdges(
  imageData: ImageData,
  edgeWidth: number = 2,
  edgeBrightness: number = 38,
  smoothness: number = 5
): ImageData {
  const { width, height, data } = imageData;

  // Compute per-pixel luminance
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    lum[i] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
  }

  // Sobel edge detection with configurable radius
  const edgeMag = new Float32Array(width * height);
  const radius = Math.max(1, Math.round(edgeWidth));
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sy = Math.min(height - 1, Math.max(0, y + ky * radius));
          const sx = Math.min(width - 1, Math.max(0, x + kx * radius));
          const val = lum[sy * width + sx];
          const wx = kx === 0 ? 0 : (ky === 0 ? 2 * kx : kx);
          const wy = ky === 0 ? 0 : (kx === 0 ? 2 * ky : ky);
          gx += val * wx;
          gy += val * wy;
        }
      }
      edgeMag[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Normalize edge magnitudes to 0-1
  let maxEdge = 0;
  for (let i = 0; i < edgeMag.length; i++) {
    if (edgeMag[i] > maxEdge) maxEdge = edgeMag[i];
  }
  if (maxEdge > 0) {
    for (let i = 0; i < edgeMag.length; i++) {
      edgeMag[i] /= maxEdge;
    }
  }

  // Accent edges based on brightness threshold
  const brightnessThreshold = edgeBrightness / 50;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const edge = edgeMag[i];
    const lumVal = lum[i] / 255;

    if (edge > 0.1) {
      const factor = Math.min(1, edge * 2);
      if (lumVal > brightnessThreshold) {
        // Bright edge: push toward white
        d[idx] = Math.min(255, Math.round(data[idx] + (255 - data[idx]) * factor));
        d[idx + 1] = Math.min(255, Math.round(data[idx + 1] + (255 - data[idx + 1]) * factor));
        d[idx + 2] = Math.min(255, Math.round(data[idx + 2] + (255 - data[idx + 2]) * factor));
      } else {
        // Dark edge: push toward black
        d[idx] = Math.max(0, Math.round(data[idx] * (1 - factor)));
        d[idx + 1] = Math.max(0, Math.round(data[idx + 1] * (1 - factor)));
        d[idx + 2] = Math.max(0, Math.round(data[idx + 2] * (1 - factor)));
      }
    } else {
      d[idx] = data[idx];
      d[idx + 1] = data[idx + 1];
      d[idx + 2] = data[idx + 2];
    }
    d[idx + 3] = data[idx + 3];
  }

  // Apply Gaussian smoothing
  if (smoothness > 0) {
    return gaussianBlur(result, smoothness);
  }

  return result;
}

/**
 * Angled Strokes — Apply directional motion blur at different angles for light
 * vs dark areas. Light areas blur at one angle derived from directionBalance,
 * dark areas blur at the complementary angle (offset by 90 degrees).
 * Post-sharpening restores detail.
 * @param imageData Source image data
 * @param directionBalance Balance between light/dark angle (0-100), maps to base angle 0-180
 * @param strokeLength Length of the directional blur strokes
 * @param sharpness Post-sharpening amount applied via sharpen()
 */
export function angledStrokes(
  imageData: ImageData,
  directionBalance: number = 50,
  strokeLength: number = 15,
  sharpness: number = 3
): ImageData {
  const { width, height, data } = imageData;

  // Derive two complementary angles from direction balance
  const baseAngle = (directionBalance / 100) * 180;
  const lightAngle = baseAngle;
  const darkAngle = baseAngle + 90;

  const lightBlurred = motionBlur(imageData, lightAngle, strokeLength);
  const darkBlurred = motionBlur(imageData, darkAngle, strokeLength);

  // Blend based on per-pixel luminance
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const lumVal = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;

    for (let c = 0; c < 3; c++) {
      d[idx + c] = Math.round(
        lightBlurred.data[idx + c] * lumVal + darkBlurred.data[idx + c] * (1 - lumVal)
      );
    }
    d[idx + 3] = data[idx + 3];
  }

  // Post-sharpen to restore detail
  if (sharpness > 0) {
    return sharpen(result, sharpness);
  }

  return result;
}

/**
 * Crosshatch — Layer multiple directional motion blurs at 45, 135, and 0 degrees
 * to simulate crosshatching. Edge detection weights the blend so strokes appear
 * more prominently at edges. Post-sharpening restores crispness.
 * @param imageData Source image data
 * @param strokeLength Length of each directional stroke
 * @param sharpness Post-sharpening amount applied via sharpen()
 * @param strength Crosshatch intensity multiplier (0-3)
 */
export function crosshatch(
  imageData: ImageData,
  strokeLength: number = 9,
  sharpness: number = 6,
  strength: number = 1
): ImageData {
  const { width, height, data } = imageData;

  // Edge detection for weighting
  const edges = edgeDetect(imageData);

  // Three directional motion blurs
  const blur45 = motionBlur(imageData, 45, strokeLength);
  const blur135 = motionBlur(imageData, 135, strokeLength);
  const blur0 = motionBlur(imageData, 0, strokeLength);

  // Combine: blend original with averaged directional blurs weighted by edge
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const edgeVal = (edges.data[idx] / 255) * strength;
    const blendFactor = Math.min(1, edgeVal);

    for (let c = 0; c < 3; c++) {
      const avgBlur = (blur45.data[idx + c] + blur135.data[idx + c] + blur0.data[idx + c]) / 3;
      d[idx + c] = Math.round(data[idx + c] * (1 - blendFactor) + avgBlur * blendFactor);
    }
    d[idx + 3] = data[idx + 3];
  }

  // Post-sharpen
  if (sharpness > 0) {
    return sharpen(result, sharpness);
  }

  return result;
}

/**
 * Dark Strokes — Enhance dark areas using multiply-like blending and light areas
 * using screen-like blending, controlled by balance parameter. Creates dramatic
 * contrast between dark and light regions.
 * @param imageData Source image data
 * @param balance Balance between dark and light treatment (0-10)
 * @param blackIntensity Intensity of darkening via power curve (1-10)
 * @param whiteIntensity Intensity of lightening via inverse power curve (1-10)
 */
export function darkStrokes(
  imageData: ImageData,
  balance: number = 5,
  blackIntensity: number = 3,
  whiteIntensity: number = 1
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  const balanceNorm = balance / 10;

  for (let i = 0; i < data.length; i += 4) {
    const lumVal = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;

    for (let c = 0; c < 3; c++) {
      const v = data[i + c] / 255;

      // Multiply-like: raise to power > 1 to darken
      const darkened = Math.pow(v, 1 + blackIntensity * 0.3);
      // Screen-like: invert, raise to power, invert back to lighten
      const lightened = 1 - Math.pow(1 - v, 1 + whiteIntensity * 0.3);

      // Weight by luminance and balance
      const darkWeight = (1 - lumVal) * balanceNorm;
      const lightWeight = lumVal * (1 - balanceNorm);
      const totalWeight = darkWeight + lightWeight;

      let blended: number;
      if (totalWeight > 0) {
        blended = (darkened * darkWeight + lightened * lightWeight) / totalWeight;
      } else {
        blended = v;
      }

      d[i + c] = Math.min(255, Math.max(0, Math.round(blended * 255)));
    }
    d[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Ink Outlines — Draw ink-like outlines on edges using Sobel edge detection,
 * with optional directional emphasis via motion blur. Outlines are overlaid
 * on a lightened version of the original image.
 * @param imageData Source image data
 * @param strokeLength Stroke length for directional edge emphasis via motion blur
 * @param darkIntensity Intensity of dark outline strokes (1-50)
 * @param lightIntensity Lightening amount for the base image (1-50)
 */
export function inkOutlines(
  imageData: ImageData,
  strokeLength: number = 4,
  darkIntensity: number = 20,
  lightIntensity: number = 10
): ImageData {
  const { width, height, data } = imageData;

  // Sobel edge detection
  const edges = edgeDetect(imageData);

  // Optional directional emphasis
  const dirEdges = strokeLength > 1 ? motionBlur(edges, 45, strokeLength) : edges;

  // Create lightened base with ink overlay
  const lightFactor = 1 + (lightIntensity / 50);
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;

    // Lightened base color
    const baseR = Math.min(255, Math.round(data[idx] * lightFactor));
    const baseG = Math.min(255, Math.round(data[idx + 1] * lightFactor));
    const baseB = Math.min(255, Math.round(data[idx + 2] * lightFactor));

    // Edge intensity normalized and amplified by darkIntensity
    const edgeVal = Math.min(255, dirEdges.data[idx] * (darkIntensity / 10));
    const inkFactor = edgeVal / 255;

    // Multiply dark ink outlines onto lightened base
    d[idx] = Math.max(0, Math.round(baseR * (1 - inkFactor)));
    d[idx + 1] = Math.max(0, Math.round(baseG * (1 - inkFactor)));
    d[idx + 2] = Math.max(0, Math.round(baseB * (1 - inkFactor)));
    d[idx + 3] = data[idx + 3];
  }

  return result;
}

/**
 * Spatter — Randomly displace pixels within a spray radius using a seeded
 * pseudo-random number generator for deterministic results, then apply
 * Gaussian smoothing to soften the spattered appearance.
 * @param imageData Source image data
 * @param sprayRadius Maximum pixel displacement radius (5-15)
 * @param smoothness Amount of post-smoothing via Gaussian blur (1-15)
 */
export function spatter(
  imageData: ImageData,
  sprayRadius: number = 10,
  smoothness: number = 5
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const rr = Math.max(1, Math.round(sprayRadius));

  // Seeded PRNG for deterministic output
  let seed = 12345;
  const pseudoRandom = (): number => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Random displacement within circular spray radius
      const angle = pseudoRandom() * Math.PI * 2;
      const dist = pseudoRandom() * rr;
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + Math.cos(angle) * dist)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + Math.sin(angle) * dist)));

      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;

      d[dstIdx] = data[srcIdx];
      d[dstIdx + 1] = data[srcIdx + 1];
      d[dstIdx + 2] = data[srcIdx + 2];
      d[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  // Post-smooth via Gaussian blur
  if (smoothness > 0) {
    return gaussianBlur(result, smoothness);
  }

  return result;
}

/**
 * Sprayed Strokes — Directional spray effect with configurable stroke direction.
 * Pixels are displaced along the stroke direction with perpendicular spray spread,
 * using a seeded PRNG for deterministic results.
 * @param imageData Source image data
 * @param strokeLength Length of the spray strokes along direction
 * @param sprayRadius Perpendicular spread radius of the spray
 * @param strokeDirection Direction of strokes: 'rightDiagonal' | 'horizontal' | 'leftDiagonal' | 'vertical'
 */
export function sprayedStrokes(
  imageData: ImageData,
  strokeLength: number = 12,
  sprayRadius: number = 7,
  strokeDirection: 'rightDiagonal' | 'horizontal' | 'leftDiagonal' | 'vertical' = 'rightDiagonal'
): ImageData {
  const { width, height, data } = imageData;

  // Map direction name to angle in degrees
  const dirAngles: Record<string, number> = {
    rightDiagonal: 45,
    horizontal: 0,
    leftDiagonal: 135,
    vertical: 90,
  };
  const angleDeg = dirAngles[strokeDirection] ?? 45;
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const result = new ImageData(width, height);
  const d = result.data;

  // Seeded PRNG for deterministic output
  let seed = 54321;
  const pseudoRandom = (): number => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Displacement along stroke direction
      const along = (pseudoRandom() - 0.5) * strokeLength;
      // Perpendicular spray spread
      const perpAngle = rad + Math.PI / 2;
      const perpDist = (pseudoRandom() - 0.5) * sprayRadius;

      const sx = Math.min(width - 1, Math.max(0,
        Math.round(x + dx * along + Math.cos(perpAngle) * perpDist)
      ));
      const sy = Math.min(height - 1, Math.max(0,
        Math.round(y + dy * along + Math.sin(perpAngle) * perpDist)
      ));

      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;

      d[dstIdx] = data[srcIdx];
      d[dstIdx + 1] = data[srcIdx + 1];
      d[dstIdx + 2] = data[srcIdx + 2];
      d[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return result;
}

/**
 * Sumi-e (ink wash painting) — Convert to grayscale, apply strong Sobel edge
 * detection with pressure-based amplification, compose ink strokes onto a white
 * paper background with subtle grayscale wash, blur for ink spread, and boost
 * contrast for a traditional Japanese ink-wash appearance.
 * @param imageData Source image data
 * @param strokeWidth Width of ink strokes via blur radius (1-10)
 * @param strokePressure Pressure/intensity multiplier for edge strokes (1-10)
 * @param contrast Contrast boost amount (0-40)
 */
export function sumie(
  imageData: ImageData,
  strokeWidth: number = 3,
  strokePressure: number = 2,
  contrast: number = 16
): ImageData {
  const { width, height, data } = imageData;

  // Convert to grayscale
  const gray = new ImageData(width, height);
  const gd = gray.data;

  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    gd[i] = g;
    gd[i + 1] = g;
    gd[i + 2] = g;
    gd[i + 3] = data[i + 3];
  }

  // Sobel edge detection with pressure amplification
  const edges = edgeDetect(gray);
  const pressureScale = strokePressure * 1.5;

  // Compose ink strokes on white paper
  const combined = new ImageData(width, height);
  const cd = combined.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const edgeVal = Math.min(255, edges.data[idx] * pressureScale);
    const inkAmount = edgeVal / 255;
    const grayVal = gd[idx];

    // White paper darkened by ink strokes with subtle grayscale wash
    const inkVal = Math.max(0, grayVal * 0.3);
    const val = Math.round(255 * (1 - inkAmount) + inkVal * inkAmount);

    cd[idx] = val;
    cd[idx + 1] = val;
    cd[idx + 2] = val;
    cd[idx + 3] = data[idx + 3];
  }

  // Blur for ink spread effect
  const blurred = strokeWidth > 0 ? gaussianBlur(combined, strokeWidth * 0.5) : combined;

  // Boost contrast for ink-like appearance
  if (contrast > 0) {
    const bd = blurred.data;
    const contrastFactor = (259 * (contrast * 2.55 + 255)) / (255 * (259 - contrast * 2.55));

    const contrastResult = new ImageData(width, height);
    const rd = contrastResult.data;

    for (let i = 0; i < bd.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        rd[i + c] = Math.min(255, Math.max(0, Math.round(contrastFactor * (bd[i + c] - 128) + 128)));
      }
      rd[i + 3] = bd[i + 3];
    }

    return contrastResult;
  }

  return blurred;
}

// ==================== Additional Blur Filters ====================

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

// ==================== Additional Noise Filters ====================

/** Despeckle — edge-preserving median filter for non-edge regions */
export function despeckle(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = (y * width + x) * 4;
      // Check if edge pixel
      let maxDiff = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          const diff = Math.abs(data[ci] - data[si]) + Math.abs(data[ci + 1] - data[si + 1]) + Math.abs(data[ci + 2] - data[si + 2]);
          maxDiff = Math.max(maxDiff, diff);
        }
      }

      if (maxDiff > 80) {
        // Edge: preserve original
        d[ci] = data[ci]; d[ci + 1] = data[ci + 1]; d[ci + 2] = data[ci + 2];
      } else {
        // Non-edge: apply median
        const rs: number[] = [], gs: number[] = [], bs: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            const sy = Math.min(height - 1, Math.max(0, y + dy));
            const si = (sy * width + sx) * 4;
            rs.push(data[si]); gs.push(data[si + 1]); bs.push(data[si + 2]);
          }
        }
        rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
        d[ci] = rs[4]; d[ci + 1] = gs[4]; d[ci + 2] = bs[4];
      }
      d[ci + 3] = data[ci + 3];
    }
  }
  return result;
}

/** Dust & Scratches — radius+threshold outlier removal */
export function dustAndScratches(imageData: ImageData, radius: number = 1, threshold: number = 0): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const r = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = (y * width + x) * 4;
      const rs: number[] = [], gs: number[] = [], bs: number[] = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          rs.push(data[si]); gs.push(data[si + 1]); bs.push(data[si + 2]);
        }
      }
      rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
      const mid = Math.floor(rs.length / 2);
      const diff = Math.abs(data[ci] - rs[mid]) + Math.abs(data[ci + 1] - gs[mid]) + Math.abs(data[ci + 2] - bs[mid]);
      if (diff > threshold) { d[ci] = rs[mid]; d[ci + 1] = gs[mid]; d[ci + 2] = bs[mid]; }
      else { d[ci] = data[ci]; d[ci + 1] = data[ci + 1]; d[ci + 2] = data[ci + 2]; }
      d[ci + 3] = data[ci + 3];
    }
  }
  return result;
}

/** Median — classic NxN median filter */
export function median(imageData: ImageData, radius: number = 1): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const r = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rs: number[] = [], gs: number[] = [], bs: number[] = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const si = (sy * width + sx) * 4;
          rs.push(data[si]); gs.push(data[si + 1]); bs.push(data[si + 2]);
        }
      }
      rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
      const mid = Math.floor(rs.length / 2);
      const ci = (y * width + x) * 4;
      d[ci] = rs[mid]; d[ci + 1] = gs[mid]; d[ci + 2] = bs[mid]; d[ci + 3] = data[ci + 3];
    }
  }
  return result;
}

// ==================== Additional Distort Filters ====================

/** Diffuse Glow — bright area diffusion with noise grain */
export function diffuseGlow(imageData: ImageData, graininess: number = 6, glowAmount: number = 10, clearAmount: number = 15): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const grain = graininess / 10;
  const glow = glowAmount / 20;
  const clear = clearAmount / 20;

  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const glowFactor = Math.max(0, (lum - 128 * clear) / 128) * glow;
    const noise = (Math.random() - 0.5) * grain * 50;
    d[i] = Math.min(255, Math.max(0, data[i] + (255 - data[i]) * glowFactor + noise));
    d[i + 1] = Math.min(255, Math.max(0, data[i + 1] + (255 - data[i + 1]) * glowFactor + noise));
    d[i + 2] = Math.min(255, Math.max(0, data[i + 2] + (255 - data[i + 2]) * glowFactor + noise));
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Glass — glass texture distortion */
export function glass(imageData: ImageData, distortion: number = 5, smoothness: number = 3, texture: 'blocks' | 'frosted' | 'tinyLens' = 'frosted'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const dist = distortion * Math.max(1, smoothness) / smoothness;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ox = 0, oy = 0;
      if (texture === 'blocks') {
        const bx = Math.floor(x / 8) * 8;
        const by = Math.floor(y / 8) * 8;
        ox = ((bx * 17 + by * 31) % 100 - 50) / 50 * dist;
        oy = ((bx * 23 + by * 13) % 100 - 50) / 50 * dist;
      } else if (texture === 'frosted') {
        ox = (Math.random() - 0.5) * dist * 2;
        oy = (Math.random() - 0.5) * dist * 2;
      } else { // tinyLens
        const cx = (x % 6) - 3;
        const cy = (y % 6) - 3;
        const d2 = cx * cx + cy * cy;
        const factor = d2 < 9 ? d2 / 9 : 1;
        ox = cx * factor * dist * 0.3;
        oy = cy * factor * dist * 0.3;
      }
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + ox)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + oy)));
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = data[si + 3];
    }
  }
  return result;
}

/** Ocean Ripple — sine wave distortion simulating water surface */
export function oceanRipple(imageData: ImageData, rippleSize: number = 9, rippleMagnitude: number = 6): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const freq = (2 * Math.PI) / Math.max(1, rippleSize * 3);
  const mag = rippleMagnitude;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ox = Math.sin(y * freq) * mag;
      const oy = Math.sin(x * freq * 0.7) * mag;
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + ox)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + oy)));
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = data[si + 3];
    }
  }
  return result;
}

/** Displace — displacement map based distortion */
export function displace(imageData: ImageData, horizontalScale: number = 10, verticalScale: number = 10, _displaceMap?: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // If no displacement map provided, use self-luminance as displacement
  const mapData = _displaceMap ? _displaceMap.data : data;
  const mapW = _displaceMap ? _displaceMap.width : width;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mi = (y * mapW + x) * 4;
      const hDisp = ((mapData[mi] || 128) - 128) / 128 * horizontalScale;
      const vDisp = ((mapData[mi + 1] || 128) - 128) / 128 * verticalScale;
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + hDisp)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + vDisp)));
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = data[si + 3];
    }
  }
  return result;
}

// ==================== Phase 12: Image Operations ====================

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

/** Perspective Warp — 4-corner perspective distortion */
export function perspectiveWarp(
  imageData: ImageData,
  corners: { tl: { x: number; y: number }; tr: { x: number; y: number }; bl: { x: number; y: number }; br: { x: number; y: number } }
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width, v = y / height;
      // Bilinear interpolation of corner positions
      const srcX =
        (1 - u) * (1 - v) * corners.tl.x +
        u * (1 - v) * corners.tr.x +
        (1 - u) * v * corners.bl.x +
        u * v * corners.br.x;
      const srcY =
        (1 - u) * (1 - v) * corners.tl.y +
        u * (1 - v) * corners.tr.y +
        (1 - u) * v * corners.bl.y +
        u * v * corners.br.y;

      const sx = Math.min(width - 1, Math.max(0, Math.round(srcX)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(srcY)));
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = data[si + 3];
    }
  }
  return result;
}

/** Content-Aware Scale — seam carving for content-aware resizing */
export function contentAwareScale(
  imageData: ImageData,
  newWidth: number,
  newHeight: number
): ImageData {
  const { width, height, data } = imageData;

  // Simplified energy-based scaling (horizontal seam removal)
  let currentData = new Uint8ClampedArray(data);
  let currentW = width;
  const currentH = height;

  // Calculate energy map
  const computeEnergy = (d: Uint8ClampedArray, w: number, h: number): Float32Array => {
    const energy = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const left = x > 0 ? (y * w + x - 1) * 4 : i;
        const right = x < w - 1 ? (y * w + x + 1) * 4 : i;
        const top = y > 0 ? ((y - 1) * w + x) * 4 : i;
        const bottom = y < h - 1 ? ((y + 1) * w + x) * 4 : i;
        const dx = Math.abs(d[left] - d[right]) + Math.abs(d[left + 1] - d[right + 1]) + Math.abs(d[left + 2] - d[right + 2]);
        const dy = Math.abs(d[top] - d[bottom]) + Math.abs(d[top + 1] - d[bottom + 1]) + Math.abs(d[top + 2] - d[bottom + 2]);
        energy[y * w + x] = dx + dy;
      }
    }
    return energy;
  };

  // Remove vertical seams to reduce width
  while (currentW > newWidth && currentW > 1) {
    const energy = computeEnergy(currentData, currentW, currentH);
    // Find minimum energy seam using DP
    const dp = new Float32Array(energy);
    for (let y = 1; y < currentH; y++) {
      for (let x = 0; x < currentW; x++) {
        const above = dp[(y - 1) * currentW + x];
        const aboveL = x > 0 ? dp[(y - 1) * currentW + x - 1] : Infinity;
        const aboveR = x < currentW - 1 ? dp[(y - 1) * currentW + x + 1] : Infinity;
        dp[y * currentW + x] += Math.min(above, aboveL, aboveR);
      }
    }
    // Find seam end
    let minIdx = 0;
    for (let x = 1; x < currentW; x++) {
      if (dp[(currentH - 1) * currentW + x] < dp[(currentH - 1) * currentW + minIdx]) minIdx = x;
    }
    // Trace seam and remove pixels
    const seam = new Int32Array(currentH);
    seam[currentH - 1] = minIdx;
    for (let y = currentH - 2; y >= 0; y--) {
      const x = seam[y + 1];
      let best = x;
      if (x > 0 && dp[y * currentW + x - 1] < dp[y * currentW + best]) best = x - 1;
      if (x < currentW - 1 && dp[y * currentW + x + 1] < dp[y * currentW + best]) best = x + 1;
      seam[y] = best;
    }
    // Remove seam
    const newData = new Uint8ClampedArray((currentW - 1) * currentH * 4);
    for (let y = 0; y < currentH; y++) {
      let nx = 0;
      for (let x = 0; x < currentW; x++) {
        if (x === seam[y]) continue;
        const si = (y * currentW + x) * 4;
        const di = (y * (currentW - 1) + nx) * 4;
        newData[di] = currentData[si]; newData[di + 1] = currentData[si + 1];
        newData[di + 2] = currentData[si + 2]; newData[di + 3] = currentData[si + 3];
        nx++;
      }
    }
    currentData = newData;
    currentW--;
  }

  // Simple bilinear scale for height changes
  const result = new ImageData(newWidth, newHeight);
  const d = result.data;
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.min(currentW - 1, Math.round(x * currentW / newWidth));
      const srcY = Math.min(currentH - 1, Math.round(y * currentH / newHeight));
      const si = (srcY * currentW + srcX) * 4;
      const di = (y * newWidth + x) * 4;
      d[di] = currentData[si]; d[di + 1] = currentData[si + 1];
      d[di + 2] = currentData[si + 2]; d[di + 3] = currentData[si + 3];
    }
  }
  return result;
}

// ==================== Phase 11: Render Filters ====================

/** Simple seeded PRNG for deterministic noise */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Perlin-style value noise for procedural generation */
function valueNoise2D(x: number, y: number, seed: number): number {
  const rng = (ix: number, iy: number) => {
    // Use Math.imul to force 32-bit integer multiplication. Without it, the
    // intermediate products overflow Number.MAX_SAFE_INTEGER as floats, and
    // the subsequent `& 0x7fffffff` coercion collapses to 0 for every input —
    // which previously made valueNoise2D return a constant 1.0 everywhere and
    // rendered Clouds / Fibers / Flame / etc. as solid white fills.
    let n = (ix | 0) + Math.imul(iy | 0, 57) + Math.imul(seed | 0, 131);
    n = (n << 13) ^ n;
    const h = Math.imul(n, Math.imul(n, Math.imul(n, 15731)) + 789221) + 1376312589;
    return 1.0 - ((h & 0x7fffffff) / 1073741824.0);
  };
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = rng(ix, iy), n10 = rng(ix + 1, iy);
  const n01 = rng(ix, iy + 1), n11 = rng(ix + 1, iy + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

/** Multi-octave fractal noise (fBM) */
function fractalNoise(x: number, y: number, octaves: number, persistence: number, seed: number): number {
  let val = 0, amp = 1, freq = 1, maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    val += valueNoise2D(x * freq, y * freq, seed + i * 100) * amp;
    maxVal += amp;
    amp *= persistence;
    freq *= 2;
  }
  return val / maxVal;
}

/** Clouds — procedural cloud generation using fractal noise */
export function clouds(imageData: ImageData, seed: number = 42, scale: number = 64): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fractalNoise(x / scale, y / scale, 6, 0.5, seed);
      const v = Math.min(255, Math.max(0, Math.round((n + 1) * 0.5 * 255)));
      const i = (y * width + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  return result;
}

/** Difference Clouds — blend clouds with the source using difference mode */
export function differenceClouds(imageData: ImageData, seed: number = 42, scale: number = 64): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fractalNoise(x / scale, y / scale, 6, 0.5, seed);
      const cloud = Math.min(255, Math.max(0, Math.round((n + 1) * 0.5 * 255)));
      const i = (y * width + x) * 4;
      d[i] = Math.abs(data[i] - cloud);
      d[i + 1] = Math.abs(data[i + 1] - cloud);
      d[i + 2] = Math.abs(data[i + 2] - cloud);
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Fibers — procedural fiber texture with directional noise */
export function fibers(imageData: ImageData, variance: number = 16, strength: number = 4, seed: number = 42): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const rng = seededRandom(seed);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Combine vertical noise with horizontal variance
      const n1 = fractalNoise(x * 0.02, y * 0.3, 4, 0.5, seed);
      const n2 = fractalNoise(x * 0.1 + 100, y * 0.05, 3, 0.6, seed + 50);
      const fiberVal = n1 * strength + n2 * variance * 0.1 + (rng() - 0.5) * variance * 0.3;
      const v = Math.min(255, Math.max(0, Math.round((fiberVal + 1) * 0.5 * 255)));
      const i = (y * width + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  return result;
}

/** Lens Flare — simulates camera lens flare at a specified position */
export function lensFlare(imageData: ImageData, centerX: number = -1, centerY: number = -1, brightness: number = 100, lensType: '50-300mm' | '35mm' | '105mm' = '50-300mm'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;
  const cx = centerX < 0 ? width * 0.4 : centerX;
  const cy = centerY < 0 ? height * 0.4 : centerY;
  const bri = brightness / 100;
  const maxDist = Math.sqrt(width * width + height * height);

  // Flare halo count based on lens type
  const haloCount = lensType === '35mm' ? 3 : lensType === '105mm' ? 5 : 4;
  const haloPositions: Array<{ x: number; y: number; r: number; intensity: number }> = [];
  for (let h = 0; h < haloCount; h++) {
    const t = (h + 1) / (haloCount + 1);
    haloPositions.push({
      x: cx + (width / 2 - cx) * t * 2,
      y: cy + (height / 2 - cy) * t * 2,
      r: 10 + h * 15,
      intensity: 0.3 - h * 0.05,
    });
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Main glow
      const glow = Math.max(0, 1 - dist / (maxDist * 0.3)) * bri;
      const mainFlare = glow * glow * 200;

      // Rays
      const angle = Math.atan2(dy, dx);
      const rayIntensity = Math.max(0, Math.cos(angle * 8) * 0.5 + 0.5) * glow * 80;

      // Halos
      let haloIntensity = 0;
      for (const halo of haloPositions) {
        const hd = Math.sqrt((x - halo.x) ** 2 + (y - halo.y) ** 2);
        const ring = Math.abs(hd - halo.r);
        if (ring < 5) {
          haloIntensity += halo.intensity * (1 - ring / 5) * 100 * bri;
        }
      }

      const add = mainFlare + rayIntensity + haloIntensity;
      d[i] = Math.min(255, d[i] + add);
      d[i + 1] = Math.min(255, d[i + 1] + add * 0.9);
      d[i + 2] = Math.min(255, d[i + 2] + add * 0.7);
    }
  }
  return result;
}

/** Lighting Effects — simulates directional, point, or spot lighting */
export function lightingEffects(
  imageData: ImageData,
  lightType: 'directional' | 'point' | 'spot' = 'directional',
  lightX: number = -1,
  lightY: number = -1,
  intensity: number = 50,
  ambience: number = 30
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const lx = lightX < 0 ? width / 2 : lightX;
  const ly = lightY < 0 ? height / 3 : lightY;
  const intFactor = intensity / 100;
  const ambFactor = ambience / 100;
  const maxDist = Math.sqrt(width * width + height * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let lightFactor: number;

      if (lightType === 'directional') {
        // Light comes from top-left to bottom-right
        lightFactor = ((x + y) / (width + height)) * intFactor + ambFactor;
      } else if (lightType === 'point') {
        const dist = Math.sqrt((x - lx) ** 2 + (y - ly) ** 2);
        lightFactor = Math.max(ambFactor, (1 - dist / (maxDist * 0.5)) * intFactor + ambFactor);
      } else {
        // Spot light with falloff
        const dist = Math.sqrt((x - lx) ** 2 + (y - ly) ** 2);
        const spotRadius = maxDist * 0.3;
        lightFactor = dist < spotRadius
          ? (1 - (dist / spotRadius) ** 2) * intFactor + ambFactor
          : ambFactor;
      }

      d[i] = Math.min(255, data[i] * lightFactor);
      d[i + 1] = Math.min(255, data[i + 1] * lightFactor);
      d[i + 2] = Math.min(255, data[i + 2] * lightFactor);
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Flame — procedural flame rendering */
export function flame(imageData: ImageData, flameHeight: number = 100, seed: number = 42): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const baseY = height * 0.75;
  const hScale = Math.max(1, flameHeight);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const relY = (baseY - y) / hScale;

      if (relY <= 0) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
        continue;
      }

      const n = fractalNoise(x * 0.03, y * 0.05 + seed * 0.1, 4, 0.5, seed);
      const flameIntensity = Math.max(0, relY * (1 + n * 0.5));

      if (flameIntensity > 0) {
        const t = Math.min(1, flameIntensity);
        // Orange-red gradient: bottom=white/yellow, middle=orange, top=red/transparent
        const r = Math.min(255, 255 * Math.min(1, t * 3));
        const g = Math.min(255, 255 * Math.max(0, Math.min(1, t * 2 - 0.3)));
        const b = Math.min(255, 100 * Math.max(0, Math.min(1, t * 1.5 - 0.7)));
        const a = Math.min(255, 255 * Math.min(1, flameIntensity * 2));
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      } else {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
      }
    }
  }
  return result;
}

/** Tree — procedural fractal tree rendering */
export function tree(imageData: ImageData, branchAngle: number = 25, depth: number = 8, seed: number = 42): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  // Fill background transparent
  for (let i = 3; i < d.length; i += 4) d[i] = 255;

  const rng = seededRandom(seed);

  function drawLine(x1: number, y1: number, x2: number, y2: number, thickness: number, r: number, g: number, b: number) {
    const steps = Math.max(1, Math.ceil(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = Math.round(x1 + (x2 - x1) * t);
      const py = Math.round(y1 + (y2 - y1) * t);
      const th = Math.ceil(thickness / 2);
      for (let dy = -th; dy <= th; dy++) {
        for (let dx = -th; dx <= th; dx++) {
          const fx = px + dx, fy = py + dy;
          if (fx >= 0 && fx < width && fy >= 0 && fy < height) {
            const i = (fy * width + fx) * 4;
            d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
          }
        }
      }
    }
  }

  function branch(x: number, y: number, angle: number, len: number, thick: number, level: number) {
    if (level <= 0 || len < 2) return;
    const rad = angle * Math.PI / 180;
    const x2 = x + Math.cos(rad) * len;
    const y2 = y - Math.sin(rad) * len;

    // Color: brown for trunk, green for leaves
    const isLeaf = level <= 2;
    const r = isLeaf ? 34 + Math.floor(rng() * 30) : 101;
    const g = isLeaf ? 120 + Math.floor(rng() * 60) : 67;
    const bCol = isLeaf ? 34 : 33;

    drawLine(x, y, x2, y2, thick, r, g, bCol);

    const jitter = (rng() - 0.5) * 10;
    branch(x2, y2, angle + branchAngle + jitter, len * (0.65 + rng() * 0.1), thick * 0.7, level - 1);
    branch(x2, y2, angle - branchAngle + jitter, len * (0.65 + rng() * 0.1), thick * 0.7, level - 1);
    if (rng() > 0.6) {
      branch(x2, y2, angle + jitter * 2, len * 0.5, thick * 0.5, level - 2);
    }
  }

  const trunkLen = height * 0.2;
  branch(width / 2, height * 0.85, 90, trunkLen, Math.max(1, depth * 0.5), depth);
  return result;
}

// ==================== Phase 13: Remaining Filters ====================

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

/**
 * Sharpen More — stronger single-step sharpening (3x3 kernel with higher weights)
 */
export function sharpenMore(imageData: ImageData): ImageData {
  const kernel = [
    [-1, -1, -1],
    [-1, 9, -1],
    [-1, -1, -1],
  ];
  return applyConvolution(imageData, kernel, 1);
}

/**
 * Sharpen Edges — edge-aware sharpening that only enhances edges
 * Uses a Laplacian to detect edges, then blends sharpening only where edges exist
 */
export function sharpenEdges(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  // Detect edges using Sobel magnitude
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        // Sobel gradients
        const gx =
          -data[((y - 1) * width + (x - 1)) * 4 + c] +
           data[((y - 1) * width + (x + 1)) * 4 + c] +
          -2 * data[(y * width + (x - 1)) * 4 + c] +
           2 * data[(y * width + (x + 1)) * 4 + c] +
          -data[((y + 1) * width + (x - 1)) * 4 + c] +
           data[((y + 1) * width + (x + 1)) * 4 + c];
        const gy =
          -data[((y - 1) * width + (x - 1)) * 4 + c] +
          -2 * data[((y - 1) * width + x) * 4 + c] +
          -data[((y - 1) * width + (x + 1)) * 4 + c] +
           data[((y + 1) * width + (x - 1)) * 4 + c] +
           2 * data[((y + 1) * width + x) * 4 + c] +
           data[((y + 1) * width + (x + 1)) * 4 + c];

        const edgeStrength = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 128);

        // Sharpen with 3x3 Laplacian
        const sharpened =
          5 * data[idx + c] -
          data[((y - 1) * width + x) * 4 + c] -
          data[((y + 1) * width + x) * 4 + c] -
          data[(y * width + (x - 1)) * 4 + c] -
          data[(y * width + (x + 1)) * 4 + c];

        // Blend: only sharpen where edges are detected
        resultData[idx + c] = Math.min(255, Math.max(0,
          Math.round(data[idx + c] * (1 - edgeStrength) + sharpened * edgeStrength)
        ));
      }
      resultData[idx + 3] = data[idx + 3];
    }
  }

  // Copy border pixels
  for (let x = 0; x < width; x++) {
    const top = x * 4;
    const bot = ((height - 1) * width + x) * 4;
    for (let c = 0; c < 4; c++) {
      resultData[top + c] = data[top + c];
      resultData[bot + c] = data[bot + c];
    }
  }
  for (let y = 0; y < height; y++) {
    const left = (y * width) * 4;
    const right = (y * width + width - 1) * 4;
    for (let c = 0; c < 4; c++) {
      resultData[left + c] = data[left + c];
      resultData[right + c] = data[right + c];
    }
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
 * Extrude filter — creates 3D extrusion effect with blocks or pyramids
 */
export function extrude(
  imageData: ImageData,
  type: 'blocks' | 'pyramids' = 'blocks',
  size: number = 10,
  depth: number = 30,
  solidFrontFaces: boolean = true
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  // Copy original as background
  resultData.set(data);

  const cols = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  const centerX = width / 2;
  const centerY = height / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const bx = col * size;
      const by = row * size;
      const bw = Math.min(size, width - bx);
      const bh = Math.min(size, height - by);

      // Calculate average luminance for depth
      let totalLum = 0;
      let count = 0;
      let avgR = 0, avgG = 0, avgB = 0;
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          avgR += data[idx];
          avgG += data[idx + 1];
          avgB += data[idx + 2];
          totalLum += (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
          count++;
        }
      }
      avgR = Math.round(avgR / count);
      avgG = Math.round(avgG / count);
      avgB = Math.round(avgB / count);
      const lumFactor = totalLum / count / 255;
      const extrudeDepth = Math.round(lumFactor * depth);

      // Direction from center
      const dirX = (bx + bw / 2 - centerX) / width;
      const dirY = (by + bh / 2 - centerY) / height;
      const offsetX = Math.round(dirX * extrudeDepth);
      const offsetY = Math.round(dirY * extrudeDepth);

      if (type === 'blocks') {
        // Draw extruded block face
        const faceColor = solidFrontFaces
          ? [avgR, avgG, avgB]
          : null;

        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < bw; dx++) {
            const tx = bx + dx + offsetX;
            const ty = by + dy + offsetY;
            if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
              const dstIdx = (ty * width + tx) * 4;
              if (faceColor) {
                resultData[dstIdx] = faceColor[0];
                resultData[dstIdx + 1] = faceColor[1];
                resultData[dstIdx + 2] = faceColor[2];
              } else {
                const srcIdx = ((by + dy) * width + (bx + dx)) * 4;
                resultData[dstIdx] = data[srcIdx];
                resultData[dstIdx + 1] = data[srcIdx + 1];
                resultData[dstIdx + 2] = data[srcIdx + 2];
              }
              resultData[dstIdx + 3] = 255;
            }
          }
        }

        // Draw side faces (darker shading)
        const shade = 0.6;
        if (offsetX > 0) {
          for (let dy = 0; dy < bh; dy++) {
            for (let sx = 0; sx < Math.abs(offsetX); sx++) {
              const tx = bx + bw + sx;
              const ty = by + dy + Math.round(offsetY * sx / Math.max(1, Math.abs(offsetX)));
              if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
                const dstIdx = (ty * width + tx) * 4;
                resultData[dstIdx] = Math.round(avgR * shade);
                resultData[dstIdx + 1] = Math.round(avgG * shade);
                resultData[dstIdx + 2] = Math.round(avgB * shade);
                resultData[dstIdx + 3] = 255;
              }
            }
          }
        }
      } else {
        // Pyramids: draw converging lines from corners to center offset
        const cx = bx + bw / 2 + offsetX;
        const cy = by + bh / 2 + offsetY;
        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < bw; dx++) {
            const fx = dx / bw;
            const fy = dy / bh;
            const t = Math.max(Math.abs(fx - 0.5), Math.abs(fy - 0.5)) * 2;
            const tx = Math.round(bx + dx + (cx - (bx + dx)) * (1 - t));
            const ty = Math.round(by + dy + (cy - (by + dy)) * (1 - t));
            if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
              const dstIdx = (ty * width + tx) * 4;
              const brightness = 0.5 + 0.5 * (1 - t);
              resultData[dstIdx] = Math.min(255, Math.round(avgR * brightness));
              resultData[dstIdx + 1] = Math.min(255, Math.round(avgG * brightness));
              resultData[dstIdx + 2] = Math.min(255, Math.round(avgB * brightness));
              resultData[dstIdx + 3] = 255;
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Shear filter — distorts image along the vertical axis with a curve
 * Points define a piecewise-linear curve mapping Y position to X offset
 */
export function shear(
  imageData: ImageData,
  points: Array<{ y: number; x: number }> = [{ y: 0, x: 0 }, { y: 1, x: 0.5 }],
  wrapAround: boolean = true
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  // Sort points by y
  const sorted = [...points].sort((a, b) => a.y - b.y);

  // Interpolate X offset for a given normalized Y
  function getOffset(normalizedY: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0].x * width;
    if (normalizedY <= sorted[0].y) return sorted[0].x * width;
    if (normalizedY >= sorted[sorted.length - 1].y) return sorted[sorted.length - 1].x * width;

    for (let i = 0; i < sorted.length - 1; i++) {
      if (normalizedY >= sorted[i].y && normalizedY <= sorted[i + 1].y) {
        const t = (normalizedY - sorted[i].y) / (sorted[i + 1].y - sorted[i].y);
        return (sorted[i].x + t * (sorted[i + 1].x - sorted[i].x)) * width;
      }
    }
    return 0;
  }

  for (let y = 0; y < height; y++) {
    const normalizedY = y / (height - 1);
    const xOffset = Math.round(getOffset(normalizedY));

    for (let x = 0; x < width; x++) {
      let sx = x - xOffset;

      if (wrapAround) {
        sx = ((sx % width) + width) % width;
      } else {
        if (sx < 0 || sx >= width) {
          const dstIdx = (y * width + x) * 4;
          resultData[dstIdx + 3] = 0; // transparent
          continue;
        }
      }

      const dstIdx = (y * width + x) * 4;
      const srcIdx = (y * width + sx) * 4;
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

// ==================== Phase 15: Missing Filters ====================

/**
 * Pixelate > Mosaic — block averaging (distinct from Mosaic Tiles texture)
 */
export function mosaic(imageData: ImageData, cellSize: number = 10): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const rd = result.data;
  const cs = Math.max(1, Math.round(cellSize));

  for (let by = 0; by < height; by += cs) {
    for (let bx = 0; bx < width; bx += cs) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let dy = 0; dy < cs && by + dy < height; dy++) {
        for (let dx = 0; dx < cs && bx + dx < width; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; a += data[idx + 3];
          count++;
        }
      }
      r = Math.round(r / count); g = Math.round(g / count);
      b = Math.round(b / count); a = Math.round(a / count);
      for (let dy = 0; dy < cs && by + dy < height; dy++) {
        for (let dx = 0; dx < cs && bx + dx < width; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          rd[idx] = r; rd[idx + 1] = g; rd[idx + 2] = b; rd[idx + 3] = a;
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

/**
 * Adaptive Wide Angle — barrel/pincushion distortion correction
 * Uses Brown-Conrady model: r_corrected = r * (1 + k1*r² + k2*r⁴)
 */
export function adaptiveWideAngle(
  imageData: ImageData,
  k1: number = -0.3,
  k2: number = 0.1,
  centerX: number = 0.5,
  centerY: number = 0.5
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const rd = result.data;
  const cx = width * centerX;
  const cy = height * centerY;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) / maxR;
      const r2 = r * r, r4 = r2 * r2;
      const scale = 1 + k1 * r2 + k2 * r4;
      const sx = cx + dx * scale;
      const sy = cy + dy * scale;

      // Bilinear interpolation
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
      if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) {
        const di = (y * width + x) * 4;
        rd[di] = rd[di + 1] = rd[di + 2] = 0; rd[di + 3] = 255;
        continue;
      }
      const fx = sx - x0, fy = sy - y0;
      const di = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        rd[di + c] = Math.round(
          data[(y0 * width + x0) * 4 + c] * (1 - fx) * (1 - fy) +
          data[(y0 * width + x1) * 4 + c] * fx * (1 - fy) +
          data[(y1 * width + x0) * 4 + c] * (1 - fx) * fy +
          data[(y1 * width + x1) * 4 + c] * fx * fy
        );
      }
    }
  }
  return result;
}

/**
 * Apply filter to a canvas and return a new canvas
 */
export function applyFilterToCanvas(
  sourceCanvas: HTMLCanvasElement,
  filterFn: (imageData: ImageData) => ImageData
): HTMLCanvasElement {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get 2d context');

  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const filteredData = filterFn(imageData);

  const { canvas: result, ctx: resultCtx } = createOffscreenCanvas(
    sourceCanvas.width,
    sourceCanvas.height
  );
  resultCtx.putImageData(filteredData, 0, 0);

  return result;
}
