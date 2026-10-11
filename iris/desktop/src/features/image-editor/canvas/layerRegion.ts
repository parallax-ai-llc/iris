/**
 * Geometry rules shared by every pixel edit that targets a layer.
 *
 * A layer's pixels live in its own coordinate space: pixel (0, 0) of
 * `imageData` sits at document position (layer.x, layer.y). Document-space
 * inputs (brush strokes, paths, selection masks, layer masks painted on the
 * canvas) must be translated into that space exactly once.
 *
 * An empty raster layer (`imageData === ''`) has no pixels yet: edits treat it
 * as a transparent layer the size of the document at (0, 0).
 */

import type { Layer } from '@/features/image-editor/stores/imageEditor.store';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Raster layers (incl. text layers) hold pixels; groups, adjustment and fill layers do not. */
export function isPaintableLayer(layer: Pick<Layer, 'type'> | null | undefined): boolean {
  return !!layer && (!layer.type || layer.type === 'raster');
}

/** Document rectangle the layer's pixels cover (an empty layer covers the document). */
export function layerRect(
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'imageData'>,
  docWidth: number,
  docHeight: number,
): Rect {
  if (!layer.imageData) return { x: 0, y: 0, width: docWidth, height: docHeight };
  return {
    x: layer.x ?? 0,
    y: layer.y ?? 0,
    width: layer.width || docWidth,
    height: layer.height || docHeight,
  };
}

/** Smallest rectangle containing both. */
export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Surface for editing a layer with document-space input: covers the layer and
 * the document, so neither the layer's off-canvas pixels nor new pixels drawn
 * anywhere on the canvas are lost.
 */
export function editSurfaceRect(
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'imageData'>,
  docWidth: number,
  docHeight: number,
): Rect {
  return unionRect(layerRect(layer, docWidth, docHeight), { x: 0, y: 0, width: docWidth, height: docHeight });
}

/**
 * Cut the part of a document-space mask (one byte per pixel, `docWidth` wide)
 * that lies under `rect`. Pixels of `rect` outside the document are 0
 * (not selected).
 */
export function cropMaskToRect(
  mask: Uint8ClampedArray,
  docWidth: number,
  docHeight: number,
  rect: Rect,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.width * rect.height);
  for (let row = 0; row < rect.height; row++) {
    const docY = rect.y + row;
    if (docY < 0 || docY >= docHeight) continue;
    for (let col = 0; col < rect.width; col++) {
      const docX = rect.x + col;
      if (docX < 0 || docX >= docWidth) continue;
      out[row * rect.width + col] = mask[docY * docWidth + docX];
    }
  }
  return out;
}

/**
 * Where a layer mask image goes on a document-size canvas. Masks painted on
 * the canvas (mask tool) are document-sized and sit at (0, 0); masks that come
 * with the layer (PSD import, same size as the layer) sit at the layer offset,
 * the rule PSD export writes (`psd/exportPsd.ts`).
 */
export function layerMaskRect(
  maskWidth: number,
  maskHeight: number,
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height'>,
  docWidth: number,
  docHeight: number,
): Rect {
  const isDocSized = maskWidth === docWidth && maskHeight === docHeight;
  const isLayerSized = maskWidth === layer.width && maskHeight === layer.height;
  if (isLayerSized && !isDocSized) {
    return { x: layer.x ?? 0, y: layer.y ?? 0, width: layer.width, height: layer.height };
  }
  return { x: 0, y: 0, width: docWidth, height: docHeight };
}

/**
 * A layer is drawn only if it and every group above it (parentId chain) are
 * visible. Hiding a group hides its children, as in PSD export, where the
 * children are nested under the hidden group.
 */
export function isEffectivelyVisible(layer: Layer, byId: Map<string, Layer>): boolean {
  if (!layer.visible) return false;
  const seen = new Set<string>([layer.id]);
  let parentId = layer.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (!parent.visible) return false;
    parentId = parent.parentId;
  }
  return true;
}
