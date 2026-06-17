/**
 * Command Executor for Editor Chat
 *
 * Parses <command>{...}</command> blocks from LLM responses
 * and dispatches actions to the image editor store and APIs.
 */

import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import type { AdjustmentValues, AdjustmentLayerType } from '@/features/image-editor/stores/imageEditor.store';
import type { BlendMode } from '@/types/blendMode';
import {
  generateImage,
  removeBackground,
  upscaleImage,
  faceRestoreImage,
  colorizeImage,
  getAssetStatus,
} from '@/shared/api/image.api';
import {
  gaussianBlur,
  motionBlur,
  sharpen,
  unsharpMask,
  addNoise,
  reduceNoise,
  vignette,
  pixelate,
  emboss,
  edgeDetect,
  posterize,
  invert,
  grayscale,
  sepia,
  blur,
  sharpenMore,
  sharpenEdges,
  findEdges,
  solarize,
} from '@/features/image-editor/canvas/filters';

// ==================== Static enums / lookups ====================

// Numeric adjustment keys (excludes object-valued: levels/curves/colorBalance/hueSatChannels).
const ADJUSTMENT_KEYS = [
  'brightness', 'contrast', 'saturation', 'hue', 'exposure', 'gamma',
  'temperature', 'tint', 'highlights', 'shadows', 'clarity', 'vibrance',
] as const;
type NumericAdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];

const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'soft-light', 'hard-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  'dissolve', 'linear-burn', 'linear-dodge', 'vivid-light', 'linear-light',
  'pin-light', 'hard-mix', 'darker-color', 'lighter-color',
];

const ADJUSTMENT_LAYER_TYPES: AdjustmentLayerType[] = [
  'brightness-contrast', 'hue-saturation', 'levels', 'curves', 'exposure',
  'color-balance', 'threshold', 'photo-filter', 'black-and-white',
  'gradient-map', 'selective-color', 'channel-mixer', 'vibrance',
  'posterize', 'invert',
];

// Curated canvas filter registry — keep aligned with FilterPanel offerings.
// Variadic params are passed positionally; callers should refer to filters.ts for shapes.
type CanvasFilterEntry = {
  label: string;
  run: (imageData: ImageData, params?: Record<string, unknown>) => ImageData;
};
const CANVAS_FILTERS: Record<string, CanvasFilterEntry> = {
  blur:          { label: 'Blur',          run: (img) => blur(img) },
  'gaussian-blur': { label: 'Gaussian Blur', run: (img, p) => gaussianBlur(img, Number(p?.radius ?? 5)) },
  'motion-blur': { label: 'Motion Blur',  run: (img, p) => motionBlur(img, Number(p?.distance ?? 10), Number(p?.angle ?? 0)) },
  sharpen:       { label: 'Sharpen',       run: (img) => sharpen(img) },
  'sharpen-more':{ label: 'Sharpen More',  run: (img) => sharpenMore(img) },
  'sharpen-edges': { label: 'Sharpen Edges', run: (img) => sharpenEdges(img) },
  'unsharp-mask': { label: 'Unsharp Mask', run: (img, p) => unsharpMask(img, Number(p?.amount ?? 50), Number(p?.radius ?? 1), Number(p?.threshold ?? 0)) },
  noise:         { label: 'Add Noise',     run: (img, p) => addNoise(img, Number(p?.amount ?? 25), (p?.monochrome as boolean) ?? false) },
  'reduce-noise':{ label: 'Reduce Noise',  run: (img, p) => reduceNoise(img, Number(p?.strength ?? 20)) },
  vignette:      { label: 'Vignette',      run: (img, p) => vignette(img, Number(p?.amount ?? 50), Number(p?.size ?? 50)) },
  pixelate:      { label: 'Pixelate',      run: (img, p) => pixelate(img, Number(p?.size ?? 10)) },
  emboss:        { label: 'Emboss',        run: (img) => emboss(img) },
  'edge-detect': { label: 'Edge Detect',   run: (img) => edgeDetect(img) },
  'find-edges':  { label: 'Find Edges',    run: (img) => findEdges(img) },
  posterize:     { label: 'Posterize',     run: (img, p) => posterize(img, Number(p?.levels ?? 4)) },
  invert:        { label: 'Invert',        run: (img) => invert(img) },
  grayscale:     { label: 'Grayscale',     run: (img) => grayscale(img) },
  sepia:         { label: 'Sepia',         run: (img) => sepia(img) },
  solarize:      { label: 'Solarize',      run: (img, p) => solarize(img, Number(p?.threshold ?? 128)) },
};

// ==================== Command Types ====================

export type EditorCommand =
  | { action: 'generateImage'; prompt: string; negativePrompt?: string; aspectRatio?: string }
  | { action: 'removeBackground' }
  | { action: 'upscale'; scale: 2 | 4 }
  | { action: 'addLayer'; name?: string }
  | { action: 'removeLayer'; layerId?: string }
  | { action: 'duplicateLayer'; layerId?: string }
  | { action: 'renameLayer'; layerId?: string; name: string }
  | { action: 'setLayerVisibility'; layerId: string; visible: boolean }
  | { action: 'setLayerOpacity'; layerId: string; opacity: number }
  | { action: 'reorderLayer'; layerId: string; direction: 'up' | 'down' | 'top' | 'bottom' }
  | { action: 'undo' }
  | { action: 'redo' }
  | { action: 'flattenLayers' }
  | { action: 'faceRestore'; model?: 'gfpgan' | 'codeformer' }
  | { action: 'colorize' }
  | { action: 'addText'; text: string; x?: number; y?: number }
  | { action: 'setEditMode'; mode: string }
  | { action: 'setActiveTool'; tool: string }
  | { action: 'setBrushSize'; size: number }
  | { action: 'setBrushColor'; color: string }
  | { action: 'zoomTo'; level: number }
  | { action: 'zoomToFit' }
  | { action: 'applyAdjustment'; key: NumericAdjustmentKey; value: number }
  | { action: 'applyFilterPreset'; presetId: string; intensity?: number }
  | { action: 'applyCanvasFilter'; name: string; params?: Record<string, unknown> }
  | { action: 'setBlendMode'; layerId?: string; blendMode: BlendMode }
  | { action: 'setLayerLock'; layerId?: string; locked: boolean }
  | { action: 'addLayerMask'; layerId?: string }
  | { action: 'removeLayerMask'; layerId?: string }
  | { action: 'addAdjustmentLayer'; adjustmentType: AdjustmentLayerType; values?: Partial<AdjustmentValues> }
  | { action: 'rotate'; degrees: number }
  | { action: 'flip'; axis: 'horizontal' | 'vertical' };

// ==================== Parser ====================

/**
 * Extract the first <command>{...}</command> block from LLM response text.
 */
export function parseCommand(text: string): EditorCommand | null {
  const match = text.match(/<command>([\s\S]*?)<\/command>/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed && typeof parsed === 'object' && typeof parsed.action === 'string') {
      return parsed as EditorCommand;
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== Async Helpers ====================

const POLL_INTERVAL = 2000;
const MAX_POLL_ATTEMPTS = 60;

async function waitForAssetReady(assetId: string): Promise<string> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const status = await getAssetStatus(assetId);
    if (!status) throw new Error('Failed to get asset status');

    if (status.status === 'READY' || status.status === 'COMPLETED') {
      const url = status.asset?.previewUrl || status.asset?.publicUrl;
      if (!url) throw new Error('Asset ready but no URL available');
      return url;
    }

    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Asset processing failed');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error('Asset processing timed out (2 minutes)');
}

// ==================== Executor ====================

export async function executeCommand(
  command: EditorCommand,
  editorStore: ImageEditorStoreApi,
): Promise<void> {
  const state = editorStore.getState();

  switch (command.action) {
    // ====== Async: Image Generation ======
    case 'generateImage': {
      const asset = await generateImage({
        prompt: command.prompt,
        negativePrompt: command.negativePrompt,
        aspectRatio: command.aspectRatio || '1:1',
      });
      if (!asset) throw new Error('Image generation request failed');

      const imageUrl = await waitForAssetReady(asset.id);
      await state.addLayerFromUrl(imageUrl, `AI: ${command.prompt.slice(0, 30)}`);
      break;
    }

    // ====== Async: Background Removal ======
    case 'removeBackground': {
      const sourceId = state.sourceAsset?.id;
      if (!sourceId) throw new Error('No source asset to remove background from');

      const asset = await removeBackground(sourceId);
      if (!asset) throw new Error('Background removal request failed');

      const imageUrl = await waitForAssetReady(asset.id);
      await state.addLayerFromUrl(imageUrl, 'BG Removed');
      break;
    }

    // ====== Async: Upscale ======
    case 'upscale': {
      const sourceId = state.sourceAsset?.id;
      if (!sourceId) throw new Error('No source asset to upscale');

      const asset = await upscaleImage(sourceId, command.scale);
      if (!asset) throw new Error('Upscale request failed');

      const imageUrl = await waitForAssetReady(asset.id);
      await state.addLayerFromUrl(imageUrl, `Upscaled ${command.scale}×`);
      break;
    }

    // ====== Async: Face Restore ======
    case 'faceRestore': {
      const sourceId = state.sourceAsset?.id;
      if (!sourceId) throw new Error('No source asset for face restore');

      const asset = await faceRestoreImage(sourceId, command.model || 'codeformer');
      if (!asset) throw new Error('Face restore request failed');

      const imageUrl = await waitForAssetReady(asset.id);
      await state.addLayerFromUrl(imageUrl, 'Face Restored');
      break;
    }

    // ====== Async: Colorize ======
    case 'colorize': {
      const sourceId = state.sourceAsset?.id;
      if (!sourceId) throw new Error('No source asset to colorize');

      const asset = await colorizeImage(sourceId);
      if (!asset) throw new Error('Colorize request failed');

      const imageUrl = await waitForAssetReady(asset.id);
      await state.addLayerFromUrl(imageUrl, 'Colorized');
      break;
    }

    // ====== Sync: Layer Operations ======
    case 'addLayer': {
      // 1x1 투명 이미지 base64 (빈 레이어)
      const emptyPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      state.addLayer(emptyPixel, command.name || 'New Layer');
      break;
    }

    case 'removeLayer': {
      const targetId = command.layerId || state.activeLayerId;
      if (!targetId) throw new Error('No layer selected to remove');
      state.removeLayer(targetId);
      break;
    }

    case 'duplicateLayer': {
      const targetId = command.layerId || state.activeLayerId;
      if (!targetId) throw new Error('No layer selected to duplicate');
      state.duplicateLayer(targetId);
      break;
    }

    case 'renameLayer': {
      const targetId = command.layerId || state.activeLayerId;
      if (!targetId) throw new Error('No layer selected to rename');
      state.updateLayer(targetId, { name: command.name });
      break;
    }

    case 'setLayerVisibility': {
      state.updateLayer(command.layerId, { visible: command.visible });
      break;
    }

    case 'setLayerOpacity': {
      state.updateLayer(command.layerId, { opacity: command.opacity });
      break;
    }

    case 'reorderLayer': {
      const layers = state.layers;
      const idx = layers.findIndex((l) => l.id === command.layerId);
      if (idx === -1) throw new Error('Layer not found');

      let targetIdx: number;
      switch (command.direction) {
        case 'up': targetIdx = Math.max(0, idx - 1); break;
        case 'down': targetIdx = Math.min(layers.length - 1, idx + 1); break;
        case 'top': targetIdx = 0; break;
        case 'bottom': targetIdx = layers.length - 1; break;
      }
      if (targetIdx !== idx) {
        state.reorderLayers(idx, targetIdx);
      }
      break;
    }

    // ====== Sync: History ======
    case 'undo':
      state.undo();
      break;

    case 'redo':
      state.redo();
      break;

    case 'flattenLayers':
      await state.flattenLayers();
      break;

    // ====== Sync: Text ======
    case 'addText': {
      state.addTextLayer(command.text, command.x ?? 50, command.y ?? 50);
      break;
    }

    // ====== Sync: Tool/Mode ======
    case 'setEditMode':
      state.setEditMode(command.mode as Parameters<typeof state.setEditMode>[0]);
      break;

    case 'setActiveTool':
      state.setActiveTool(command.tool as Parameters<typeof state.setActiveTool>[0]);
      break;

    case 'setBrushSize':
      state.setBrushSettings({ size: command.size });
      break;

    case 'setBrushColor':
      state.setBrushSettings({ color: command.color });
      break;

    // ====== Sync: View ======
    case 'zoomTo':
      editorStore.setState({ zoom: command.level });
      break;

    case 'zoomToFit':
      editorStore.setState({ zoom: 100 });
      break;

    // ====== Sync: Adjustments / Filters ======
    case 'applyAdjustment': {
      if (!(ADJUSTMENT_KEYS as readonly string[]).includes(command.key)) {
        throw new Error(`Unknown adjustment key: ${command.key}`);
      }
      if (typeof command.value !== 'number' || !Number.isFinite(command.value)) {
        throw new Error(`Invalid adjustment value: ${command.value}`);
      }
      state.setAdjustment(command.key as keyof AdjustmentValues, command.value);
      break;
    }

    case 'applyFilterPreset': {
      state.applyFilterPreset(command.presetId);
      if (typeof command.intensity === 'number') {
        state.setFilterIntensity(command.intensity);
      }
      break;
    }

    case 'applyCanvasFilter': {
      const entry = CANVAS_FILTERS[command.name];
      if (!entry) {
        throw new Error(`Unknown canvas filter: ${command.name}`);
      }
      const params = command.params;
      state.applyCanvasFilter((imageData: ImageData) => entry.run(imageData, params), entry.label);
      break;
    }

    // ====== Sync: Advanced Layer Editing ======
    case 'setBlendMode': {
      const targetId = command.layerId || state.activeLayerId;
      if (!targetId) throw new Error('No layer selected to set blend mode');
      if (!BLEND_MODES.includes(command.blendMode)) {
        throw new Error(`Unknown blend mode: ${command.blendMode}`);
      }
      state.updateLayer(targetId, { blendMode: command.blendMode });
      break;
    }

    case 'setLayerLock': {
      const targetId = command.layerId || state.activeLayerId;
      if (!targetId) throw new Error('No layer selected to lock');
      state.updateLayer(targetId, { locked: command.locked });
      break;
    }

    case 'addLayerMask': {
      const targetId = command.layerId || state.activeLayerId;
      if (!targetId) throw new Error('No layer selected to add mask');
      state.addLayerMask(targetId);
      break;
    }

    case 'removeLayerMask': {
      const targetId = command.layerId || state.activeLayerId;
      if (!targetId) throw new Error('No layer selected to remove mask');
      state.removeLayerMask(targetId);
      break;
    }

    case 'addAdjustmentLayer': {
      if (!ADJUSTMENT_LAYER_TYPES.includes(command.adjustmentType)) {
        throw new Error(`Unknown adjustment layer type: ${command.adjustmentType}`);
      }
      state.addAdjustmentLayer(command.adjustmentType, command.values);
      break;
    }

    // ====== Sync: Transforms ======
    case 'rotate': {
      if (typeof command.degrees !== 'number' || !Number.isFinite(command.degrees)) {
        throw new Error(`Invalid rotation degrees: ${command.degrees}`);
      }
      state.setRotation(command.degrees);
      break;
    }

    case 'flip': {
      if (command.axis === 'horizontal') {
        state.toggleFlipHorizontal();
      } else if (command.axis === 'vertical') {
        state.toggleFlipVertical();
      } else {
        throw new Error(`Invalid flip axis: ${(command as { axis: string }).axis}`);
      }
      break;
    }

    default:
      throw new Error(`Unknown command action: ${(command as { action: string }).action}`);
  }
}
