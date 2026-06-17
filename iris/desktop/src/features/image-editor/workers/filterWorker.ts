/**
 * Filter Worker
 * Web Worker for offloading heavy filter operations
 * Improves UI responsiveness during filter processing
 */

// Message types
interface FilterMessage {
  type: 'applyFilter';
  id: string;
  filter: FilterType;
  imageData: ImageData;
  params: FilterParams;
}

interface FilterResponse {
  type: 'filterResult';
  id: string;
  imageData: ImageData;
  success: boolean;
  error?: string;
}

type FilterType =
  | 'gaussianBlur'
  | 'motionBlur'
  | 'sharpen'
  | 'unsharpMask'
  | 'addNoise'
  | 'reduceNoise'
  | 'vignette'
  | 'pixelate'
  | 'emboss'
  | 'edgeDetect'
  | 'posterize'
  | 'invert'
  | 'grayscale'
  | 'sepia';

interface FilterParams {
  // Blur
  radius?: number;
  // Motion blur
  angle?: number;
  distance?: number;
  // Sharpen / Unsharp
  amount?: number;
  threshold?: number;
  // Noise
  noiseAmount?: number;
  monochrome?: boolean;
  strength?: number;
  // Vignette
  vignetteAmount?: number;
  vignetteSize?: number;
  // Pixelate
  blockSize?: number;
  // Emboss / Edge
  embossStrength?: number;
  embossAngle?: number;
  // Posterize
  levels?: number;
}

// ==================== Filter Implementations ====================

/**
 * Apply convolution kernel to image data
 */
function applyConvolution(
  imageData: ImageData,
  kernel: number[],
  kernelSize: number,
  divisor: number = 1,
  offset: number = 0
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const half = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;

      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx - half));
          const py = Math.min(height - 1, Math.max(0, y + ky - half));
          const idx = (py * width + px) * 4;
          const weight = kernel[ky * kernelSize + kx];

          r += data[idx] * weight;
          g += data[idx + 1] * weight;
          b += data[idx + 2] * weight;
        }
      }

      const outIdx = (y * width + x) * 4;
      result.data[outIdx] = Math.min(255, Math.max(0, r / divisor + offset));
      result.data[outIdx + 1] = Math.min(255, Math.max(0, g / divisor + offset));
      result.data[outIdx + 2] = Math.min(255, Math.max(0, b / divisor + offset));
      result.data[outIdx + 3] = data[outIdx + 3];
    }
  }

  return result;
}

/**
 * Gaussian blur using separable passes
 */
function gaussianBlur(imageData: ImageData, radius: number): ImageData {
  if (radius <= 0) return imageData;

  const { width, height } = imageData;
  const sigma = radius / 3;
  const kernelSize = Math.ceil(radius * 2) + 1;
  const kernel: number[] = [];
  let sum = 0;

  // Create 1D Gaussian kernel
  for (let i = 0; i < kernelSize; i++) {
    const x = i - Math.floor(kernelSize / 2);
    const value = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(value);
    sum += value;
  }

  // Normalize kernel
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  // Horizontal pass
  let current = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  let next = new ImageData(width, height);

  const halfKernel = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let k = 0; k < kernelSize; k++) {
        const px = Math.min(width - 1, Math.max(0, x + k - halfKernel));
        const idx = (y * width + px) * 4;
        const weight = kernel[k];

        r += current.data[idx] * weight;
        g += current.data[idx + 1] * weight;
        b += current.data[idx + 2] * weight;
        a += current.data[idx + 3] * weight;
      }

      const outIdx = (y * width + x) * 4;
      next.data[outIdx] = r;
      next.data[outIdx + 1] = g;
      next.data[outIdx + 2] = b;
      next.data[outIdx + 3] = a;
    }
  }

  // Vertical pass
  current = next;
  next = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let k = 0; k < kernelSize; k++) {
        const py = Math.min(height - 1, Math.max(0, y + k - halfKernel));
        const idx = (py * width + x) * 4;
        const weight = kernel[k];

        r += current.data[idx] * weight;
        g += current.data[idx + 1] * weight;
        b += current.data[idx + 2] * weight;
        a += current.data[idx + 3] * weight;
      }

      const outIdx = (y * width + x) * 4;
      next.data[outIdx] = r;
      next.data[outIdx + 1] = g;
      next.data[outIdx + 2] = b;
      next.data[outIdx + 3] = a;
    }
  }

  return next;
}

/**
 * Motion blur filter
 */
function motionBlur(imageData: ImageData, angle: number, distance: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);

  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const steps = Math.max(1, Math.floor(distance));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let count = 0;

      for (let i = -steps; i <= steps; i++) {
        const px = Math.round(x + dx * i);
        const py = Math.round(y + dy * i);

        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
          count++;
        }
      }

      const outIdx = (y * width + x) * 4;
      result.data[outIdx] = r / count;
      result.data[outIdx + 1] = g / count;
      result.data[outIdx + 2] = b / count;
      result.data[outIdx + 3] = a / count;
    }
  }

  return result;
}

/**
 * Sharpen filter
 */
function sharpen(imageData: ImageData, amount: number): ImageData {
  const kernel = [
    0, -amount, 0,
    -amount, 1 + 4 * amount, -amount,
    0, -amount, 0,
  ];
  return applyConvolution(imageData, kernel, 3);
}

/**
 * Unsharp mask
 */
function unsharpMask(imageData: ImageData, amount: number, radius: number, threshold: number): ImageData {
  const { width, height, data } = imageData;
  const blurred = gaussianBlur(imageData, radius);
  const result = new ImageData(width, height);

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const original = data[i + c];
      const blur = blurred.data[i + c];
      const diff = original - blur;

      if (Math.abs(diff) > threshold) {
        result.data[i + c] = Math.min(255, Math.max(0, original + diff * amount));
      } else {
        result.data[i + c] = original;
      }
    }
    result.data[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Add noise
 */
function addNoise(imageData: ImageData, amount: number, monochrome: boolean): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);

  for (let i = 0; i < result.data.length; i += 4) {
    if (monochrome) {
      const noise = (Math.random() - 0.5) * amount * 2;
      result.data[i] = Math.min(255, Math.max(0, result.data[i] + noise));
      result.data[i + 1] = Math.min(255, Math.max(0, result.data[i + 1] + noise));
      result.data[i + 2] = Math.min(255, Math.max(0, result.data[i + 2] + noise));
    } else {
      result.data[i] = Math.min(255, Math.max(0, result.data[i] + (Math.random() - 0.5) * amount * 2));
      result.data[i + 1] = Math.min(255, Math.max(0, result.data[i + 1] + (Math.random() - 0.5) * amount * 2));
      result.data[i + 2] = Math.min(255, Math.max(0, result.data[i + 2] + (Math.random() - 0.5) * amount * 2));
    }
  }

  return result;
}

/**
 * Reduce noise (median filter)
 */
function reduceNoise(imageData: ImageData, strength: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const radius = Math.ceil(strength / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const reds: number[] = [];
      const greens: number[] = [];
      const blues: number[] = [];

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = Math.min(width - 1, Math.max(0, x + dx));
          const py = Math.min(height - 1, Math.max(0, y + dy));
          const idx = (py * width + px) * 4;
          reds.push(data[idx]);
          greens.push(data[idx + 1]);
          blues.push(data[idx + 2]);
        }
      }

      reds.sort((a, b) => a - b);
      greens.sort((a, b) => a - b);
      blues.sort((a, b) => a - b);

      const mid = Math.floor(reds.length / 2);
      const outIdx = (y * width + x) * 4;
      result.data[outIdx] = reds[mid];
      result.data[outIdx + 1] = greens[mid];
      result.data[outIdx + 2] = blues[mid];
      result.data[outIdx + 3] = data[outIdx + 3];
    }
  }

  return result;
}

/**
 * Vignette effect
 */
function vignette(imageData: ImageData, amount: number, size: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const innerRadius = maxDist * (1 - size / 100);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let factor = 1;
      if (dist > innerRadius) {
        const t = (dist - innerRadius) / (maxDist - innerRadius);
        factor = 1 - t * (amount / 100);
      }

      const idx = (y * width + x) * 4;
      result.data[idx] = result.data[idx] * factor;
      result.data[idx + 1] = result.data[idx + 1] * factor;
      result.data[idx + 2] = result.data[idx + 2] * factor;
    }
  }

  return result;
}

/**
 * Pixelate
 */
function pixelate(imageData: ImageData, blockSize: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);

  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      let r = 0, g = 0, b = 0, count = 0;

      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          const idx = (y * width + x) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          const idx = (y * width + x) * 4;
          result.data[idx] = r;
          result.data[idx + 1] = g;
          result.data[idx + 2] = b;
          result.data[idx + 3] = data[idx + 3];
        }
      }
    }
  }

  return result;
}

/**
 * Emboss
 */
function emboss(imageData: ImageData, strength: number, angle: number): ImageData {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const kernel = [
    -strength * dy - strength * dx, -strength * dy, -strength * dy + strength * dx,
    -strength * dx, 1, strength * dx,
    strength * dy - strength * dx, strength * dy, strength * dy + strength * dx,
  ];

  return applyConvolution(imageData, kernel, 3, 1, 128);
}

/**
 * Edge detection
 */
function edgeDetect(imageData: ImageData): ImageData {
  const kernel = [
    -1, -1, -1,
    -1, 8, -1,
    -1, -1, -1,
  ];
  return applyConvolution(imageData, kernel, 3);
}

/**
 * Posterize
 */
function posterize(imageData: ImageData, levels: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const step = 255 / (levels - 1);

  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i] = Math.round(Math.round(result.data[i] / step) * step);
    result.data[i + 1] = Math.round(Math.round(result.data[i + 1] / step) * step);
    result.data[i + 2] = Math.round(Math.round(result.data[i + 2] / step) * step);
  }

  return result;
}

/**
 * Invert colors
 */
function invert(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);

  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i] = 255 - result.data[i];
    result.data[i + 1] = 255 - result.data[i + 1];
    result.data[i + 2] = 255 - result.data[i + 2];
  }

  return result;
}

/**
 * Grayscale
 */
function grayscale(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);

  for (let i = 0; i < result.data.length; i += 4) {
    const gray = result.data[i] * 0.299 + result.data[i + 1] * 0.587 + result.data[i + 2] * 0.114;
    result.data[i] = gray;
    result.data[i + 1] = gray;
    result.data[i + 2] = gray;
  }

  return result;
}

/**
 * Sepia
 */
function sepia(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);

  for (let i = 0; i < result.data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    result.data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
    result.data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
    result.data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
  }

  return result;
}

// ==================== Message Handler ====================

self.onmessage = function (e: MessageEvent<FilterMessage>) {
  const { type, id, filter, imageData, params } = e.data;

  if (type !== 'applyFilter') {
    return;
  }

  try {
    let result: ImageData;

    switch (filter) {
      case 'gaussianBlur':
        result = gaussianBlur(imageData, params.radius || 5);
        break;
      case 'motionBlur':
        result = motionBlur(imageData, params.angle || 0, params.distance || 10);
        break;
      case 'sharpen':
        result = sharpen(imageData, params.amount || 1);
        break;
      case 'unsharpMask':
        result = unsharpMask(imageData, params.amount || 1, params.radius || 2, params.threshold || 0);
        break;
      case 'addNoise':
        result = addNoise(imageData, params.noiseAmount || 25, params.monochrome || false);
        break;
      case 'reduceNoise':
        result = reduceNoise(imageData, params.strength || 3);
        break;
      case 'vignette':
        result = vignette(imageData, params.vignetteAmount || 50, params.vignetteSize || 50);
        break;
      case 'pixelate':
        result = pixelate(imageData, params.blockSize || 8);
        break;
      case 'emboss':
        result = emboss(imageData, params.embossStrength || 1, params.embossAngle || 135);
        break;
      case 'edgeDetect':
        result = edgeDetect(imageData);
        break;
      case 'posterize':
        result = posterize(imageData, params.levels || 4);
        break;
      case 'invert':
        result = invert(imageData);
        break;
      case 'grayscale':
        result = grayscale(imageData);
        break;
      case 'sepia':
        result = sepia(imageData);
        break;
      default:
        throw new Error(`Unknown filter: ${filter}`);
    }

    const response: FilterResponse = {
      type: 'filterResult',
      id,
      imageData: result,
      success: true,
    };

    self.postMessage(response);
  } catch (error) {
    const response: FilterResponse = {
      type: 'filterResult',
      id,
      imageData: imageData,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    self.postMessage(response);
  }
};

export {};
