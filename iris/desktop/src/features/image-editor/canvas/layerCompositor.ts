/**
 * Layer Compositor
 * Pure layer compositing utility that flattens multiple layers into a single canvas.
 * Extracts the compositing logic from EditorCanvas.renderAllLayers() without UI concerns.
 *
 * This is the document renderer for everything that leaves the screen: save,
 * export, clipboard, the PSD composite preview, merge/flatten and the AI tools.
 * It follows the PSD exporter's rules (exportPsd.ts):
 *  - layer masks are luminance masks (white = visible, black = hidden), drawn
 *    in document coordinates; an empty mask reveals all, a disabled one is ignored
 *  - a hidden group hides every descendant, and a group's opacity applies to its
 *    descendants (pass-through)
 *  - every layer and mask image is fully loaded before anything is drawn
 * Display-only state (channel view, proof colors, gamut warning, the live
 * adjustment preview) is never applied here.
 */

import type { Layer } from '@/features/image-editor/stores/imageEditor.store';
import type { AdjustmentValues } from './adjustments';
import { createOffscreenCanvas } from './canvasEngine';
import { applyAdjustmentsToCanvas } from './adjustments';
import { isCustomBlendMode, applyCustomBlendMode } from './blendModes';
import { applyClippingMask } from './layerEffects';

/**
 * Load a base64 data URL as an HTMLImageElement.
 */
function loadImage(dataUrl: string | undefined): Promise<HTMLImageElement | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function hasActiveMask(layer: Layer): boolean {
  return !!(layer.mask?.enabled && layer.mask.data);
}

/**
 * The layers that actually render, with group state folded in:
 *  - group layers are dropped (they hold no pixels of their own)
 *  - a layer under a hidden group (at any depth) becomes hidden
 *  - group opacity multiplies into each descendant's opacity
 * Order is preserved and the input layers are not mutated.
 */
export function resolveRenderableLayers(layers: Layer[]): Layer[] {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const out: Layer[] = [];
  for (const layer of layers) {
    if (layer.type === 'group') continue;
    let visible = layer.visible;
    let opacity = layer.opacity;
    const seen = new Set<string>([layer.id]);
    let parentId = layer.parentId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (!parent.visible) visible = false;
      opacity = (opacity * parent.opacity) / 100;
      parentId = parent.parentId;
    }
    out.push(visible === layer.visible && opacity === layer.opacity ? layer : { ...layer, visible, opacity });
  }
  return out;
}

/**
 * Multiply `target`'s alpha by the mask's luminance (and the mask's own alpha).
 * Both images must have the same size. White keeps a pixel, black removes it.
 */
export function applyLuminanceMask(target: ImageData, mask: ImageData): void {
  const t = target.data;
  const m = mask.data;
  const n = Math.min(t.length, m.length);
  for (let p = 0; p < n; p += 4) {
    const lum = 0.299 * m[p] + 0.587 * m[p + 1] + 0.114 * m[p + 2];
    t[p + 3] = t[p + 3] * (lum / 255) * (m[p + 3] / 255);
  }
}

/** Apply a loaded mask image (document coordinates) to `canvas` in place. */
function maskCanvasInPlace(canvas: HTMLCanvasElement, maskImg: HTMLImageElement, width: number, height: number): void {
  const { ctx: maskCtx } = createOffscreenCanvas(width, height);
  maskCtx.drawImage(maskImg, 0, 0);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const target = ctx.getImageData(0, 0, width, height);
  applyLuminanceMask(target, maskCtx.getImageData(0, 0, width, height));
  ctx.putImageData(target, 0, 0);
}

/**
 * Render a single raster layer (with its mask) to a temp canvas.
 * Returns null for adjustment layers or layers with no image data.
 */
function renderLayerToCanvas(
  layer: Layer,
  img: HTMLImageElement | null,
  maskImg: HTMLImageElement | null,
  canvasWidth: number,
  canvasHeight: number,
): HTMLCanvasElement | null {
  if (layer.type === 'adjustment' && layer.adjustmentValues) return null;
  if (!img) return null;

  const { canvas: tempCanvas, ctx: tempCtx } = createOffscreenCanvas(canvasWidth, canvasHeight);
  tempCtx.drawImage(img, layer.x, layer.y);
  if (maskImg && hasActiveMask(layer)) maskCanvasInPlace(tempCanvas, maskImg, canvasWidth, canvasHeight);
  return tempCanvas;
}

/**
 * Composite all visible layers into a single canvas of the document size.
 * Same pipeline as EditorCanvas.renderAllLayers (adjustment layers, clipping,
 * blend modes, opacity) plus layer masks and group visibility/opacity, without
 * any display-only state (no live filter preview, channel view, proof colors
 * or gamut warning).
 */
export async function compositeLayers(
  inputLayers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = createOffscreenCanvas(canvasWidth, canvasHeight);

  const layers = resolveRenderableLayers(inputLayers);
  if (layers.length === 0) return canvas;

  // Load every layer and mask image BEFORE drawing anything (a mask drawn
  // before it decodes would silently vanish from the result).
  const [images, maskImages] = await Promise.all([
    Promise.all(layers.map((layer) => (layer.visible ? loadImage(layer.imageData) : Promise.resolve(null)))),
    Promise.all(layers.map((layer) => (layer.visible && hasActiveMask(layer) ? loadImage(layer.mask!.data) : Promise.resolve(null)))),
  ]);

  // Draw each visible layer from bottom to top
  let i = 0;
  while (i < layers.length) {
    const layer = layers[i];

    if (!layer.visible) {
      i++;
      continue;
    }

    // --- Adjustment layers ---
    if (layer.type === 'adjustment' && layer.adjustmentValues) {
      const beforeImageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const beforeCanvas = createOffscreenCanvas(canvasWidth, canvasHeight);
      beforeCanvas.ctx.putImageData(beforeImageData, 0, 0);

      const afterCanvas = applyAdjustmentsToCanvas(beforeCanvas.canvas, {
        exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
        gamma: 1, temperature: 0, tint: 0, saturation: 0, vibrance: 0, hue: 0,
        clarity: 0, levels: null, curves: null,
        ...layer.adjustmentValues,
      } as AdjustmentValues);

      const adjOpacity = layer.opacity / 100;
      const maskImg = maskImages[i];
      const hasMask = !!maskImg;
      const needsBlend = adjOpacity < 1 || layer.blendMode !== 'normal' || hasMask;

      if (!needsBlend) {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(afterCanvas, 0, 0);
      } else {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(beforeCanvas.canvas, 0, 0);

        if (hasMask) {
          // The adjusted pixels, kept only where the (luminance) mask is white
          const { canvas: maskCanvas, ctx: maskCtx } = createOffscreenCanvas(canvasWidth, canvasHeight);
          maskCtx.drawImage(afterCanvas, 0, 0);
          maskCanvasInPlace(maskCanvas, maskImg, canvasWidth, canvasHeight);

          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          ctx.drawImage(beforeCanvas.canvas, 0, 0);

          if (isCustomBlendMode(layer.blendMode)) {
            const currentData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
            const curCanvas = createOffscreenCanvas(canvasWidth, canvasHeight);
            curCanvas.ctx.putImageData(currentData, 0, 0);
            const blended = applyCustomBlendMode(curCanvas.canvas, maskCanvas, layer.blendMode, adjOpacity * 100);
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            ctx.drawImage(blended, 0, 0);
          } else {
            ctx.globalAlpha = adjOpacity;
            ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
            ctx.drawImage(maskCanvas, 0, 0);
            ctx.globalAlpha = 1;
          }
          ctx.globalCompositeOperation = 'source-over';
        } else {
          // No mask: pixel-level interpolation between before and after
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          ctx.drawImage(beforeCanvas.canvas, 0, 0);

          const bCtx = beforeCanvas.canvas.getContext('2d', { willReadFrequently: true });
          const aCtx = afterCanvas.getContext('2d', { willReadFrequently: true });
          if (bCtx && aCtx) {
            const beforeData = bCtx.getImageData(0, 0, canvasWidth, canvasHeight);
            const afterData = aCtx.getImageData(0, 0, canvasWidth, canvasHeight);
            const resultData = ctx.createImageData(canvasWidth, canvasHeight);

            for (let p = 0; p < beforeData.data.length; p += 4) {
              resultData.data[p] = beforeData.data[p] + (afterData.data[p] - beforeData.data[p]) * adjOpacity;
              resultData.data[p + 1] = beforeData.data[p + 1] + (afterData.data[p + 1] - beforeData.data[p + 1]) * adjOpacity;
              resultData.data[p + 2] = beforeData.data[p + 2] + (afterData.data[p + 2] - beforeData.data[p + 2]) * adjOpacity;
              resultData.data[p + 3] = afterData.data[p + 3];
            }

            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            ctx.putImageData(resultData, 0, 0);
          }
        }
      }
      i++;
      continue;
    }

    // --- Clipping groups ---
    const clippingLayers: { layer: Layer; index: number }[] = [];
    let j = i + 1;
    while (j < layers.length && layers[j].clippingMask) {
      if (layers[j].visible) {
        clippingLayers.push({ layer: layers[j], index: j });
      }
      j++;
    }

    if (clippingLayers.length > 0) {
      const baseCanvas = renderLayerToCanvas(layer, images[i], maskImages[i], canvasWidth, canvasHeight);
      if (baseCanvas) {
        let groupCanvas = baseCanvas;
        for (const clip of clippingLayers) {
          const clipLayerCanvas = renderLayerToCanvas(clip.layer, images[clip.index], maskImages[clip.index], canvasWidth, canvasHeight);
          if (clipLayerCanvas) {
            if (clip.layer.opacity < 100) {
              const { canvas: opacityCanvas, ctx: opacityCtx } = createOffscreenCanvas(canvasWidth, canvasHeight);
              opacityCtx.globalAlpha = clip.layer.opacity / 100;
              opacityCtx.drawImage(clipLayerCanvas, 0, 0);
              groupCanvas = applyClippingMask(opacityCanvas, groupCanvas);
            } else {
              groupCanvas = applyClippingMask(clipLayerCanvas, groupCanvas);
            }
          }
        }

        // Draw composited clipping group to main canvas
        if (isCustomBlendMode(layer.blendMode)) {
          const currentData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
          const currentCanvas = createOffscreenCanvas(canvasWidth, canvasHeight);
          currentCanvas.ctx.putImageData(currentData, 0, 0);
          const blended = applyCustomBlendMode(currentCanvas.canvas, groupCanvas, layer.blendMode, layer.opacity);
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          ctx.drawImage(blended, 0, 0);
        } else {
          ctx.globalAlpha = layer.opacity / 100;
          ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
          ctx.drawImage(groupCanvas, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      i = j;
    } else {
      // --- Regular layer ---
      const layerTmp = renderLayerToCanvas(layer, images[i], maskImages[i], canvasWidth, canvasHeight);
      if (layerTmp) {
        if (isCustomBlendMode(layer.blendMode)) {
          const currentData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
          const currentCanvas = createOffscreenCanvas(canvasWidth, canvasHeight);
          currentCanvas.ctx.putImageData(currentData, 0, 0);
          const blended = applyCustomBlendMode(currentCanvas.canvas, layerTmp, layer.blendMode, layer.opacity);
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          ctx.drawImage(blended, 0, 0);
        } else {
          ctx.globalAlpha = layer.opacity / 100;
          ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
          ctx.drawImage(layerTmp, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      i++;
    }
  }

  return canvas;
}

/**
 * Flatten all visible layers into a Blob suitable for upload.
 */
export async function flattenLayersToBlob(
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  format: 'image/png' | 'image/jpeg' = 'image/png',
  quality?: number,
): Promise<Blob> {
  const canvas = await compositeLayers(layers, canvasWidth, canvasHeight);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob from composited canvas'));
      },
      format,
      quality,
    );
  });
}
