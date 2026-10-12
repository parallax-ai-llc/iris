/**
 * Canvas helpers for pixel edits that target one layer (brush / shape / bucket
 * merge, adjustments, filters, path fill, erase selection).
 *
 * They apply the rules of `layerRegion.ts`: layer pixels are in layer space,
 * document-space input is offset once by the layer position, and an empty
 * raster layer is a transparent document-size layer.
 */

import { maskStrokeCanvas } from './canvasEngine';
import { featherSelection, loadSelectionMask } from './selectionEngine';
import { cropMaskToRect, editSurfaceRect, layerRect, type Rect } from './layerRegion';
import type { Layer, SelectionData } from '@/features/image-editor/stores/imageEditor.store';

type LayerPixels = Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'imageData'>;

export interface LayerCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Document rectangle the canvas covers (becomes the layer's x / y / width / height). */
  rect: Rect;
}

/** Load an image; `crossOrigin` is needed for remote URLs that are read back. */
export function loadImageElement(src: string, crossOrigin?: 'anonymous'): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function blankCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return ctx ? { canvas, ctx } : null;
}

/**
 * The layer's pixels in its own space (adjustments, filters). An empty layer
 * becomes a transparent document-size canvas at (0, 0).
 */
export async function layerOwnCanvas(layer: LayerPixels, docWidth: number, docHeight: number): Promise<LayerCanvas | null> {
  const img = await loadImageElement(layer.imageData);
  const rect = layerRect(layer, docWidth, docHeight);
  if (img) {
    rect.width = img.naturalWidth || img.width || rect.width;
    rect.height = img.naturalHeight || img.height || rect.height;
  }
  const surface = blankCanvas(rect.width, rect.height);
  if (!surface) return null;
  if (img) surface.ctx.drawImage(img, 0, 0);
  return { ...surface, rect };
}

/**
 * A canvas covering the layer and the document with the layer drawn at its
 * position, for edits given in document coordinates (strokes, paths, bucket).
 */
export async function layerEditSurface(layer: LayerPixels, docWidth: number, docHeight: number): Promise<LayerCanvas | null> {
  const img = await loadImageElement(layer.imageData);
  const rect = editSurfaceRect(layer, docWidth, docHeight);
  const surface = blankCanvas(rect.width, rect.height);
  if (!surface) return null;
  if (img) surface.ctx.drawImage(img, (layer.x ?? 0) - rect.x, (layer.y ?? 0) - rect.y);
  return { ...surface, rect };
}

/**
 * The selection as a document-size mask (feather applied).
 *
 * `maskDataUrl` is already the effective selection: `invertSelection()` bakes
 * the inversion into the mask (the selection tools combine with the mask the
 * same way). Inverting again here would select the original area again
 * (E2E basics-image 3b).
 */
export async function documentSelectionMask(
  selection: Pick<SelectionData, 'maskDataUrl'> | null | undefined,
  feather: number,
  docWidth: number,
  docHeight: number,
): Promise<Uint8ClampedArray | null> {
  if (!selection?.maskDataUrl) return null;
  let mask: Uint8ClampedArray;
  try {
    mask = await loadSelectionMask(selection.maskDataUrl, docWidth, docHeight);
  } catch {
    return null; // undecodable mask: treat as no selection
  }
  if (feather > 0) mask = featherSelection(mask, docWidth, docHeight, feather);
  return mask;
}

/** The selection mask cut to a layer rectangle (layer-space mask). */
export async function selectionMaskForRect(
  selection: Pick<SelectionData, 'maskDataUrl'> | null | undefined,
  feather: number,
  docWidth: number,
  docHeight: number,
  rect: Rect,
): Promise<Uint8ClampedArray | null> {
  const mask = await documentSelectionMask(selection, feather, docWidth, docHeight);
  return mask ? cropMaskToRect(mask, docWidth, docHeight, rect) : null;
}

export interface StrokeMergeOptions {
  /** Document-size stroke / shape / fill pixels. */
  stroke: HTMLCanvasElement;
  docWidth: number;
  docHeight: number;
  /** Eraser tools remove pixels (destination-out). */
  erase: boolean;
  alpha: number;
  /** Document-size selection mask, if a selection limits the edit. */
  selectionMask: Uint8ClampedArray | null;
}

/** The layer with a document-space stroke merged in, plus the rect it now covers. */
export async function mergeStrokeIntoLayer(
  layer: LayerPixels,
  options: StrokeMergeOptions,
): Promise<{ imageData: string; rect: Rect } | null> {
  const surface = await layerEditSurface(layer, options.docWidth, options.docHeight);
  if (!surface) return null;
  const { ctx, canvas, rect } = surface;
  const stroke = options.selectionMask ? maskStrokeCanvas(options.stroke, options.selectionMask) : options.stroke;
  ctx.globalCompositeOperation = options.erase ? 'destination-out' : 'source-over';
  ctx.globalAlpha = options.alpha;
  // The stroke is in document space; the surface origin is rect.x / rect.y.
  ctx.drawImage(stroke, -rect.x, -rect.y);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return { imageData: canvas.toDataURL(), rect };
}

/**
 * Runs async tasks one after another. Pixel merges read the layer when they
 * start, so a fast second stroke sees the first stroke's pixels.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task, task);
      tail = next.catch(() => undefined);
      return next;
    },
  };
}
