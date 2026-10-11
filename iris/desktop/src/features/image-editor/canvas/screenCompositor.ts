/**
 * Composites the layer stack onto the editor's screen canvas.
 *
 * Moved out of `EditorCanvas.renderAllLayers` (over the 1,000-line limit).
 * Same visual rules as the saved document (`psd/exportPsd.ts`):
 *  - a layer inside a hidden group is hidden (parentId chain)
 *  - an enabled raster layer mask hides pixels (white = visible, R channel);
 *    the mask is placed by `layerMaskRect` (document-size masks at 0,0,
 *    layer-size masks at the layer offset)
 *  - enabled layer effects (drop shadow, glow, stroke ...) are drawn
 * plus the editor-only live preview: the CSS filter of pending adjustments on
 * the active layer.
 *
 * Images are all loaded before the canvas is cleared, so a re-render never
 * blinks.
 */

import type { AdjustmentValues, Layer } from '@/features/image-editor/stores/imageEditor.store';
import { applyAdjustmentsToCanvas, applyCustomBlendMode, createOffscreenCanvas, isCustomBlendMode } from './canvasEngine';
import { applyClippingMask, applyLayerEffects } from './layerEffects';
import { isEffectivelyVisible, layerMaskRect } from './layerRegion';

export interface ScreenCompositeOptions {
  activeLayerId: string | null;
  /** CSS filter previewing pending adjustments on the active layer ('none' = off). */
  activeLayerFilter: string;
  /** Image loader (EditorCanvas passes its decoded-image cache). */
  loadImage: (src: string) => Promise<HTMLImageElement | null>;
}

const NEUTRAL_ADJUSTMENTS = {
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
  gamma: 1, temperature: 0, tint: 0, saturation: 0, vibrance: 0, hue: 0,
  clarity: 0, levels: null, curves: null,
};

function hasEnabledMask(layer: Layer): boolean {
  return !!(layer.mask?.enabled && layer.mask.data);
}

function hasEnabledEffects(layer: Layer): boolean {
  return !!layer.effects?.some((e) => e.enabled);
}

/** Multiply the layer-space canvas alpha by a mask (R channel), placed by `layerMaskRect`. */
function maskLayerCanvas(source: HTMLCanvasElement, layer: Layer, maskImg: HTMLImageElement, docW: number, docH: number) {
  const { width, height } = source;
  const rect = layerMaskRect(
    maskImg.naturalWidth || maskImg.width,
    maskImg.naturalHeight || maskImg.height,
    { x: layer.x, y: layer.y, width: layer.width || width, height: layer.height || height },
    docW,
    docH,
  );
  const { ctx: maskCtx } = createOffscreenCanvas(width, height);
  // Outside the mask image nothing is hidden (PSD default colour 255).
  maskCtx.fillStyle = '#ffffff';
  maskCtx.fillRect(0, 0, width, height);
  maskCtx.drawImage(maskImg, rect.x - (layer.x ?? 0), rect.y - (layer.y ?? 0), rect.width, rect.height);

  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const pixels = ctx.getImageData(0, 0, width, height);
  const mask = maskCtx.getImageData(0, 0, width, height).data;
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i + 3] = Math.round((pixels.data[i + 3] * mask[i]) / 255);
  }
  ctx.putImageData(pixels, 0, 0);
}

export async function compositeScreenLayers(
  canvas: HTMLCanvasElement,
  layers: Layer[],
  options: ScreenCompositeOptions,
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const { activeLayerId, activeLayerFilter } = options;

  if (layers.length === 0) {
    ctx.clearRect(0, 0, W, H);
    return;
  }

  // Load everything FIRST (before clearing, to prevent blink)
  const [images, maskImages] = await Promise.all([
    Promise.all(layers.map((l) => (l.imageData ? options.loadImage(l.imageData) : Promise.resolve(null)))),
    Promise.all(layers.map((l) => (hasEnabledMask(l) ? options.loadImage(l.mask!.data) : Promise.resolve(null)))),
  ]);

  const byId = new Map(layers.map((l) => [l.id, l]));
  const visible = (layer: Layer) => isEffectivelyVisible(layer, byId);
  const previewFilter = (layer: Layer) => (layer.id === activeLayerId && activeLayerFilter !== 'none' ? activeLayerFilter : 'none');

  ctx.clearRect(0, 0, W, H);

  /** One layer on a transparent document-size canvas: mask, effects and filter preview applied. */
  const renderLayerToCanvas = (layer: Layer, index: number): HTMLCanvasElement | null => {
    if (layer.type === 'adjustment' || layer.type === 'group') return null;
    const img = images[index];
    if (!img) return null;

    let content: CanvasImageSource = img;
    let padX = 0;
    let padY = 0;
    const maskImg = maskImages[index];
    if (maskImg || hasEnabledEffects(layer)) {
      // Layer-space pass: mask, then effects (which may grow the canvas symmetrically).
      const { canvas: own, ctx: ownCtx } = createOffscreenCanvas(img.width, img.height);
      ownCtx.drawImage(img, 0, 0);
      if (maskImg) maskLayerCanvas(own, layer, maskImg, W, H);
      const withEffects = hasEnabledEffects(layer) ? applyLayerEffects(own, layer.effects!) : own;
      padX = (withEffects.width - own.width) / 2;
      padY = (withEffects.height - own.height) / 2;
      content = withEffects;
    }

    const { canvas: tempCanvas, ctx: tempCtx } = createOffscreenCanvas(W, H);
    tempCtx.filter = previewFilter(layer);
    tempCtx.drawImage(content, (layer.x ?? 0) - padX, (layer.y ?? 0) - padY);
    tempCtx.filter = 'none';
    return tempCanvas;
  };

  /** Draw a document-size canvas onto the screen with the layer's opacity / blend mode. */
  const drawWithBlend = (layer: Layer, source: HTMLCanvasElement) => {
    if (isCustomBlendMode(layer.blendMode)) {
      const currentData = ctx.getImageData(0, 0, W, H);
      const { canvas: currentCanvas, ctx: currentCtx } = createOffscreenCanvas(W, H);
      currentCtx.putImageData(currentData, 0, 0);
      const blended = applyCustomBlendMode(currentCanvas, source, layer.blendMode, layer.opacity);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(blended, 0, 0);
    } else {
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
      ctx.drawImage(source, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  /** Adjustment layer: adjust what is below, blended by opacity / blend mode / mask. */
  const applyAdjustmentLayer = (layer: Layer, maskImg: HTMLImageElement | null) => {
    const beforeImageData = ctx.getImageData(0, 0, W, H);
    const { canvas: beforeCanvas, ctx: beforeCtx } = createOffscreenCanvas(W, H);
    beforeCtx.putImageData(beforeImageData, 0, 0);
    const afterCanvas = applyAdjustmentsToCanvas(beforeCanvas, {
      ...NEUTRAL_ADJUSTMENTS,
      ...layer.adjustmentValues,
    } as AdjustmentValues);

    const adjOpacity = layer.opacity / 100;
    const needsBlend = adjOpacity < 1 || layer.blendMode !== 'normal' || !!maskImg;
    ctx.clearRect(0, 0, W, H);
    if (!needsBlend) {
      ctx.drawImage(afterCanvas, 0, 0);
      return;
    }
    ctx.drawImage(beforeCanvas, 0, 0);

    if (maskImg) {
      // Keep the adjusted result only where the mask allows it
      const { canvas: maskCanvas, ctx: maskCtx } = createOffscreenCanvas(W, H);
      maskCtx.drawImage(afterCanvas, 0, 0);
      maskCtx.globalCompositeOperation = 'destination-in';
      maskCtx.drawImage(maskImg, 0, 0);
      maskCtx.globalCompositeOperation = 'source-over';
      drawWithBlend({ ...layer, opacity: adjOpacity * 100 }, maskCanvas);
      return;
    }

    // No mask: pixel-level interpolation between before and after
    const afterCtx = afterCanvas.getContext('2d');
    if (!afterCtx) return;
    const beforeData = beforeCtx.getImageData(0, 0, W, H);
    const afterData = afterCtx.getImageData(0, 0, W, H);
    const resultData = ctx.createImageData(W, H);
    for (let p = 0; p < beforeData.data.length; p += 4) {
      resultData.data[p] = beforeData.data[p] + (afterData.data[p] - beforeData.data[p]) * adjOpacity;
      resultData.data[p + 1] = beforeData.data[p + 1] + (afterData.data[p + 1] - beforeData.data[p + 1]) * adjOpacity;
      resultData.data[p + 2] = beforeData.data[p + 2] + (afterData.data[p + 2] - beforeData.data[p + 2]) * adjOpacity;
      resultData.data[p + 3] = afterData.data[p + 3]; // preserve alpha
    }
    ctx.clearRect(0, 0, W, H);
    ctx.putImageData(resultData, 0, 0);
  };

  // Draw each visible layer from bottom to top (Photoshop-style clipping groups)
  let i = 0;
  while (i < layers.length) {
    const layer = layers[i];

    if (!visible(layer)) {
      i++;
      continue;
    }

    if (layer.type === 'adjustment' && layer.adjustmentValues) {
      applyAdjustmentLayer(layer, maskImages[i]);
      i++;
      continue;
    }

    // A clipping group: this layer as base + following clippingMask layers
    const clippingLayers: { layer: Layer; index: number }[] = [];
    let j = i + 1;
    while (j < layers.length && layers[j].clippingMask) {
      if (visible(layers[j])) clippingLayers.push({ layer: layers[j], index: j });
      j++;
    }

    if (clippingLayers.length > 0) {
      const baseCanvas = renderLayerToCanvas(layer, i);
      if (baseCanvas) {
        let groupCanvas = baseCanvas;
        for (const clip of clippingLayers) {
          const clipLayerCanvas = renderLayerToCanvas(clip.layer, clip.index);
          if (!clipLayerCanvas) continue;
          if (clip.layer.opacity < 100) {
            const { canvas: opacityCanvas, ctx: opacityCtx } = createOffscreenCanvas(W, H);
            opacityCtx.globalAlpha = clip.layer.opacity / 100;
            opacityCtx.drawImage(clipLayerCanvas, 0, 0);
            groupCanvas = applyClippingMask(opacityCanvas, groupCanvas);
          } else {
            groupCanvas = applyClippingMask(clipLayerCanvas, groupCanvas);
          }
        }
        drawWithBlend(layer, groupCanvas);
      }
      i = j;
      continue;
    }

    // Regular layer
    const img = images[i];
    if (img && layer.type !== 'group') {
      const simple = !maskImages[i] && !hasEnabledEffects(layer) && !isCustomBlendMode(layer.blendMode);
      if (simple) {
        ctx.globalAlpha = layer.opacity / 100;
        ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
        ctx.filter = previewFilter(layer);
        ctx.drawImage(img, layer.x ?? 0, layer.y ?? 0);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        const layerCanvas = renderLayerToCanvas(layer, i);
        if (layerCanvas) drawWithBlend(layer, layerCanvas);
      }
    }
    i++;
  }
}
