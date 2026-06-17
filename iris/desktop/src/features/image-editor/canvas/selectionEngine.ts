/**
 * Selection Engine
 * Handles selection mask operations, marching ants, and selection tools
 */

import { createOffscreenCanvas, hexToRgb } from './canvasEngine';

// ==================== Types ====================

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

// ==================== Selection Mask Creation ====================

/**
 * Create an empty selection mask (all black = nothing selected)
 */
export function createEmptyMask(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height);
}

/**
 * Create a full selection mask (all white = everything selected)
 */
export function createFullMask(width: number, height: number): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  mask.fill(255);
  return mask;
}

/**
 * Create a rectangular selection mask
 */
export function createRectangleMask(
  width: number,
  height: number,
  bounds: SelectionBounds
): Uint8ClampedArray {
  const mask = createEmptyMask(width, height);

  const x1 = Math.max(0, Math.floor(bounds.x));
  const y1 = Math.max(0, Math.floor(bounds.y));
  const x2 = Math.min(width, Math.floor(bounds.x + bounds.width));
  const y2 = Math.min(height, Math.floor(bounds.y + bounds.height));

  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      mask[y * width + x] = 255;
    }
  }

  return mask;
}

/**
 * Create an elliptical selection mask
 */
export function createEllipseMask(
  width: number,
  height: number,
  bounds: SelectionBounds
): Uint8ClampedArray {
  const mask = createEmptyMask(width, height);

  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        mask[y * width + x] = 255;
      }
    }
  }

  return mask;
}

/**
 * Create a polygon/lasso selection mask from points
 */
export function createPolygonMask(
  width: number,
  height: number,
  points: Point[]
): Uint8ClampedArray {
  if (points.length < 3) return createEmptyMask(width, height);

  // Use canvas to rasterize the polygon
  const { ctx } = createOffscreenCanvas(width, height);

  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.closePath();
  ctx.fill();

  // Extract mask from canvas
  const imageData = ctx.getImageData(0, 0, width, height);
  const mask = createEmptyMask(width, height);

  for (let i = 0; i < mask.length; i++) {
    // Use alpha channel as mask
    mask[i] = imageData.data[i * 4 + 3];
  }

  return mask;
}

// ==================== Selection Mask Operations ====================

/**
 * Add to selection (union)
 */
export function addToSelection(
  existing: Uint8ClampedArray,
  addition: Uint8ClampedArray
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(existing.length);
  for (let i = 0; i < existing.length; i++) {
    result[i] = Math.max(existing[i], addition[i]);
  }
  return result;
}

/**
 * Subtract from selection
 */
export function subtractFromSelection(
  existing: Uint8ClampedArray,
  subtraction: Uint8ClampedArray
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(existing.length);
  for (let i = 0; i < existing.length; i++) {
    result[i] = Math.max(0, existing[i] - subtraction[i]);
  }
  return result;
}

/**
 * Intersect selections
 */
export function intersectSelection(
  mask1: Uint8ClampedArray,
  mask2: Uint8ClampedArray
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(mask1.length);
  for (let i = 0; i < mask1.length; i++) {
    result[i] = Math.min(mask1[i], mask2[i]);
  }
  return result;
}

/**
 * Invert selection
 */
export function invertSelection(mask: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(mask.length);
  for (let i = 0; i < mask.length; i++) {
    result[i] = 255 - mask[i];
  }
  return result;
}

/**
 * Feather selection (blur the edges)
 */
export function featherSelection(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  if (radius <= 0) return new Uint8ClampedArray(mask);

  // Sliding-window box blur: O(width×height) per pass regardless of radius
  const passes = 3; // Multiple passes approximate Gaussian blur
  let current = new Uint8ClampedArray(mask);
  let next = new Uint8ClampedArray(mask.length);

  for (let pass = 0; pass < passes; pass++) {
    // Horizontal pass — sliding window
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      let count = 0;

      // Initialize window [0, min(radius, width-1)]
      const initEnd = Math.min(radius, width - 1);
      for (let x = 0; x <= initEnd; x++) {
        sum += current[row + x];
        count++;
      }
      next[row] = Math.round(sum / count);

      for (let x = 1; x < width; x++) {
        const addX = x + radius;
        if (addX < width) { sum += current[row + addX]; count++; }
        const removeX = x - radius - 1;
        if (removeX >= 0) { sum -= current[row + removeX]; count--; }
        next[row + x] = Math.round(sum / count);
      }
    }

    [current, next] = [next, current];

    // Vertical pass — sliding window
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      const initEnd = Math.min(radius, height - 1);
      for (let y = 0; y <= initEnd; y++) {
        sum += current[y * width + x];
        count++;
      }
      next[x] = Math.round(sum / count);

      for (let y = 1; y < height; y++) {
        const addY = y + radius;
        if (addY < height) { sum += current[addY * width + x]; count++; }
        const removeY = y - radius - 1;
        if (removeY >= 0) { sum -= current[removeY * width + x]; count--; }
        next[y * width + x] = Math.round(sum / count);
      }
    }

    [current, next] = [next, current];
  }

  return current;
}

/**
 * Expand selection by a given amount (morphological dilation).
 * Uses separable 2-pass approach: horizontal max → vertical max.
 * Complexity: O(width × height) per pass (sliding window max).
 */
export function expandSelection(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): Uint8ClampedArray {
  if (amount <= 0) return new Uint8ClampedArray(mask);

  const temp = new Uint8ClampedArray(mask.length);
  const result = new Uint8ClampedArray(mask.length);

  // Horizontal max pass
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let maxVal = 0;
      const x0 = Math.max(0, x - amount);
      const x1 = Math.min(width - 1, x + amount);
      for (let ix = x0; ix <= x1; ix++) {
        const v = mask[row + ix];
        if (v > maxVal) maxVal = v;
        if (maxVal === 255) break;
      }
      temp[row + x] = maxVal;
    }
  }

  // Vertical max pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let maxVal = 0;
      const y0 = Math.max(0, y - amount);
      const y1 = Math.min(height - 1, y + amount);
      for (let iy = y0; iy <= y1; iy++) {
        const v = temp[iy * width + x];
        if (v > maxVal) maxVal = v;
        if (maxVal === 255) break;
      }
      result[y * width + x] = maxVal;
    }
  }

  return result;
}

/**
 * Contract selection by a given amount (morphological erosion).
 * Uses separable 2-pass approach: horizontal min → vertical min.
 * Complexity: O(width × height) per pass (sliding window min).
 */
export function contractSelection(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): Uint8ClampedArray {
  if (amount <= 0) return new Uint8ClampedArray(mask);

  const temp = new Uint8ClampedArray(mask.length);
  const result = new Uint8ClampedArray(mask.length);

  // Horizontal min pass
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let minVal = 255;
      const x0 = Math.max(0, x - amount);
      const x1 = Math.min(width - 1, x + amount);
      // Treat edges as 0 (not selected) if window extends beyond image
      if (x - amount < 0 || x + amount >= width) minVal = 0;
      if (minVal > 0) {
        for (let ix = x0; ix <= x1; ix++) {
          const v = mask[row + ix];
          if (v < minVal) minVal = v;
          if (minVal === 0) break;
        }
      }
      temp[row + x] = minVal;
    }
  }

  // Vertical min pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let minVal = 255;
      const y0 = Math.max(0, y - amount);
      const y1 = Math.min(height - 1, y + amount);
      // Treat edges as 0 (not selected) if window extends beyond image
      if (y - amount < 0 || y + amount >= height) minVal = 0;
      if (minVal > 0) {
        for (let iy = y0; iy <= y1; iy++) {
          const v = temp[iy * width + x];
          if (v < minVal) minVal = v;
          if (minVal === 0) break;
        }
      }
      result[y * width + x] = minVal;
    }
  }

  return result;
}

// ==================== Smooth Selection ====================

/**
 * Smooth selection edges by replacing each pixel with the majority value
 * in its neighborhood (radius-based median).
 */
export function smoothSelection(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  if (radius <= 0) return new Uint8ClampedArray(mask);

  const result = new Uint8ClampedArray(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let selected = 0;
      let total = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (dx * dx + dy * dy > radius * radius) continue;
          total++;
          if (mask[ny * width + nx] > 127) selected++;
        }
      }

      result[y * width + x] = selected > total / 2 ? 255 : 0;
    }
  }

  return result;
}

// ==================== Border Selection ====================

/**
 * Convert selection to a border of the given width.
 * Keeps only the edge pixels within `borderWidth` of the selection boundary.
 */
export function borderSelection(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  borderWidth: number
): Uint8ClampedArray {
  if (borderWidth <= 0) return new Uint8ClampedArray(mask);

  const expanded = expandSelection(mask, width, height, borderWidth);
  const contracted = contractSelection(mask, width, height, borderWidth);

  const result = new Uint8ClampedArray(mask.length);
  for (let i = 0; i < mask.length; i++) {
    result[i] = expanded[i] > 127 && contracted[i] <= 127 ? 255 : 0;
  }

  return result;
}

// ==================== Grow Selection ====================

/**
 * Grow selection by adding adjacent pixels that are similar in color
 * to the current selection boundary pixels.
 */
export function growSelection(
  mask: Uint8ClampedArray,
  imageData: ImageData,
  width: number,
  height: number,
  tolerance: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(mask);
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Find boundary pixels and add their unselected neighbors to queue
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] <= 127) continue;
      visited[idx] = 1;

      // Check 4-neighbors
      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (mask[nIdx] > 127 || visited[nIdx]) continue;
        queue.push(nIdx);
        visited[nIdx] = 1;
      }
    }
  }

  // BFS: grow into similar pixels
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % width;
    const y = Math.floor(idx / width);

    // Compare with any selected neighbor
    let matched = false;
    const neighbors = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (result[nIdx] <= 127) continue;

      const pi = idx * 4, ni = nIdx * 4;
      const diff = Math.abs(data[pi] - data[ni]) + Math.abs(data[pi + 1] - data[ni + 1]) + Math.abs(data[pi + 2] - data[ni + 2]);
      if (diff <= tolerance * 3) {
        matched = true;
        break;
      }
    }

    if (matched) {
      result[idx] = 255;
      // Add this pixel's unvisited neighbors
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!visited[nIdx] && result[nIdx] <= 127) {
          queue.push(nIdx);
          visited[nIdx] = 1;
        }
      }
    }
  }

  return result;
}

// ==================== Similar Selection ====================

/**
 * Select all pixels in the image that are similar in color to any
 * currently selected pixel, regardless of adjacency.
 */
export function similarSelection(
  mask: Uint8ClampedArray,
  imageData: ImageData,
  _width: number,
  _height: number,
  tolerance: number
): Uint8ClampedArray {
  const data = imageData.data;
  const result = new Uint8ClampedArray(mask);

  // Collect selected pixel colors (sample up to 1000 for performance)
  const selectedColors: Array<[number, number, number]> = [];
  const step = Math.max(1, Math.floor(mask.length / 1000));
  for (let i = 0; i < mask.length; i += step) {
    if (mask[i] > 127) {
      const pi = i * 4;
      selectedColors.push([data[pi], data[pi + 1], data[pi + 2]]);
    }
  }

  if (selectedColors.length === 0) return result;

  // Check every unselected pixel against sampled colors
  const tol3 = tolerance * 3;
  for (let i = 0; i < mask.length; i++) {
    if (result[i] > 127) continue;
    const pi = i * 4;
    const r = data[pi], g = data[pi + 1], b = data[pi + 2];

    for (const [sr, sg, sb] of selectedColors) {
      if (Math.abs(r - sr) + Math.abs(g - sg) + Math.abs(b - sb) <= tol3) {
        result[i] = 255;
        break;
      }
    }
  }

  return result;
}

// ==================== Selection Bounds ====================

/**
 * Get the bounding box of a selection
 */
export function getSelectionBounds(
  mask: Uint8ClampedArray,
  width: number,
  height: number
): SelectionBounds | null {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hasSelection = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0) {
        hasSelection = true;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!hasSelection) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

// ==================== Mask to/from Canvas ====================

/**
 * Convert mask array to canvas (for visualization)
 */
export function maskToCanvas(
  mask: Uint8ClampedArray,
  width: number,
  height: number
): HTMLCanvasElement {
  const { canvas, ctx } = createOffscreenCanvas(width, height);
  const imageData = ctx.createImageData(width, height);

  for (let i = 0; i < mask.length; i++) {
    const value = mask[i];
    imageData.data[i * 4] = value;     // R
    imageData.data[i * 4 + 1] = value; // G
    imageData.data[i * 4 + 2] = value; // B
    imageData.data[i * 4 + 3] = 255;   // A
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Convert mask to data URL
 */
export function maskToDataUrl(
  mask: Uint8ClampedArray,
  width: number,
  height: number
): string {
  const canvas = maskToCanvas(mask, width, height);
  return canvas.toDataURL('image/png');
}

/**
 * Convert canvas to mask array
 */
export function canvasToMask(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get 2d context');

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8ClampedArray(canvas.width * canvas.height);

  for (let i = 0; i < mask.length; i++) {
    // Use red channel as mask value
    mask[i] = imageData.data[i * 4];
  }

  return mask;
}

/**
 * Convert current selection mask to an inpaint-ready mask data URL.
 * The inpaint mask uses white (255) for areas to fill and black (0) for areas to keep.
 * Selection masks are already in this format (selected = white).
 */
export function selectionToInpaintMask(
  maskDataUrl: string,
  canvasWidth: number,
  canvasHeight: number,
  isInverted: boolean = false
): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return maskDataUrl;

  // Load mask data URL onto canvas
  const img = new Image();
  img.src = maskDataUrl;
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

  if (isInverted) {
    // Invert the mask: white ↔ black
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];       // R
      data[i + 1] = 255 - data[i + 1]; // G
      data[i + 2] = 255 - data[i + 2]; // B
      // Alpha stays the same
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL('image/png');
}

// ==================== Marching Ants Animation ====================

/**
 * Draw marching ants selection outline
 */
export function drawMarchingAnts(
  ctx: CanvasRenderingContext2D,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  offset: number = 0
): void {
  // Find edge pixels
  const edges: Point[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] > 127) {
        // Check if this is an edge pixel
        const isEdge =
          x === 0 ||
          x === width - 1 ||
          y === 0 ||
          y === height - 1 ||
          mask[idx - 1] <= 127 ||
          mask[idx + 1] <= 127 ||
          mask[idx - width] <= 127 ||
          mask[idx + width] <= 127;

        if (isEdge) {
          edges.push({ x, y });
        }
      }
    }
  }

  // Draw alternating black/white pixels with diagonal marching pattern
  // This matches the rect/ellipse selection outline style
  ctx.save();
  for (const edge of edges) {
    const phase = (edge.x + edge.y + offset) % 8;
    ctx.fillStyle = phase < 4 ? '#000000' : '#ffffff';
    ctx.fillRect(edge.x, edge.y, 1, 1);
  }
  ctx.restore();
}

/**
 * Draw selection outline as a path (more efficient for large selections)
 */
export function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  bounds: SelectionBounds,
  offset: number = 0,
  shape: 'rectangle' | 'ellipse' = 'rectangle'
): void {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // Black stroke
  ctx.strokeStyle = '#000000';
  ctx.lineDashOffset = offset;

  ctx.beginPath();
  if (shape === 'ellipse') {
    ctx.ellipse(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width / 2,
      bounds.height / 2,
      0,
      0,
      Math.PI * 2
    );
  } else {
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  ctx.stroke();

  // White stroke (offset)
  ctx.strokeStyle = '#ffffff';
  ctx.lineDashOffset = offset + 4;

  ctx.beginPath();
  if (shape === 'ellipse') {
    ctx.ellipse(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width / 2,
      bounds.height / 2,
      0,
      0,
      Math.PI * 2
    );
  } else {
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  ctx.stroke();

  ctx.restore();
}

// ==================== Selection Fill ====================

/**
 * Fill selection with color
 */
export function fillSelection(
  canvas: HTMLCanvasElement,
  mask: Uint8ClampedArray,
  color: string
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { r, g, b } = hexToRgb(color);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < mask.length; i++) {
    const maskValue = mask[i] / 255;
    if (maskValue > 0) {
      const idx = i * 4;
      // Blend with existing color based on mask value
      imageData.data[idx] = Math.round(imageData.data[idx] * (1 - maskValue) + r * maskValue);
      imageData.data[idx + 1] = Math.round(imageData.data[idx + 1] * (1 - maskValue) + g * maskValue);
      imageData.data[idx + 2] = Math.round(imageData.data[idx + 2] * (1 - maskValue) + b * maskValue);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Delete (clear) selected area
 */
export function deleteSelection(
  canvas: HTMLCanvasElement,
  mask: Uint8ClampedArray
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < mask.length; i++) {
    const maskValue = mask[i] / 255;
    if (maskValue > 0) {
      const idx = i * 4;
      // Make pixels transparent based on mask
      imageData.data[idx + 3] = Math.round(imageData.data[idx + 3] * (1 - maskValue));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ==================== Selection Copy/Paste ====================

/**
 * Copy selected area to a new canvas
 */
export function copySelection(
  sourceCanvas: HTMLCanvasElement,
  mask: Uint8ClampedArray
): HTMLCanvasElement {
  const { canvas, ctx } = createOffscreenCanvas(sourceCanvas.width, sourceCanvas.height);

  ctx.drawImage(sourceCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Apply mask to alpha channel
  for (let i = 0; i < mask.length; i++) {
    const idx = i * 4;
    imageData.data[idx + 3] = Math.min(imageData.data[idx + 3], mask[i]);
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/**
 * Cut selected area (copy and delete)
 */
export function cutSelection(
  sourceCanvas: HTMLCanvasElement,
  mask: Uint8ClampedArray
): HTMLCanvasElement {
  const copied = copySelection(sourceCanvas, mask);
  deleteSelection(sourceCanvas, mask);
  return copied;
}

// ==================== Selection Transform ====================

/**
 * Transform selection bounds
 */
export function transformSelectionBounds(
  bounds: SelectionBounds,
  transform: {
    translateX?: number;
    translateY?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
  }
): SelectionBounds {
  let { x, y, width, height } = bounds;

  // Apply translation
  if (transform.translateX) x += transform.translateX;
  if (transform.translateY) y += transform.translateY;

  // Apply scale
  if (transform.scaleX) {
    const cx = x + width / 2;
    width *= transform.scaleX;
    x = cx - width / 2;
  }
  if (transform.scaleY) {
    const cy = y + height / 2;
    height *= transform.scaleY;
    y = cy - height / 2;
  }

  return { x, y, width, height };
}

// ==================== Refine Edge ====================

export interface RefineEdgeOptions {
  /** Radius in pixels for edge detection (0-100) */
  radius: number;
  /** Smoothing passes (0-10) */
  smoothing: number;
  /** Feather radius in pixels (0-100) */
  feather: number;
  /** Contrast boost for the edge (0-100) */
  contrast: number;
}

/**
 * Refine the edges of a selection mask using edge-aware processing.
 *
 * Steps:
 *  1. Expand the mask by `radius` pixels to capture more edge detail
 *  2. Apply `smoothing` box-blur passes
 *  3. Boost contrast to sharpen the edge boundary
 *  4. Apply feather (soft edge) with the given radius
 */
export function refineEdge(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  options: RefineEdgeOptions
): Uint8ClampedArray {
  const { radius, smoothing, feather, contrast } = options;

  // Step 1: Smart radius — expand by radius pixels
  let refined = radius > 0 ? expandSelection(mask, width, height, radius) : new Uint8ClampedArray(mask);

  // Step 2: Smoothing passes (box blur approximation on the mask)
  if (smoothing > 0) {
    refined = featherSelection(refined, width, height, Math.max(1, Math.round(smoothing / 2)));
  }

  // Step 3: Contrast boost — push values toward 0 or 255
  if (contrast > 0) {
    const factor = 1 + contrast / 50; // 0-100 → 1x to 3x
    const midpoint = 127.5;
    const result = new Uint8ClampedArray(refined.length);
    for (let i = 0; i < refined.length; i++) {
      const v = (refined[i] - midpoint) * factor + midpoint;
      result[i] = Math.max(0, Math.min(255, Math.round(v)));
    }
    refined = result;
  }

  // Step 4: Feather
  if (feather > 0) {
    refined = featherSelection(refined, width, height, feather);
  }

  return refined;
}

// ==================== AI Selection ====================

/**
 * Load a greyscale selection mask data URL (R channel) back into a Uint8ClampedArray.
 * Used when re-loading a mask stored by `maskToDataUrl` / `setSelection`.
 */
export async function loadSelectionMask(
  dataUrl: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { ctx } = createOffscreenCanvas(canvasWidth, canvasHeight);
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const mask = new Uint8ClampedArray(canvasWidth * canvasHeight);
      for (let i = 0; i < mask.length; i++) {
        // Red channel holds the greyscale mask value
        mask[i] = imageData.data[i * 4];
      }
      resolve(mask);
    };
    img.onerror = () => reject(new Error('Failed to load selection mask'));
    img.src = dataUrl;
  });
}

/**
 * Convert a background-removed image (transparent BG = not selected, opaque = selected)
 * into a selection mask Uint8ClampedArray.
 *
 * The input dataUrl should be the result of background removal where the subject
 * is opaque and the background is transparent (alpha = 0).
 *
 * Returns a Promise resolving to a mask array of size width × height, where
 * 255 = fully selected (subject) and 0 = not selected (background).
 */
export async function loadMaskAsSelection(
  dataUrl: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const { ctx } = createOffscreenCanvas(canvasWidth, canvasHeight);
      // Scale the mask image to the canvas size
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

      const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const mask = new Uint8ClampedArray(canvasWidth * canvasHeight);

      for (let i = 0; i < mask.length; i++) {
        // Use alpha channel: alpha > 0 means subject (selected), 0 means background
        mask[i] = imageData.data[i * 4 + 3];
      }

      resolve(mask);
    };

    img.onerror = () => reject(new Error('Failed to load mask image'));
    img.src = dataUrl;
  });
}

// ==================== Selection Utilities ====================

/**
 * Check if a point is inside the selection
 */
export function isPointInSelection(
  mask: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const height = mask.length / width;
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return false;
  const idx = iy * width + ix;
  return mask[idx] > 127;
}

/**
 * Check if selection is empty
 */
export function isSelectionEmpty(mask: Uint8ClampedArray): boolean {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0) return false;
  }
  return true;
}

/**
 * Get selection area (pixel count)
 */
export function getSelectionArea(mask: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 127) count++;
  }
  return count;
}

// ==================== Magnetic Lasso ====================

/**
 * Compute edge strength map using Sobel operator for magnetic lasso snapping.
 */
export function computeEdgeMap(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const edges = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Convert 3x3 neighborhood to luminance
      const getLum = (px: number, py: number) => {
        const i = (py * width + px) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      };

      // Sobel X
      const gx =
        -getLum(x - 1, y - 1) + getLum(x + 1, y - 1) +
        -2 * getLum(x - 1, y) + 2 * getLum(x + 1, y) +
        -getLum(x - 1, y + 1) + getLum(x + 1, y + 1);

      // Sobel Y
      const gy =
        -getLum(x - 1, y - 1) - 2 * getLum(x, y - 1) - getLum(x + 1, y - 1) +
        getLum(x - 1, y + 1) + 2 * getLum(x, y + 1) + getLum(x + 1, y + 1);

      edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

/**
 * Snap a point to the nearest edge within a search radius.
 * Returns the snapped coordinate.
 */
export function snapToEdge(
  edgeMap: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  searchRadius: number = 10
): { x: number; y: number } {
  let bestX = Math.round(x);
  let bestY = Math.round(y);
  let bestStrength = 0;

  const x0 = Math.max(0, Math.floor(x - searchRadius));
  const y0 = Math.max(0, Math.floor(y - searchRadius));
  const x1 = Math.min(width - 1, Math.ceil(x + searchRadius));
  const y1 = Math.min(height - 1, Math.ceil(y + searchRadius));

  for (let sy = y0; sy <= y1; sy++) {
    for (let sx = x0; sx <= x1; sx++) {
      const dx = sx - x, dy = sy - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > searchRadius) continue;

      const strength = edgeMap[sy * width + sx];
      // Weight by proximity (closer = better)
      const weighted = strength * (1 - dist / searchRadius * 0.5);
      if (weighted > bestStrength) {
        bestStrength = weighted;
        bestX = sx;
        bestY = sy;
      }
    }
  }
  return { x: bestX, y: bestY };
}

/**
 * Create a selection mask from magnetic lasso path points.
 */
export function createMagneticLassoMask(
  width: number,
  height: number,
  points: Array<{ x: number; y: number }>
): Uint8ClampedArray {
  // Reuse polygon mask creation with the snapped points
  return createPolygonMask(width, height, points);
}

// ==================== Single Row / Column Marquee ====================

/**
 * Single Row Marquee — selects a 1-pixel-high horizontal row
 */
export function singleRowMarquee(
  width: number,
  height: number,
  row: number
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  const r = Math.max(0, Math.min(height - 1, Math.round(row)));
  for (let x = 0; x < width; x++) {
    mask[r * width + x] = 255;
  }
  return mask;
}

/**
 * Single Column Marquee — selects a 1-pixel-wide vertical column
 */
export function singleColumnMarquee(
  width: number,
  height: number,
  col: number
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  const c = Math.max(0, Math.min(width - 1, Math.round(col)));
  for (let y = 0; y < height; y++) {
    mask[y * width + c] = 255;
  }
  return mask;
}
