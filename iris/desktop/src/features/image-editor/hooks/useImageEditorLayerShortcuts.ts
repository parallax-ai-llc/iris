/**
 * Photoshop-style layer shortcuts for the image editor (Ctrl+J, Ctrl+E,
 * Ctrl+[ / ], Alt+[ / ], Ctrl+G …). Keys live in IMAGE_EDITOR_KEYMAP; this
 * hook supplies the handlers and registers them in the `editor` scope of the
 * central dispatcher. Mounted by ImageEditorPage.
 */

import { useKeymapLayer, type ShortcutHandler } from '@/shared/lib/shortcuts';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  IMAGE_EDITOR_KEYMAP,
  type ImageEditorLayerCommand,
} from '@/features/image-editor/lib/shortcuts/imageEditorKeymap';

const getState = () => useImageEditorStore.getState();

const withActiveIndex = (fn: (index: number) => void) => () => {
  const { layers, activeLayerId } = getState();
  if (!activeLayerId) return;
  const index = layers.findIndex((l) => l.id === activeLayerId);
  if (index === -1) return;
  fn(index);
};

// Transparent 1x1 placeholder; addLayer expects imageData.
const EMPTY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAgAAetx+wcAAAAASUVORK5CYII=';

export const IMAGE_EDITOR_LAYER_HANDLERS: Record<ImageEditorLayerCommand, ShortcutHandler> = {
  duplicateLayer: () => {
    const { activeLayerId, duplicateLayer } = getState();
    if (activeLayerId) duplicateLayer(activeLayerId);
  },
  mergeLayerDown: () => {
    const { activeLayerId, mergeLayerDown } = getState();
    if (activeLayerId) mergeLayerDown(activeLayerId);
  },
  newLayer: () => {
    const { addLayer, layers } = getState();
    addLayer(EMPTY_PNG, `Layer ${layers.length + 1}`);
  },
  flattenLayers: () => {
    getState().flattenLayers?.();
  },
  bringLayerForward: withActiveIndex((index) => {
    const { layers, reorderLayers } = getState();
    if (index < layers.length - 1) reorderLayers(index, index + 1);
  }),
  sendLayerBackward: withActiveIndex((index) => {
    if (index > 0) getState().reorderLayers(index, index - 1);
  }),
  bringLayerToFront: withActiveIndex((index) => {
    const { layers, reorderLayers } = getState();
    if (index < layers.length - 1) reorderLayers(index, layers.length - 1);
  }),
  sendLayerToBack: withActiveIndex((index) => {
    if (index > 0) getState().reorderLayers(index, 0);
  }),
  selectLayerAbove: withActiveIndex((index) => {
    const { layers, setActiveLayer } = getState();
    if (index < layers.length - 1) setActiveLayer(layers[index + 1].id);
  }),
  selectLayerBelow: withActiveIndex((index) => {
    const { layers, setActiveLayer } = getState();
    if (index > 0) setActiveLayer(layers[index - 1].id);
  }),
  groupLayers: () => {
    getState().createLayerGroup?.();
  },
  // Ungroup the active layer's parent group, or the active layer itself if it is a group.
  ungroupLayers: () => {
    const { layers, activeLayerId, ungroupLayers } = getState();
    if (!activeLayerId) return;
    const active = layers.find((l) => l.id === activeLayerId);
    if (!active) return;
    const targetId = active.type === 'group' ? active.id : active.parentId ?? null;
    if (targetId) ungroupLayers(targetId);
  },
};

export function useImageEditorLayerShortcuts(): void {
  useKeymapLayer('editor', IMAGE_EDITOR_KEYMAP, IMAGE_EDITOR_LAYER_HANDLERS);
}

export default useImageEditorLayerShortcuts;
