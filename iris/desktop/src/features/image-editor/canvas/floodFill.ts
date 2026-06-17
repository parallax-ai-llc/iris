/**
 * Flood Fill Algorithm
 * Used for Magic Wand tool and Bucket Fill
 * Implements scanline flood fill with tolerance
 */

// ==================== Types ====================

export interface FloodFillOptions {
  x: number;
  y: number;
  tolerance: number;
  contiguous: boolean;  // If false, select all matching colors
  antiAlias: boolean;
}

export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ==================== Color Distance ====================

/**
 * Calculate color distance (Euclidean distance in RGBA space)
 */
function colorDistance(c1: ColorRGBA, c2: ColorRGBA): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  const da = c1.a - c2.a;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
}

/**
 * Check if two colors match within tolerance
 */
function colorsMatch(c1: ColorRGBA, c2: ColorRGBA, tolerance: number): boolean {
  return colorDistance(c1, c2) <= tolerance * 4.41; // sqrt(255^2 * 4) ≈ 510, normalized
}

/**
 * Get pixel color from ImageData
 */
function getPixel(imageData: ImageData, x: number, y: number): ColorRGBA {
  const idx = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[idx],
    g: imageData.data[idx + 1],
    b: imageData.data[idx + 2],
    a: imageData.data[idx + 3],
  };
}

// ==================== Scanline Flood Fill ====================

/**
 * Scanline flood fill algorithm (contiguous selection)
 * More efficient than recursive flood fill for large areas
 */
export function floodFillContiguous(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number
): Uint8ClampedArray {
  const { width, height } = imageData;
  const mask = new Uint8ClampedArray(width * height);

  // Get target color
  const targetColor = getPixel(imageData, startX, startY);

  // Stack-based scanline algorithm
  const stack: Array<[number, number]> = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;

    // Skip if out of bounds
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const idx = y * width + x;

    // Skip if already visited
    if (visited[idx]) continue;
    visited[idx] = 1;

    // Check if color matches
    const currentColor = getPixel(imageData, x, y);
    if (!colorsMatch(currentColor, targetColor, tolerance)) continue;

    // Calculate match strength for anti-aliasing
    const distance = colorDistance(currentColor, targetColor);
    const maxDistance = tolerance * 4.41;
    const strength = maxDistance > 0 ? 1 - distance / maxDistance : 1;
    mask[idx] = Math.round(strength * 255);

    // Scanline: find left and right bounds
    let leftX = x;
    while (leftX > 0) {
      const leftColor = getPixel(imageData, leftX - 1, y);
      if (!colorsMatch(leftColor, targetColor, tolerance)) break;
      leftX--;
      const leftIdx = y * width + leftX;
      if (!visited[leftIdx]) {
        visited[leftIdx] = 1;
        const d = colorDistance(leftColor, targetColor);
        mask[leftIdx] = Math.round((1 - d / maxDistance) * 255);
      }
    }

    let rightX = x;
    while (rightX < width - 1) {
      const rightColor = getPixel(imageData, rightX + 1, y);
      if (!colorsMatch(rightColor, targetColor, tolerance)) break;
      rightX++;
      const rightIdx = y * width + rightX;
      if (!visited[rightIdx]) {
        visited[rightIdx] = 1;
        const d = colorDistance(rightColor, targetColor);
        mask[rightIdx] = Math.round((1 - d / maxDistance) * 255);
      }
    }

    // Add pixels above and below the scanline
    for (let scanX = leftX; scanX <= rightX; scanX++) {
      if (y > 0) {
        const aboveIdx = (y - 1) * width + scanX;
        if (!visited[aboveIdx]) {
          stack.push([scanX, y - 1]);
        }
      }
      if (y < height - 1) {
        const belowIdx = (y + 1) * width + scanX;
        if (!visited[belowIdx]) {
          stack.push([scanX, y + 1]);
        }
      }
    }
  }

  return mask;
}

/**
 * Non-contiguous color selection (select all matching colors)
 */
export function floodFillNonContiguous(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number
): Uint8ClampedArray {
  const { width, height } = imageData;
  const mask = new Uint8ClampedArray(width * height);

  // Get target color
  const targetColor = getPixel(imageData, startX, startY);
  const maxDistance = tolerance * 4.41;

  // Check every pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const currentColor = getPixel(imageData, x, y);
      if (colorsMatch(currentColor, targetColor, tolerance)) {
        const distance = colorDistance(currentColor, targetColor);
        const strength = maxDistance > 0 ? 1 - distance / maxDistance : 1;
        mask[y * width + x] = Math.round(strength * 255);
      }
    }
  }

  return mask;
}

// ==================== Main Flood Fill Function ====================

/**
 * Main flood fill function with options
 */
export function floodFill(
  imageData: ImageData,
  options: FloodFillOptions
): Uint8ClampedArray {
  const { x, y, tolerance, contiguous } = options;

  // Clamp coordinates
  const startX = Math.max(0, Math.min(imageData.width - 1, Math.floor(x)));
  const startY = Math.max(0, Math.min(imageData.height - 1, Math.floor(y)));

  if (contiguous) {
    return floodFillContiguous(imageData, startX, startY, tolerance);
  } else {
    return floodFillNonContiguous(imageData, startX, startY, tolerance);
  }
}

// ==================== Magic Wand Selection ====================

/**
 * Create a selection mask using magic wand (flood fill from click point)
 */
export function magicWandSelect(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  tolerance: number,
  contiguous: boolean = true
): Uint8ClampedArray {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return new Uint8ClampedArray(canvas.width * canvas.height);
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return floodFill(imageData, {
    x,
    y,
    tolerance,
    contiguous,
    antiAlias: true,
  });
}

// ==================== Bucket Fill ====================

/**
 * Fill an area with a color using flood fill
 */
export function bucketFill(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  fillColor: { r: number; g: number; b: number; a?: number },
  tolerance: number = 0
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Get mask of area to fill
  const mask = floodFillContiguous(imageData, Math.floor(x), Math.floor(y), tolerance);

  // Apply fill color based on mask
  const { r, g, b, a = 255 } = fillColor;

  for (let i = 0; i < mask.length; i++) {
    const maskValue = mask[i];
    if (maskValue > 0) {
      const idx = i * 4;
      const t = maskValue / 255; // Blend factor

      // Blend with existing color for anti-aliased edges
      imageData.data[idx] = Math.round(imageData.data[idx] * (1 - t) + r * t);
      imageData.data[idx + 1] = Math.round(imageData.data[idx + 1] * (1 - t) + g * t);
      imageData.data[idx + 2] = Math.round(imageData.data[idx + 2] * (1 - t) + b * t);
      imageData.data[idx + 3] = Math.round(imageData.data[idx + 3] * (1 - t) + a * t);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ==================== Color Replace ====================

/**
 * Replace all instances of a color with another color
 */
export function colorReplace(
  canvas: HTMLCanvasElement,
  targetX: number,
  targetY: number,
  newColor: { r: number; g: number; b: number; a?: number },
  tolerance: number = 0
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Get target color
  const targetColor = getPixel(imageData, Math.floor(targetX), Math.floor(targetY));
  const { r, g, b, a = 255 } = newColor;
  const maxDistance = tolerance * 4.41;

  for (let i = 0; i < imageData.width * imageData.height; i++) {
    const idx = i * 4;
    const currentColor: ColorRGBA = {
      r: imageData.data[idx],
      g: imageData.data[idx + 1],
      b: imageData.data[idx + 2],
      a: imageData.data[idx + 3],
    };

    if (colorsMatch(currentColor, targetColor, tolerance)) {
      const distance = colorDistance(currentColor, targetColor);
      const t = maxDistance > 0 ? 1 - distance / maxDistance : 1;

      // Blend based on color similarity
      imageData.data[idx] = Math.round(currentColor.r * (1 - t) + r * t);
      imageData.data[idx + 1] = Math.round(currentColor.g * (1 - t) + g * t);
      imageData.data[idx + 2] = Math.round(currentColor.b * (1 - t) + b * t);
      imageData.data[idx + 3] = Math.round(currentColor.a * (1 - t) + a * t);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ==================== Grow Selection (Similar Colors) ====================

/**
 * Grow selection to include similar colors adjacent to current selection
 */
export function growSelection(
  imageData: ImageData,
  currentMask: Uint8ClampedArray,
  tolerance: number
): Uint8ClampedArray {
  const { width, height } = imageData;
  const newMask = new Uint8ClampedArray(currentMask);

  // Collect colors from selected area
  const selectedColors: ColorRGBA[] = [];
  for (let i = 0; i < currentMask.length; i++) {
    if (currentMask[i] > 127) {
      selectedColors.push(getPixel(imageData, i % width, Math.floor(i / width)));
    }
  }

  if (selectedColors.length === 0) return newMask;

  // Check pixels adjacent to selection
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (currentMask[idx] > 0) continue; // Already selected

      // Check if adjacent to selection
      const isAdjacent =
        (x > 0 && currentMask[idx - 1] > 127) ||
        (x < width - 1 && currentMask[idx + 1] > 127) ||
        (y > 0 && currentMask[idx - width] > 127) ||
        (y < height - 1 && currentMask[idx + width] > 127);

      if (!isAdjacent) continue;

      // Check if color matches any selected color
      const currentColor = getPixel(imageData, x, y);
      for (const selectedColor of selectedColors) {
        if (colorsMatch(currentColor, selectedColor, tolerance)) {
          newMask[idx] = 255;
          break;
        }
      }
    }
  }

  return newMask;
}

// ==================== Select Similar ====================

/**
 * Select all pixels with similar colors to current selection
 */
export function selectSimilar(
  imageData: ImageData,
  currentMask: Uint8ClampedArray,
  tolerance: number
): Uint8ClampedArray {
  const { width, height } = imageData;
  const newMask = new Uint8ClampedArray(width * height);

  // Collect colors from selected area
  const selectedColors: ColorRGBA[] = [];
  for (let i = 0; i < currentMask.length; i++) {
    if (currentMask[i] > 127) {
      selectedColors.push(getPixel(imageData, i % width, Math.floor(i / width)));
    }
  }

  if (selectedColors.length === 0) return newMask;

  // Check all pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const currentColor = getPixel(imageData, x, y);
      for (const selectedColor of selectedColors) {
        if (colorsMatch(currentColor, selectedColor, tolerance)) {
          newMask[y * width + x] = 255;
          break;
        }
      }
    }
  }

  return newMask;
}
