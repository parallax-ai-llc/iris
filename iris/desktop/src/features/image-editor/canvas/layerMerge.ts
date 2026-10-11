/**
 * Layer merging (Merge Down, Flatten Image, Stamp Visible).
 *
 * All three bake layers through the same compositor (`compositeLayers`) that
 * export and the AI tools use, so blend mode, opacity, visibility, clipping
 * and adjustment layers are applied the same way everywhere.
 *
 * Merge Down follows Photoshop: the upper layer is composited onto the lower
 * layer's own pixels with the upper's blend mode and opacity, and the result
 * keeps the lower layer's identity and properties (name, opacity, blend mode,
 * visibility, mask). A hidden upper layer contributes nothing.
 */

import type { Layer } from '@/features/image-editor/stores/imageEditor.store';
import { compositeLayers } from './layerCompositor';

/** Layer types whose pixels can receive a merge. */
function isPixelLayer(layer: Layer): boolean {
  return layer.type === undefined || layer.type === 'raster';
}

/** Can the layer at `index` be merged into the layer below it? */
export function canMergeDown(layers: Layer[], index: number): boolean {
  if (index <= 0 || index >= layers.length) return false;
  const upper = layers[index];
  const lower = layers[index - 1];
  return upper.type !== 'group' && isPixelLayer(lower) && !lower.locked;
}

/**
 * The two-layer stack composited for Merge Down: the lower layer as a plain,
 * fully opaque base (its own opacity / blend mode / mask stay on the merged
 * layer) and the upper layer as it is.
 */
export function mergeDownStack(lower: Layer, upper: Layer): Layer[] {
  const base: Layer = {
    ...lower,
    visible: true,
    opacity: 100,
    fillOpacity: 100,
    blendMode: 'normal',
    clippingMask: false,
    mask: undefined,
    effects: undefined,
    blendIf: undefined,
  };
  // A clipped upper layer clips to the base; anything else draws normally.
  return [base, { ...upper }];
}

/** The merged layer: the lower layer's identity with the composited pixels. */
export function mergedLayer(lower: Layer, imageData: string, width: number, height: number): Layer {
  return {
    ...lower,
    type: 'raster',
    imageData,
    x: 0,
    y: 0,
    width,
    height,
    smartObject: undefined,
    smartFilters: undefined,
    // The merged pixels are no longer the rendering of the text.
    text: undefined,
  };
}

/** Composite the Merge Down stack into a PNG data URL of the document size. */
export async function composeMergeDown(lower: Layer, upper: Layer, width: number, height: number): Promise<string> {
  const canvas = await compositeLayers(mergeDownStack(lower, upper), width, height);
  return canvas.toDataURL('image/png');
}

/** Composite every visible layer (Flatten Image, Stamp Visible). */
export async function composeVisible(layers: Layer[], width: number, height: number): Promise<string> {
  const canvas = await compositeLayers(layers, width, height);
  return canvas.toDataURL('image/png');
}

/** Document size from the store, or the extent of the layers when unknown. */
export function documentSize(layers: Layer[], canvasWidth: number, canvasHeight: number): { width: number; height: number } {
  const width = canvasWidth > 0 ? canvasWidth : Math.max(...layers.map((l) => (l.x ?? 0) + (l.width || 0)), 1);
  const height = canvasHeight > 0 ? canvasHeight : Math.max(...layers.map((l) => (l.y ?? 0) + (l.height || 0)), 1);
  return { width, height };
}
