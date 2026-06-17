/**
 * Canvas Engine
 * Core canvas utilities for image manipulation.
 *
 * Specialized logic is in sibling modules:
 *   - colorUtils.ts   — hex/RGB/HSL conversion, clamp, lerp, distance
 *   - blendModes.ts   — custom pixel-level blend modes, compositeCanvases
 *   - adjustments.ts  — applyAdjustmentsToCanvas (single-pass pixel pipeline)
 *
 * This module re-exports everything for backwards compatibility.
 */

import type { TextSettings } from '@/features/image-editor/stores/imageEditor.store';

// ==================== Re-exports (backwards compatibility) ====================

// Color utilities
export {
  clamp, lerp, distance, angle, snapCoord,
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb,
} from './colorUtils';

// Blend modes
export {
  getCompositeOperation, isCustomBlendMode,
  applyCustomBlendMode, compositeCanvases,
} from './blendModes';

// Adjustments
export {
  applyAdjustmentsToCanvas,
  type AdjustmentValues, type LevelsValues,
} from './adjustments';

// ==================== Canvas Creation ====================

/**
 * Create an offscreen canvas with optional initial dimensions
 */
export function createOffscreenCanvas(
  width: number,
  height: number,
  willReadFrequently = false
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently });
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }
  return { canvas, ctx };
}

/**
 * Clone an existing canvas
 */
export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = createOffscreenCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

// ==================== ImageData Operations ====================

/**
 * Get ImageData from a canvas
 */
export function getImageDataFromCanvas(
  canvas: HTMLCanvasElement,
  x = 0,
  y = 0,
  width?: number,
  height?: number
): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get 2d context');
  return ctx.getImageData(x, y, width ?? canvas.width, height ?? canvas.height);
}

/**
 * Put ImageData to a canvas
 */
export function putImageDataToCanvas(
  canvas: HTMLCanvasElement,
  imageData: ImageData,
  x = 0,
  y = 0
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');
  ctx.putImageData(imageData, x, y);
}

/**
 * Create ImageData from a color
 */
export function createSolidImageData(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): ImageData {
  const imageData = new ImageData(width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return imageData;
}

// ==================== Selection Mask Operations ====================

/**
 * Apply a selection mask to a canvas
 * Mask should be grayscale where white = selected, black = not selected
 */
export function applySelectionMask(
  sourceCanvas: HTMLCanvasElement,
  maskDataUrl: string,
  operation: 'apply' | 'invert' = 'apply'
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const maskImg = new Image();
    maskImg.onload = () => {
      const { canvas: result, ctx } = createOffscreenCanvas(
        sourceCanvas.width,
        sourceCanvas.height
      );

      // Draw the mask
      ctx.drawImage(maskImg, 0, 0, sourceCanvas.width, sourceCanvas.height);

      // Get mask data
      const maskData = ctx.getImageData(0, 0, result.width, result.height);

      // Clear and draw source
      ctx.clearRect(0, 0, result.width, result.height);
      ctx.drawImage(sourceCanvas, 0, 0);

      // Get source data
      const sourceData = ctx.getImageData(0, 0, result.width, result.height);

      // Apply mask to alpha channel
      for (let i = 0; i < sourceData.data.length; i += 4) {
        const maskValue = maskData.data[i]; // Use R channel of mask
        const alpha = operation === 'invert' ? 255 - maskValue : maskValue;
        sourceData.data[i + 3] = Math.min(sourceData.data[i + 3], alpha);
      }

      ctx.putImageData(sourceData, 0, 0);
      resolve(result);
    };
    maskImg.onerror = () => reject(new Error('Failed to load mask image'));
    maskImg.src = maskDataUrl;
  });
}

/**
 * Create an empty mask (all white = all selected)
 */
export function createEmptyMask(width: number, height: number): string {
  const { canvas, ctx } = createOffscreenCanvas(width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}

/**
 * Create a mask from selection bounds
 */
export function createMaskFromBounds(
  width: number,
  height: number,
  bounds: { x: number; y: number; width: number; height: number },
  feather = 0
): string {
  const { canvas, ctx } = createOffscreenCanvas(width, height);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  if (feather > 0) {
    ctx.filter = `blur(${feather}px)`;
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.filter = 'none';

  return canvas.toDataURL('image/png');
}

// ==================== Selection Mask Blend Utilities ====================

/**
 * Blend edited canvas with original using a selection mask (Uint8ClampedArray).
 * Pixels where mask=255 get the edited version, mask=0 get the original.
 */
export function blendWithSelectionMask(
  original: HTMLCanvasElement,
  edited: HTMLCanvasElement,
  mask: Uint8ClampedArray
): HTMLCanvasElement {
  const w = original.width;
  const h = original.height;
  const { canvas, ctx } = createOffscreenCanvas(w, h, true);

  const origCtx = original.getContext('2d', { willReadFrequently: true });
  const editCtx = edited.getContext('2d', { willReadFrequently: true });
  if (!origCtx || !editCtx) return edited;

  const origData = origCtx.getImageData(0, 0, w, h);
  const editData = editCtx.getImageData(0, 0, w, h);
  const resultData = ctx.createImageData(w, h);

  for (let i = 0; i < mask.length; i++) {
    const alpha = mask[i] / 255;
    const pi = i * 4;
    resultData.data[pi]     = origData.data[pi] * (1 - alpha) + editData.data[pi] * alpha;
    resultData.data[pi + 1] = origData.data[pi + 1] * (1 - alpha) + editData.data[pi + 1] * alpha;
    resultData.data[pi + 2] = origData.data[pi + 2] * (1 - alpha) + editData.data[pi + 2] * alpha;
    resultData.data[pi + 3] = origData.data[pi + 3] * (1 - alpha) + editData.data[pi + 3] * alpha;
  }

  ctx.putImageData(resultData, 0, 0);
  return canvas;
}

/**
 * Mask a stroke canvas so only pixels within the selection remain.
 */
export function maskStrokeCanvas(
  strokeCanvas: HTMLCanvasElement,
  mask: Uint8ClampedArray
): HTMLCanvasElement {
  const w = strokeCanvas.width;
  const h = strokeCanvas.height;
  const { canvas, ctx } = createOffscreenCanvas(w, h, true);
  ctx.drawImage(strokeCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < mask.length; i++) {
    const pi = i * 4;
    imageData.data[pi + 3] = Math.round(imageData.data[pi + 3] * (mask[i] / 255));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ==================== Color Utilities (getPixelColor) ====================

/**
 * Get color at specific pixel from canvas
 */
export function getPixelColor(
  canvas: HTMLCanvasElement,
  x: number,
  y: number
): { r: number; g: number; b: number; a: number } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get 2d context');
  const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
}

// ==================== Canvas to/from Data URL ====================

export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.92
): string {
  return canvas.toDataURL(type, quality);
}

export function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { canvas, ctx } = createOffscreenCanvas(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

export function imageUrlToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const { canvas, ctx } = createOffscreenCanvas(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

// ==================== Coordinate Transformation ====================

export function screenToImage(
  screenX: number,
  screenY: number,
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  zoom: number,
  panOffset: { x: number; y: number },
  rotation: number,
  flipHorizontal: boolean,
  flipVertical: boolean
): { x: number; y: number } {
  const scale = zoom / 100;
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;
  const imageX = (containerWidth - scaledWidth) / 2 + panOffset.x;
  const imageY = (containerHeight - scaledHeight) / 2 + panOffset.y;

  let x = (screenX - imageX) / scale;
  let y = (screenY - imageY) / scale;

  if (rotation !== 0) {
    const rad = (-rotation * Math.PI) / 180;
    const cx = imageWidth / 2;
    const cy = imageHeight / 2;
    const dx = x - cx;
    const dy = y - cy;
    x = dx * Math.cos(rad) - dy * Math.sin(rad) + cx;
    y = dx * Math.sin(rad) + dy * Math.cos(rad) + cy;
  }

  if (flipHorizontal) x = imageWidth - x;
  if (flipVertical) y = imageHeight - y;

  return { x, y };
}

export function imageToScreen(
  imageX: number,
  imageY: number,
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  zoom: number,
  panOffset: { x: number; y: number },
  rotation: number,
  flipHorizontal: boolean,
  flipVertical: boolean
): { x: number; y: number } {
  let x = imageX;
  let y = imageY;

  if (flipHorizontal) x = imageWidth - x;
  if (flipVertical) y = imageHeight - y;

  if (rotation !== 0) {
    const rad = (rotation * Math.PI) / 180;
    const cx = imageWidth / 2;
    const cy = imageHeight / 2;
    const dx = x - cx;
    const dy = y - cy;
    x = dx * Math.cos(rad) - dy * Math.sin(rad) + cx;
    y = dx * Math.sin(rad) + dy * Math.cos(rad) + cy;
  }

  const scale = zoom / 100;
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;
  const containerX = (containerWidth - scaledWidth) / 2 + panOffset.x;
  const containerY = (containerHeight - scaledHeight) / 2 + panOffset.y;

  return { x: x * scale + containerX, y: y * scale + containerY };
}

// ==================== Transform Operations ====================

export interface TransformValues {
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export function applyTransformsToCanvas(
  sourceCanvas: HTMLCanvasElement,
  transforms: TransformValues
): HTMLCanvasElement {
  const { rotation, flipHorizontal, flipVertical } = transforms;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  const isRightAngle = rotation % 90 === 0;
  let newWidth: number;
  let newHeight: number;

  if (isRightAngle) {
    if (rotation === 90 || rotation === 270) {
      newWidth = sourceCanvas.height;
      newHeight = sourceCanvas.width;
    } else {
      newWidth = sourceCanvas.width;
      newHeight = sourceCanvas.height;
    }
  } else {
    newWidth = Math.ceil(sourceCanvas.width * cos + sourceCanvas.height * sin);
    newHeight = Math.ceil(sourceCanvas.width * sin + sourceCanvas.height * cos);
  }

  const { canvas, ctx } = createOffscreenCanvas(newWidth, newHeight);
  ctx.translate(newWidth / 2, newHeight / 2);
  if (rotation !== 0) ctx.rotate(radians);
  ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

  return canvas;
}

// ==================== Warp Transform ====================

export interface WarpPoint {
  x: number;
  y: number;
}

export function applyWarpToCanvas(
  source: HTMLCanvasElement,
  grid: WarpPoint[][]
): HTMLCanvasElement {
  const W = source.width;
  const H = source.height;

  const { canvas: dst, ctx: dstCtx } = createOffscreenCanvas(W, H);
  const { ctx: srcCtx } = createOffscreenCanvas(W, H);
  srcCtx.drawImage(source, 0, 0);

  const srcData = srcCtx.getImageData(0, 0, W, H);
  const dstData = dstCtx.createImageData(W, H);

  function sample(sx: number, sy: number): [number, number, number, number] {
    sx = Math.min(Math.max(sx, 0), W - 1);
    sy = Math.min(Math.max(sy, 0), H - 1);
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = Math.min(x0 + 1, W - 1);
    const y1 = Math.min(y0 + 1, H - 1);
    const fx = sx - x0;
    const fy = sy - y0;
    const i00 = (y0 * W + x0) * 4;
    const i10 = (y0 * W + x1) * 4;
    const i01 = (y1 * W + x0) * 4;
    const i11 = (y1 * W + x1) * 4;
    const d = srcData.data;
    return [
      d[i00] * (1 - fx) * (1 - fy) + d[i10] * fx * (1 - fy) + d[i01] * (1 - fx) * fy + d[i11] * fx * fy,
      d[i00 + 1] * (1 - fx) * (1 - fy) + d[i10 + 1] * fx * (1 - fy) + d[i01 + 1] * (1 - fx) * fy + d[i11 + 1] * fx * fy,
      d[i00 + 2] * (1 - fx) * (1 - fy) + d[i10 + 2] * fx * (1 - fy) + d[i01 + 2] * (1 - fx) * fy + d[i11 + 2] * fx * fy,
      d[i00 + 3] * (1 - fx) * (1 - fy) + d[i10 + 3] * fx * (1 - fy) + d[i01 + 3] * (1 - fx) * fy + d[i11 + 3] * fx * fy,
    ];
  }

  for (let py = 0; py < H; py++) {
    const pr = py < H / 2 ? 0 : 1;
    const fy = pr === 0 ? (py / (H / 2)) : ((py - H / 2) / (H / 2));

    for (let px = 0; px < W; px++) {
      const pc = px < W / 2 ? 0 : 1;
      const fx = pc === 0 ? (px / (W / 2)) : ((px - W / 2) / (W / 2));

      const tl = grid[pr][pc];
      const tr = grid[pr][pc + 1];
      const bl = grid[pr + 1][pc];
      const br = grid[pr + 1][pc + 1];

      const sx = tl.x * (1 - fx) * (1 - fy) + tr.x * fx * (1 - fy) + bl.x * (1 - fx) * fy + br.x * fx * fy;
      const sy = tl.y * (1 - fx) * (1 - fy) + tr.y * fx * (1 - fy) + bl.y * (1 - fx) * fy + br.y * fx * fy;

      const [r, g, b, a] = sample(sx, sy);
      const idx = (py * W + px) * 4;
      dstData.data[idx] = r;
      dstData.data[idx + 1] = g;
      dstData.data[idx + 2] = b;
      dstData.data[idx + 3] = a;
    }
  }

  dstCtx.putImageData(dstData, 0, 0);
  return dst;
}

export function createDefaultWarpGrid(width: number, height: number): WarpPoint[][] {
  const grid: WarpPoint[][] = [];
  for (let r = 0; r < 3; r++) {
    const row: WarpPoint[] = [];
    for (let c = 0; c < 3; c++) {
      row.push({ x: (c / 2) * width, y: (r / 2) * height });
    }
    grid.push(row);
  }
  return grid;
}

// ==================== Text Rendering ====================

export function renderTextToCanvas(
  text: string,
  settings: TextSettings
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const padding = 4;
  const font = `${settings.fontStyle} ${settings.fontWeight} ${settings.fontSize}px ${settings.fontFamily}`;
  const lineHeightPx = settings.fontSize * settings.lineHeight;
  const lines = text.split('\n');

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  if (settings.letterSpacing !== 0) {
    (measure as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${settings.letterSpacing}px`;
  }
  let maxWidth = 0;
  for (const line of lines) {
    const w = measure.measureText(line || ' ').width;
    if (w > maxWidth) maxWidth = w;
  }

  const width = Math.ceil(maxWidth) + padding * 2;
  const height = Math.ceil(lineHeightPx * lines.length) + padding * 2;

  const { canvas, ctx } = createOffscreenCanvas(width, height, true);
  ctx.font = font;
  ctx.fillStyle = settings.color;
  ctx.textBaseline = 'top';
  if (settings.letterSpacing !== 0) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${settings.letterSpacing}px`;
  }

  let xOffset = padding;
  if (settings.alignment === 'center') {
    ctx.textAlign = 'center';
    xOffset = width / 2;
  } else if (settings.alignment === 'right') {
    ctx.textAlign = 'right';
    xOffset = width - padding;
  } else {
    ctx.textAlign = 'left';
  }

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], xOffset, padding + i * lineHeightPx);
  }

  return { canvas, width, height };
}
