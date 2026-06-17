/**
 * Action Executor - Maps ActionStep types to imageEditor.store operations
 * Used by the ActionPlayer to replay recorded actions
 */

import type { ActionStep } from './actionTypes';
import useImageEditorStore from '@/features/image-editor/stores/imageEditor.store';

/**
 * Execute a single action step against the image editor store.
 * This function bridges ActionStep data to actual store method calls.
 */
export async function executeActionStep(step: ActionStep): Promise<void> {
  const store = useImageEditorStore.getState();
  const p = step.params;

  switch (step.type) {
    // === Adjustments ===
    case 'adjust:brightness-contrast':
    case 'adjust:hue-saturation':
    case 'adjust:levels':
    case 'adjust:curves':
    case 'adjust:exposure':
    case 'adjust:color-balance':
      if (p.values && typeof p.values === 'object') {
        store.setAdjustments(p.values as Record<string, number>);
      }
      break;

    case 'adjust:apply':
      if (store._adjustmentsApplyCallback) {
        store._adjustmentsApplyCallback();
      }
      break;

    // === Filters ===
    case 'filter:apply':
      if (typeof p.intensity === 'number') {
        store.setFilterIntensity(p.intensity);
      }
      break;

    // === Transform ===
    case 'transform:rotate':
      if (typeof p.angle === 'number') {
        store.setRotation(p.angle);
      }
      break;

    case 'transform:flip-h':
      store.setFlipHorizontal(!store.flipHorizontal);
      break;

    case 'transform:flip-v':
      store.setFlipVertical(!store.flipVertical);
      break;

    case 'transform:scale':
      if (typeof p.zoom === 'number') {
        store.setZoom(p.zoom);
      }
      break;

    // === Layer operations ===
    case 'layer:add':
      store.addLayer('', typeof p.name === 'string' ? p.name : undefined);
      break;

    case 'layer:delete':
      if (typeof p.layerId === 'string') {
        store.removeLayer(p.layerId);
      }
      break;

    case 'layer:duplicate':
      if (typeof p.layerId === 'string') {
        store.duplicateLayer(p.layerId);
      }
      break;

    case 'layer:merge-down':
      await store.flattenLayers();
      break;

    case 'layer:set-opacity':
      if (typeof p.layerId === 'string' && typeof p.opacity === 'number') {
        store.updateLayer(p.layerId, { opacity: p.opacity });
      }
      break;

    case 'layer:set-blend-mode':
      if (typeof p.layerId === 'string' && typeof p.blendMode === 'string') {
        store.updateLayer(p.layerId, { blendMode: p.blendMode as Parameters<typeof store.updateLayer>[1]['blendMode'] });
      }
      break;

    case 'layer:toggle-visibility':
      if (typeof p.layerId === 'string') {
        const layer = store.layers.find(l => l.id === p.layerId);
        if (layer) {
          store.updateLayer(p.layerId as string, { visible: !layer.visible });
        }
      }
      break;

    // === Selection ===
    case 'selection:invert':
      store.invertSelection();
      break;

    case 'selection:clear':
      store.clearSelection();
      break;

    case 'selection:content-aware-fill':
      await store.contentAwareFill();
      break;

    // === AI operations ===
    case 'ai:upscale':
    case 'ai:bg-remove':
    case 'ai:inpaint':
    case 'ai:face-restore':
    case 'ai:colorize': {
      const modeMap: Record<string, string> = {
        'ai:upscale': 'upscale',
        'ai:bg-remove': 'bgRemove',
        'ai:inpaint': 'inpaint',
        'ai:face-restore': 'faceRestore',
        'ai:colorize': 'colorize',
      };
      store.setEditMode(modeMap[step.type] as Parameters<typeof store.setEditMode>[0]);
      break;
    }

    // === Crop ===
    case 'crop:apply':
      if (store._cropApplyCallback) {
        store._cropApplyCallback();
      }
      break;

    // === Drawing ===
    case 'draw:brush-stroke':
    case 'draw:fill':
      // These are recorded for documentation but can't be exactly replayed
      // (they depend on specific pixel data from the original stroke)
      break;

    default:
      console.warn(`Unknown action step type: ${step.type}`);
  }
}
