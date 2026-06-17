/**
 * Layer Compositor
 * Pure layer compositing utility that flattens multiple layers into a single canvas.
 * Extracts the compositing logic from EditorCanvas.renderAllLayers() without UI concerns.
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
function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Render a single raster layer to a temp canvas.
 * Returns null for adjustment layers or layers with no image data.
 */
function renderLayerToCanvas(
  layer: Layer,
  img: HTMLImageElement | null,
  canvasWidth: number,
  canvasHeight: number,
): HTMLCanvasElement | null {
  if (layer.type === 'adjustment' && layer.adjustmentValues) return null;
  if (!img) return null;

  const { canvas: tempCanvas, ctx: tempCtx } = createOffscreenCanvas(canvasWidth, canvasHeight);
  tempCtx.drawImage(img, layer.x, layer.y);
  return tempCanvas;
}

/**
 * Composite all visible layers into a single canvas.
 * Replicates the compositing pipeline from EditorCanvas.renderAllLayers
 * without UI-specific concerns (no active layer filter preview, no channel view).
 */
export async function compositeLayers(
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = createOffscreenCanvas(canvasWidth, canvasHeight);

  if (layers.length === 0) return canvas;

  // Load all layer images
  const images = await Promise.all(layers.map((layer) => loadImage(layer.imageData)));

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
      const hasMask = layer.mask?.enabled && layer.mask?.data;
      const needsBlend = adjOpacity < 1 || layer.blendMode !== 'normal' || hasMask;

      if (!needsBlend) {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(afterCanvas, 0, 0);
      } else {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(beforeCanvas.canvas, 0, 0);

        if (hasMask) {
          const { canvas: maskCanvas, ctx: maskCtx } = createOffscreenCanvas(canvasWidth, canvasHeight);
          maskCtx.drawImage(afterCanvas, 0, 0);

          const maskImg = new Image();
          maskImg.src = layer.mask!.data;
          maskCtx.globalCompositeOperation = 'destination-in';
          maskCtx.drawImage(maskImg, 0, 0);
          maskCtx.globalCompositeOperation = 'source-over';

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
      const baseCanvas = renderLayerToCanvas(layer, images[i], canvasWidth, canvasHeight);
      if (baseCanvas) {
        let groupCanvas = baseCanvas;
        for (const clip of clippingLayers) {
          const clipLayerCanvas = renderLayerToCanvas(clip.layer, images[clip.index], canvasWidth, canvasHeight);
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
      const img = images[i];
      if (img) {
        if (isCustomBlendMode(layer.blendMode)) {
          const { canvas: layerTmp, ctx: layerTmpCtx } = createOffscreenCanvas(canvasWidth, canvasHeight);
          layerTmpCtx.drawImage(img, layer.x, layer.y);

          const currentData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
          const currentCanvas = createOffscreenCanvas(canvasWidth, canvasHeight);
          currentCanvas.ctx.putImageData(currentData, 0, 0);
          const blended = applyCustomBlendMode(currentCanvas.canvas, layerTmp, layer.blendMode, layer.opacity);
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          ctx.drawImage(blended, 0, 0);
        } else {
          ctx.globalAlpha = layer.opacity / 100;
          ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
          ctx.drawImage(img, layer.x, layer.y);
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
