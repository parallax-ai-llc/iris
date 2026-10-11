/**
 * Layer-structure actions of the image editor store: add, delete, reorder,
 * duplicate, merge down, flatten, stamp visible and groups.
 *
 * Split out of `imageEditor.store.ts`. Every action that changes the layer
 * stack records one history entry (see `pushLayerStructureHistory`), so undo,
 * redo and the dirty flag (derived from the history position) stay in step.
 *
 * Callers that build a bigger edit out of these primitives and push their own
 * entry later (the text tool while typing, a filter that first creates a blank
 * layer, opening a document, Alt-drag duplicate before 'Move Layer') pass
 * `{ history: false }`. An explicit `pushHistory` in the same synchronous block
 * also absorbs the structural entry, so it never shows up twice.
 */

import type { StoreApi } from 'zustand';
import { generateId } from '@/shared/lib/utils/id';
import {
  canMergeDown,
  composeMergeDown,
  composeVisible,
  documentSize,
  mergedLayer,
} from '@/features/image-editor/canvas/layerMerge';
import type { ImageEditorActions, ImageEditorState, Layer } from '../imageEditor.store';
import { pushLayerStructureHistory } from './history.slice';

type Full = ImageEditorState & ImageEditorActions;
type SetState = StoreApi<Full>['setState'];
type GetState = StoreApi<Full>['getState'];

/** Options of the layer-structure actions. */
export interface LayerHistoryOptions {
  /** Record a history entry (default true). */
  history?: boolean;
}

export type LayerStructureSliceActions = Pick<
  ImageEditorActions,
  | 'addLayer'
  | 'addLayerFromUrl'
  | 'removeLayer'
  | 'reorderLayers'
  | 'duplicateLayer'
  | 'mergeLayerDown'
  | 'flattenLayers'
  | 'stampVisible'
  | 'createLayerGroup'
  | 'moveLayerToGroup'
  | 'ungroupLayers'
>;

function newRasterLayer(id: string, name: string, imageData: string, width = 0, height = 0): Layer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    opacity: 100,
    fillOpacity: 100,
    blendMode: 'normal',
    imageData,
    x: 0,
    y: 0,
    width,
    height,
  };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function readAsDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export function createLayerStructureSlice(set: SetState, get: GetState): LayerStructureSliceActions {
  const record = (label: string, options?: LayerHistoryOptions) => {
    if (options?.history !== false) pushLayerStructureHistory(get, label);
  };

  /**
   * The size of a new layer is known only once its image decoded. Patch the
   * live layer and the history snapshots taken before that, so undo / redo
   * never brings back a 0x0 layer.
   */
  const resolveLayerSize = (id: string, imageData: string) => {
    if (!imageData) return;
    void loadImage(imageData).then((img) => {
      if (!img) return;
      const size = { width: img.width, height: img.height };
      get().updateLayer(id, size);
      const fix = (l: Layer) => (l.id === id && !l.width && !l.height ? { ...l, ...size } : l);
      set((state) => ({
        history: state.history.map((entry) =>
          entry.layers?.some((l) => l.id === id && !l.width && !l.height)
            ? { ...entry, layers: entry.layers.map(fix) }
            : entry,
        ),
      }));
    });
  };

  return {
    addLayer: (imageData, name, options) => {
      const { layers } = get();
      const id = generateId();
      set({
        layers: [...layers, newRasterLayer(id, name || `Layer ${layers.length + 1}`, imageData)],
        activeLayerId: id,
      });
      record('Layer Added', options);
      resolveLayerSize(id, imageData);
      return id;
    },

    addLayerFromUrl: async (imageUrl, name) => {
      try {
        const response = await fetch(imageUrl);
        const dataUrl = await readAsDataUrl(await response.blob());
        if (!dataUrl) return null;
        const img = await loadImage(dataUrl);
        if (!img) return null;
        const { layers } = get();
        const id = generateId();
        const layer = newRasterLayer(id, name || `Layer ${layers.length + 1}`, dataUrl, img.width, img.height);
        delete layer.fillOpacity;
        set({ layers: [...layers, layer], activeLayerId: id });
        record('Layer Added');
        return id;
      } catch (error) {
        console.error('Failed to add layer from URL:', error);
        return null;
      }
    },

    removeLayer: (layerId, options) => {
      const { layers, activeLayerId } = get();
      if (!layers.some((l) => l.id === layerId)) return;
      const newLayers = layers.filter((l) => l.id !== layerId);
      set({
        layers: newLayers,
        activeLayerId: activeLayerId === layerId ? (newLayers[0]?.id || null) : activeLayerId,
      });
      record('Layer Deleted', options);
    },

    reorderLayers: (fromIndex, toIndex, options) => {
      const { layers } = get();
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= layers.length || toIndex < 0 || toIndex >= layers.length) return;
      const newLayers = [...layers];
      const [removed] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, removed);
      set({ layers: newLayers });
      record('Layer Order', options);
    },

    duplicateLayer: (layerId, options) => {
      const { layers } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return null;

      const id = generateId();
      const newLayer: Layer = { ...layer, id, name: `${layer.name} (copy)` };
      const index = layers.findIndex((l) => l.id === layerId);
      const newLayers = [...layers];
      newLayers.splice(index + 1, 0, newLayer);

      set({ layers: newLayers, activeLayerId: id });
      record('Layer Duplicated', options);
      return id;
    },

    mergeLayerDown: async (layerId) => {
      const { layers, canvasWidth, canvasHeight } = get();
      const index = layers.findIndex((l) => l.id === layerId);
      if (!canMergeDown(layers, index)) return;

      const upper = layers[index];
      const lower = layers[index - 1];
      const { width, height } = documentSize(layers, canvasWidth, canvasHeight);
      const dataUrl = await composeMergeDown(lower, upper, width, height);

      // The stack may have changed while compositing; merge only if both still exist.
      const current = get().layers;
      if (!current.some((l) => l.id === upper.id) || !current.some((l) => l.id === lower.id)) return;
      const merged = mergedLayer(lower, dataUrl, width, height);
      set({
        layers: current.filter((l) => l.id !== upper.id).map((l) => (l.id === lower.id ? merged : l)),
        activeLayerId: lower.id,
      });
      record('Merge Down');
    },

    flattenLayers: async () => {
      const { layers, canvasWidth, canvasHeight } = get();
      if (layers.length === 0) return;

      const { width, height } = documentSize(layers, canvasWidth, canvasHeight);
      const dataUrl = await composeVisible(layers, width, height);
      const flat = newRasterLayer(generateId(), 'Flattened', dataUrl, width, height);
      delete flat.fillOpacity;

      set({ layers: [flat], activeLayerId: flat.id });
      record('Flatten Image');
    },

    stampVisible: async () => {
      const { layers, canvasWidth, canvasHeight } = get();
      if (layers.length === 0) return;

      const { width, height } = documentSize(layers, canvasWidth, canvasHeight);
      const dataUrl = await composeVisible(layers, width, height);
      const stamp: Layer = { ...newRasterLayer(generateId(), 'Stamped Visible', dataUrl, width, height), type: 'raster' };

      // Photoshop puts the stamp above the active layer.
      set((state) => {
        const activeIndex = state.layers.findIndex((l) => l.id === state.activeLayerId);
        const at = activeIndex === -1 ? state.layers.length : activeIndex + 1;
        const next = [...state.layers];
        next.splice(at, 0, stamp);
        return { layers: next, activeLayerId: stamp.id };
      });
      record('Stamp Visible');
    },

    createLayerGroup: (name = 'Group') => {
      const id = generateId();
      const group: Layer = {
        id,
        name,
        visible: true,
        locked: false,
        opacity: 100,
        blendMode: 'normal',
        imageData: '',
        x: 0, y: 0, width: 0, height: 0,
        type: 'group',
        children: [],
        isExpanded: true,
      };
      set((state) => ({
        layers: [...state.layers, group],
        activeLayerId: id,
      }));
      record('New Group');
      return id;
    },

    moveLayerToGroup: (layerId, groupId) => {
      set((state) => {
        const layers = state.layers.map((l) => {
          // Remove from old parent
          if (l.type === 'group' && l.children?.includes(layerId)) {
            return { ...l, children: l.children.filter((c) => c !== layerId) };
          }
          // Add to new parent
          if (groupId && l.id === groupId && l.type === 'group') {
            return { ...l, children: [...(l.children || []), layerId] };
          }
          return l;
        });
        // Update parentId on the moved layer
        return {
          layers: layers.map((l) =>
            l.id === layerId ? { ...l, parentId: groupId ?? undefined } : l
          ),
        };
      });
      record('Move to Group');
    },

    ungroupLayers: (groupId) => {
      const group = get().layers.find((l) => l.id === groupId);
      if (!group || group.type !== 'group') return;
      set((state) => {
        const layers = state.layers
          .map((l) => (l.parentId === groupId ? { ...l, parentId: undefined } : l))
          .filter((l) => l.id !== groupId);
        return { layers, activeLayerId: state.activeLayerId === groupId ? null : state.activeLayerId };
      });
      record('Ungroup');
    },
  };
}
