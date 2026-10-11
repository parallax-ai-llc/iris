/**
 * Layer kinds created outside the plain layer-structure actions: adjustment
 * layers, fill layers and text layers.
 *
 * Split out of `imageEditor.store.ts` (over the 1,000-line limit). Like the
 * layer-structure slice, every action that adds a layer records exactly one
 * history entry, so one undo removes it and the dirty flag (derived from the
 * history position) follows.
 *
 * Text layers are ordinary raster layers carrying `text` (content + style).
 * The text tool (TextOverlay) re-opens such a layer for editing; the request
 * from outside the canvas (Layers panel double-click) goes through
 * `requestTextEdit`, which the overlay consumes.
 */

import type { StoreApi } from 'zustand';
import { generateId } from '@/shared/lib/utils/id';
import { renderTextToCanvas } from '@/features/image-editor/canvas/canvasEngine';
import type { AdjustmentValues, ImageEditorActions, ImageEditorState, Layer } from '../imageEditor.store';
import { pushLayerStructureHistory } from './history.slice';

type Full = ImageEditorState & ImageEditorActions;
type SetState = StoreApi<Full>['setState'];
type GetState = StoreApi<Full>['getState'];

export type LayerCreateSliceActions = Pick<
  ImageEditorActions,
  'addAdjustmentLayer' | 'addFillLayer' | 'addTextLayer' | 'requestTextEdit' | 'clearTextEditRequest'
>;

const ADJUSTMENT_NAMES: Record<string, string> = {
  'brightness-contrast': 'Brightness/Contrast',
  'hue-saturation': 'Hue/Saturation',
  'levels': 'Levels',
  'curves': 'Curves',
  'exposure': 'Exposure',
  'color-balance': 'Color Balance',
};

export interface LayerCreateDeps {
  defaultAdjustments: AdjustmentValues;
}

export function createLayerCreateSlice(set: SetState, get: GetState, deps: LayerCreateDeps): LayerCreateSliceActions {
  return {
    addAdjustmentLayer: (adjustmentType, values = {}) => {
      const id = generateId();
      const adjLayer: Layer = {
        id,
        name: ADJUSTMENT_NAMES[adjustmentType] ?? adjustmentType,
        visible: true,
        locked: false,
        opacity: 100,
        blendMode: 'normal',
        imageData: '',
        x: 0, y: 0, width: 0, height: 0,
        type: 'adjustment',
        adjustmentType,
        adjustmentValues: { ...deps.defaultAdjustments, ...values },
      };
      set((state) => ({
        layers: [...state.layers, adjLayer],
        activeLayerId: id,
      }));
      pushLayerStructureHistory(get, 'Adjustment Layer');
      return id;
    },

    addFillLayer: (fillType, options = {}) => {
      const { layers } = get();
      const newLayer: Layer = {
        id: generateId(),
        name: `${fillType.charAt(0).toUpperCase() + fillType.slice(1)} Fill`,
        visible: true,
        locked: false,
        opacity: 100,
        fillOpacity: 100,
        blendMode: 'normal',
        imageData: '',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        type: 'fill',
        fillType,
        fillColor: fillType === 'solid' ? (options.fillColor ?? '#ffffff') : undefined,
        fillGradient: fillType === 'gradient' ? (options.fillGradient ?? { colors: ['#000000', '#ffffff'], angle: 0, type: 'linear' }) : undefined,
        fillPattern: fillType === 'pattern' ? (options.fillPattern ?? { url: '', scale: 100 }) : undefined,
        ...options,
      };
      set({ layers: [newLayer, ...layers], activeLayerId: newLayer.id });
      pushLayerStructureHistory(get, 'Fill Layer');
    },

    addTextLayer: (text, x, y) => {
      const settings = { ...get().textSettings };
      const content = text.trim() ? text : 'Text';
      const { canvas } = renderTextToCanvas(content, settings);
      const imageData = canvas.toDataURL();
      const id = generateId();
      const layer: Layer = {
        id,
        name: 'Text',
        visible: true,
        locked: false,
        opacity: 100,
        fillOpacity: 100,
        blendMode: 'normal',
        imageData,
        x,
        y,
        width: canvas.width,
        height: canvas.height,
        text: { content, settings },
      };
      set((state) => ({
        layers: [...state.layers, layer],
        activeLayerId: id,
        activeTextLayerId: id,
      }));
      // Same label as the text tool's commit (one 'Text' step per text layer).
      get().pushHistory('Text', imageData);
      return id;
    },

    requestTextEdit: (layerId) => {
      const layer = get().layers.find((l) => l.id === layerId);
      if (!layer?.text) return false;
      set({ activeLayerId: layerId, textEditRequest: layerId });
      if (get().editMode !== 'text') get().setEditMode('text');
      return true;
    },

    clearTextEditRequest: () => {
      set({ textEditRequest: null });
    },
  };
}
