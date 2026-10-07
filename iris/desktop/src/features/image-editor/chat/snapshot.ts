/**
 * Editor state snapshot for the assistant.
 *
 * Read from the active image editor tab at send time and rendered into the
 * system prompt by `buildSystemPrompt`.
 */

import { getActiveStoreSafe } from '@/features/image-editor/stores/imageEditorRegistry';
import type { EditorStateSnapshot, LayerSnapshot } from './systemPrompt';

const EMPTY_ADJUSTMENTS = {
  brightness: 0, contrast: 0, saturation: 0, hue: 0, exposure: 0, gamma: 1,
  temperature: 0, tint: 0, highlights: 0, shadows: 0, clarity: 0, vibrance: 0,
};

export function buildEditorSnapshot(): EditorStateSnapshot {
  const store = getActiveStoreSafe();
  if (!store) {
    return {
      canvasWidth: 0,
      canvasHeight: 0,
      layers: [],
      activeLayerId: null,
      editMode: 'none',
      activeTool: 'brush',
      sourceAssetId: null,
      sourceAssetName: null,
      zoom: 100,
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
      adjustments: { ...EMPTY_ADJUSTMENTS },
      activeFilterPreset: 'none',
    };
  }

  const s = store.getState();
  const layers: LayerSnapshot[] = s.layers.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    opacity: l.opacity,
    blendMode: l.blendMode,
    width: l.width,
    height: l.height,
    type: l.type,
  }));

  // Canvas size from first layer or sourceAsset metadata
  const meta = s.sourceAsset?.metadata as { width?: number; height?: number } | undefined;
  const canvasWidth = s.layers[0]?.width || meta?.width || 0;
  const canvasHeight = s.layers[0]?.height || meta?.height || 0;

  const a = s.adjustments;
  return {
    canvasWidth,
    canvasHeight,
    layers,
    activeLayerId: s.activeLayerId,
    editMode: s.editMode,
    activeTool: s.activeTool,
    sourceAssetId: s.sourceAsset?.id || null,
    sourceAssetName: s.sourceAsset?.name || null,
    zoom: s.zoom,
    rotation: s.rotation,
    flipHorizontal: s.flipHorizontal,
    flipVertical: s.flipVertical,
    adjustments: {
      brightness: a.brightness,
      contrast: a.contrast,
      saturation: a.saturation,
      hue: a.hue,
      exposure: a.exposure,
      gamma: a.gamma,
      temperature: a.temperature,
      tint: a.tint,
      highlights: a.highlights,
      shadows: a.shadows,
      clarity: a.clarity,
      vibrance: a.vibrance,
    },
    activeFilterPreset: s.activeFilterPreset,
  };
}
