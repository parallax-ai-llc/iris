/**
 * Helpers of the text tool: which text layer a click hits, and whether a
 * re-edit actually changed anything.
 *
 * A text layer is a raster layer that carries `text` (content + style).
 * Layers without it (plain raster, or text layers from documents made before
 * the data was stored) are treated as pixels: clicking them starts new text.
 */

import type { Layer, LayerTextData, TextLayer, TextSettings } from '@/features/image-editor/stores/imageEditor.store';

/** Topmost visible, unlocked text layer whose bounds contain the image point. */
export function findTextLayerAt(layers: Layer[], x: number, y: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.text || !layer.visible || layer.locked) continue;
    if (x >= layer.x && x <= layer.x + layer.width && y >= layer.y && y <= layer.y + layer.height) {
      return layer;
    }
  }
  return null;
}

/** Compares the style keys the layer recorded (the tool may carry extra ones). */
function sameSettings(before: TextSettings, now: TextSettings): boolean {
  for (const key of Object.keys(before) as (keyof TextSettings)[]) {
    if (before[key] !== now[key]) return false;
  }
  return true;
}

/** True when the edited text equals what the layer had (no history entry needed). */
export function isSameText(before: LayerTextData, content: string, settings: TextSettings): boolean {
  return before.content === content && sameSettings(before.settings, settings);
}

/**
 * Text layers for PSD export: each layer's own text data, plus the store's
 * legacy `textLayers` entries (older PSD imports) for layers without it.
 */
export function textLayersForExport(layers: Layer[], legacy: TextLayer[] = []): TextLayer[] {
  const fromLayers = layers
    .filter((l): l is Layer & { text: LayerTextData } => !!l.text)
    .map((l) => ({ id: l.id, text: l.text.content, x: l.x, y: l.y, settings: { ...l.text.settings } }));
  const covered = new Set(fromLayers.map((t) => t.id));
  return [...fromLayers, ...legacy.filter((t) => !covered.has(t.id))];
}
