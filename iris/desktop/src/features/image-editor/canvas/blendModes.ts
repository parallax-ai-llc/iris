/**
 * Blend Modes
 * Custom pixel-level blend mode implementations for modes not natively supported by Canvas2D.
 * Native modes are mapped via getCompositeOperation().
 */

import type { BlendMode } from '@/features/image-editor/stores/imageEditor.store';
import { createOffscreenCanvas } from './canvasEngine';

// ==================== Native Blend Mode Mapping ====================

const COMPOSITE_MAP: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'soft-light': 'soft-light',
  'hard-light': 'hard-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

/**
 * Map BlendMode to Canvas2D globalCompositeOperation.
 * Custom blend modes (dissolve, linear-burn, etc.) fall back to source-over
 * and must be handled via applyCustomBlendMode() for correct results.
 */
export function getCompositeOperation(blendMode: BlendMode): GlobalCompositeOperation {
  return COMPOSITE_MAP[blendMode] || 'source-over';
}

// ==================== Custom Blend Modes ====================

const CUSTOM_BLEND_MODES: ReadonlySet<BlendMode> = new Set<BlendMode>([
  'dissolve', 'linear-burn', 'linear-dodge', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix',
  'darker-color', 'lighter-color',
  // Routed through custom pixel path: Canvas2D native 'darken'/'lighten' misbehaves
  // over transparent destination regions in Chromium, producing no visible effect.
  'darken', 'lighten',
]);

/**
 * Check if a blend mode requires custom pixel-level blending
 */
export function isCustomBlendMode(blendMode: BlendMode): boolean {
  return CUSTOM_BLEND_MODES.has(blendMode);
}

// ==================== Pixel-Level Blending ====================

/**
 * Per-channel blend function (0-255 domain).
 * Operates in normalized [0,1] internally, returns clamped [0,255].
 */
function blendChannel(base: number, top: number, mode: BlendMode): number {
  const b = base / 255;
  const t = top / 255;
  let result: number;

  switch (mode) {
    case 'darken':
      result = Math.min(b, t);
      break;
    case 'lighten':
      result = Math.max(b, t);
      break;
    case 'linear-burn':
      result = b + t - 1;
      break;
    case 'linear-dodge':
      result = b + t;
      break;
    case 'vivid-light':
      if (t <= 0.5) {
        const d = 2 * t;
        result = d === 0 ? 0 : 1 - (1 - b) / d;
      } else {
        const d = 2 * (t - 0.5);
        result = d >= 1 ? 1 : b / (1 - d);
      }
      break;
    case 'linear-light':
      result = b + 2 * t - 1;
      break;
    case 'pin-light':
      result = t <= 0.5 ? Math.min(b, 2 * t) : Math.max(b, 2 * t - 1);
      break;
    case 'hard-mix':
      result = (b + t >= 1) ? 1 : 0;
      break;
    default:
      result = t;
  }

  // Clamp + round in one step
  return result <= 0 ? 0 : result >= 1 ? 255 : (result * 255 + 0.5) | 0;
}

/**
 * Composite topCanvas onto baseCanvas using a custom (non-native) blend mode.
 * Returns a new canvas with the blended result.
 */
export function applyCustomBlendMode(
  baseCanvas: HTMLCanvasElement,
  topCanvas: HTMLCanvasElement,
  blendMode: BlendMode,
  opacity = 100,
  x = 0,
  y = 0
): HTMLCanvasElement {
  const { width, height } = baseCanvas;
  const { canvas: result, ctx } = createOffscreenCanvas(width, height, true);
  const opacityFactor = opacity / 100;

  ctx.drawImage(baseCanvas, 0, 0);

  // === Dissolve: random dither ===
  if (blendMode === 'dissolve') {
    const topCtx = topCanvas.getContext('2d', { willReadFrequently: true })!;
    const topData = topCtx.getImageData(0, 0, topCanvas.width, topCanvas.height);
    const resultData = ctx.getImageData(0, 0, width, height);
    const rd = resultData.data;
    const td = topData.data;
    const tw = topCanvas.width;
    const th = topCanvas.height;

    for (let py = 0; py < th; py++) {
      const ry = py + y;
      if (ry < 0 || ry >= height) continue;
      for (let px = 0; px < tw; px++) {
        const rx = px + x;
        if (rx < 0 || rx >= width) continue;
        const ti = (py * tw + px) * 4;
        const topAlpha = (td[ti + 3] / 255) * opacityFactor;
        if (Math.random() < topAlpha) {
          const ri = (ry * width + rx) * 4;
          rd[ri]     = td[ti];
          rd[ri + 1] = td[ti + 1];
          rd[ri + 2] = td[ti + 2];
          rd[ri + 3] = 255;
        }
      }
    }
    ctx.putImageData(resultData, 0, 0);
    return result;
  }

  // === Standard custom blend: pixel-level ===
  const baseData = ctx.getImageData(0, 0, width, height);
  const bd = baseData.data;

  // Draw top at offset into a same-size canvas for alignment
  const { ctx: alignedCtx } = createOffscreenCanvas(width, height, true);
  alignedCtx.drawImage(topCanvas, x, y);
  const topData = alignedCtx.getImageData(0, 0, width, height);
  const td = topData.data;

  // === Darker Color / Lighter Color: whole-pixel comparison by luminance ===
  if (blendMode === 'darker-color' || blendMode === 'lighter-color') {
    const isDarker = blendMode === 'darker-color';
    for (let i = 0; i < bd.length; i += 4) {
      const topAlpha = (td[i + 3] / 255) * opacityFactor;
      if (topAlpha === 0) continue;
      const baseLum = bd[i] * 0.299 + bd[i + 1] * 0.587 + bd[i + 2] * 0.114;
      const topLum = td[i] * 0.299 + td[i + 1] * 0.587 + td[i + 2] * 0.114;
      const useTop = isDarker ? topLum < baseLum : topLum > baseLum;
      if (useTop) {
        bd[i]     = (bd[i]     * (1 - topAlpha) + td[i]     * topAlpha + 0.5) | 0;
        bd[i + 1] = (bd[i + 1] * (1 - topAlpha) + td[i + 1] * topAlpha + 0.5) | 0;
        bd[i + 2] = (bd[i + 2] * (1 - topAlpha) + td[i + 2] * topAlpha + 0.5) | 0;
      }
      bd[i + 3] = Math.min(255, bd[i + 3] + ((td[i + 3] * opacityFactor + 0.5) | 0));
    }
    ctx.putImageData(baseData, 0, 0);
    return result;
  }

  for (let i = 0; i < bd.length; i += 4) {
    const topAlpha = (td[i + 3] / 255) * opacityFactor;
    if (topAlpha === 0) continue;

    const br = blendChannel(bd[i], td[i], blendMode);
    const bg = blendChannel(bd[i + 1], td[i + 1], blendMode);
    const bb = blendChannel(bd[i + 2], td[i + 2], blendMode);

    // Lerp base → blended by top alpha
    bd[i]     = (bd[i]     * (1 - topAlpha) + br * topAlpha + 0.5) | 0;
    bd[i + 1] = (bd[i + 1] * (1 - topAlpha) + bg * topAlpha + 0.5) | 0;
    bd[i + 2] = (bd[i + 2] * (1 - topAlpha) + bb * topAlpha + 0.5) | 0;
    bd[i + 3] = Math.min(255, bd[i + 3] + ((td[i + 3] * opacityFactor + 0.5) | 0));
  }

  ctx.putImageData(baseData, 0, 0);
  return result;
}

/**
 * Composite two canvases together with blend mode and opacity.
 * Routes custom blend modes through pixel-level blending.
 */
export function compositeCanvases(
  baseCanvas: HTMLCanvasElement,
  topCanvas: HTMLCanvasElement,
  blendMode: BlendMode = 'normal',
  opacity = 100,
  x = 0,
  y = 0
): HTMLCanvasElement {
  if (isCustomBlendMode(blendMode)) {
    return applyCustomBlendMode(baseCanvas, topCanvas, blendMode, opacity, x, y);
  }

  const { canvas: result, ctx } = createOffscreenCanvas(baseCanvas.width, baseCanvas.height);
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.globalCompositeOperation = getCompositeOperation(blendMode);
  ctx.globalAlpha = opacity / 100;
  ctx.drawImage(topCanvas, x, y);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return result;
}
