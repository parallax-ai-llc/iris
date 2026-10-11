/**
 * Pixel edits the canvas applies to the active layer: pending adjustments,
 * filters and committed brush / shape / bucket strokes.
 *
 * Moved out of EditorCanvas (over the 1,000-line limit). Rules
 * (static/docs/iris/desktop/image/DRAWING_IMAGE.md, ADJUST_IMAGE.md):
 *  - The target is the active layer. These handlers never call
 *    `setActiveLayer` (it flushes pending adjustments back into this code).
 *  - An empty active raster layer is a transparent document-size layer:
 *    filters and strokes paint into it; adjustments have nothing to change.
 *  - Document-space input (strokes, selection mask) is offset by the layer
 *    position exactly once (`canvas/layerRegion.ts`).
 *  - Stroke merges run one at a time and read the layer when they start, so
 *    quick successive strokes all land.
 * Every edit pushes one history entry after the layer changed.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';
import { getActiveStoreSafe } from '@/features/image-editor/stores/imageEditorRegistry';
import { applyAdjustmentsToCanvas, blendWithSelectionMask, type AdjustmentValues } from '@/features/image-editor/canvas/canvasEngine';
import { applyFilterToCanvas } from '@/features/image-editor/canvas/filters';
import { isPaintableLayer } from '@/features/image-editor/canvas/layerRegion';
import {
  createSerialQueue,
  documentSelectionMask,
  layerOwnCanvas,
  mergeStrokeIntoLayer,
  selectionMaskForRect,
} from '@/features/image-editor/canvas/layerSurface';

type FilterFn = (imageData: ImageData) => ImageData;

const ERASER_TOOLS = new Set(['eraser', 'background-eraser', 'magic-eraser']);

function documentSize(canvas: HTMLCanvasElement) {
  const { canvasWidth, canvasHeight } = useImageEditorStore.getState();
  return { width: canvasWidth || canvas.width, height: canvasHeight || canvas.height };
}

/** Push after the next paint so the snapshot shows the re-composited canvas. */
function pushAfterPaint(canvasRef: RefObject<HTMLCanvasElement | null>, label: string) {
  const store = getActiveStoreSafe();
  requestAnimationFrame(() => {
    (store ?? useImageEditorStore).getState().pushHistory(label, canvasRef.current?.toDataURL() ?? '');
  });
}

/**
 * Layer for an adjustment / filter: the active raster layer, else (nothing
 * paintable selected) the first layer with pixels, which becomes active
 * without flushing (we are the flush).
 */
function resolveTarget(layers: Layer[], activeLayerId: string | null): Layer | null {
  const active = activeLayerId ? layers.find((l) => l.id === activeLayerId) : undefined;
  if (active && isPaintableLayer(active)) return active;
  const firstRaster = layers.find((l) => isPaintableLayer(l) && !!l.imageData);
  if (firstRaster) useImageEditorStore.setState({ activeLayerId: firstRaster.id });
  return firstRaster ?? null;
}

/** Legacy no-layer documents: run `edit` on the whole canvas. */
function editWholeCanvas(canvas: HTMLCanvasElement, edit: (c: HTMLCanvasElement) => HTMLCanvasElement) {
  const result = edit(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(result, 0, 0);
}

export function useLayerPixelEdits(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const registerAdjustmentsApplyCallback = useImageEditorStore((s) => s.registerAdjustmentsApplyCallback);
  const registerFilterApplyCallback = useImageEditorStore((s) => s.registerFilterApplyCallback);
  const strokeQueueRef = useRef(createSerialQueue());

  /** Apply one layer-space edit (adjustment / filter) to `target`, limited by the selection. */
  const applyToLayer = useCallback(async (target: Layer, label: string, edit: (c: HTMLCanvasElement) => HTMLCanvasElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const store = getActiveStoreSafe() ?? useImageEditorStore;
    const { selection, selectionFeather } = store.getState();
    const doc = documentSize(canvas);
    const own = await layerOwnCanvas(target, doc.width, doc.height);
    if (!own) return;

    let result = edit(own.canvas);
    const selMask = await selectionMaskForRect(selection, selectionFeather, doc.width, doc.height, own.rect);
    if (selMask) result = blendWithSelectionMask(own.canvas, result, selMask);

    const state = store.getState();
    if (!state.layers.some((l) => l.id === target.id)) return;
    state.updateLayer(target.id, {
      imageData: result.toDataURL(),
      x: own.rect.x,
      y: own.rect.y,
      width: own.rect.width,
      height: own.rect.height,
    });
    pushAfterPaint(canvasRef, label);
  }, [canvasRef]);

  // Apply pending adjustments / filter preset (flushed on layer or mode switch)
  const applyAdjustmentsHandler = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = useImageEditorStore.getState();
    const adjustments = { ...state.adjustments } as AdjustmentValues;
    const label = state.activeFilterPreset !== 'none' ? 'Filter' : 'Adjustments';

    if (state.layers.length === 0) {
      // Legacy no-layer mode: apply to whole canvas
      editWholeCanvas(canvas, (c) => applyAdjustmentsToCanvas(c, adjustments));
      state.pushHistory(label, canvas.toDataURL());
      state.resetAdjustments();
      return;
    }

    const target = resolveTarget(state.layers, state.activeLayerId);
    if (!target?.imageData) {
      // An empty layer is transparent: an adjustment has nothing to change.
      state.resetAdjustments();
      return;
    }
    await applyToLayer(target, label, (c) => applyAdjustmentsToCanvas(c, adjustments));
    useImageEditorStore.getState().resetAdjustments();
  }, [canvasRef, applyToLayer]);

  useEffect(() => {
    registerAdjustmentsApplyCallback(applyAdjustmentsHandler);
    return () => registerAdjustmentsApplyCallback(null);
  }, [applyAdjustmentsHandler, registerAdjustmentsApplyCallback]);

  // Apply a filter (Filter menu / gallery) to the active layer
  const applyFilterHandler = useCallback(async (filterFn: FilterFn, label: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = useImageEditorStore.getState();

    if (state.layers.length === 0) {
      editWholeCanvas(canvas, (c) => applyFilterToCanvas(c, filterFn));
      state.pushHistory(label, canvas.toDataURL());
      return;
    }

    let target = resolveTarget(state.layers, state.activeLayerId);
    if (!target) {
      // No raster layer at all: render filters (Clouds, Fibers ...) need a
      // surface. An empty layer is a transparent document-size layer. The
      // filter's own entry covers adding it.
      const id = state.addLayer('', label, { history: false });
      target = useImageEditorStore.getState().layers.find((l) => l.id === id) ?? null;
      if (!target) return;
    }
    await applyToLayer(target, label, (c) => applyFilterToCanvas(c, filterFn));
  }, [canvasRef, applyToLayer]);

  useEffect(() => {
    registerFilterApplyCallback(applyFilterHandler);
    return () => registerFilterApplyCallback(null);
  }, [applyFilterHandler, registerFilterApplyCallback]);

  /** Merge a document-size stroke canvas into a layer (serialized). */
  const mergeStroke = useCallback((strokeCanvas: HTMLCanvasElement, layerId: string, historyLabel: string) => {
    const canvas = canvasRef.current;
    const store = getActiveStoreSafe();
    if (!canvas || !store) return;
    const { brushSettings, activeTool } = store.getState();
    const erase = ERASER_TOOLS.has(activeTool);
    const alpha = erase && activeTool !== 'eraser' ? 1 : brushSettings.opacity / 100;
    const doc = documentSize(canvas);

    // Immediate feedback on the screen canvas (prevents blink until re-render)
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
      ctx.globalAlpha = alpha;
      ctx.drawImage(strokeCanvas, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    void strokeQueueRef.current.run(async () => {
      // Read the layer now: an earlier stroke of the queue may have changed it.
      const { layers, selection, selectionFeather } = store.getState();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return;
      const selectionMask = await documentSelectionMask(selection, selectionFeather, doc.width, doc.height);
      const merged = await mergeStrokeIntoLayer(layer, {
        stroke: strokeCanvas,
        docWidth: doc.width,
        docHeight: doc.height,
        erase,
        alpha,
        selectionMask,
      });
      const state = store.getState();
      if (!merged || !state.layers.some((l) => l.id === layerId)) return;
      state.updateLayer(layerId, {
        imageData: merged.imageData,
        x: merged.rect.x,
        y: merged.rect.y,
        width: merged.rect.width,
        height: merged.rect.height,
      });
      state.pushHistory(historyLabel, canvasRef.current?.toDataURL() ?? '');
    });
  }, [canvasRef]);

  /** Commit a brush / bucket stroke or a shape to the active layer. */
  const commitToActiveLayer = useCallback((strokeCanvas: HTMLCanvasElement, historyLabel: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { layers, activeLayerId, brushSettings, activeTool, pushHistory } = useImageEditorStore.getState();
    const active = activeLayerId ? layers.find((l) => l.id === activeLayerId) : undefined;
    if (active) {
      // Groups, adjustment and fill layers have no pixels to paint.
      if (isPaintableLayer(active)) mergeStroke(strokeCanvas, active.id, historyLabel);
      return;
    }
    // No active layer: edits must target a layer
    if (layers.length > 0) return;

    // Legacy no-layer mode: draw directly to main canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (historyLabel === 'Brush Stroke') {
      const erase = ERASER_TOOLS.has(activeTool);
      ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
      ctx.globalAlpha = erase && activeTool !== 'eraser' ? 1 : brushSettings.opacity / 100;
    }
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    pushHistory(historyLabel, canvas.toDataURL());
  }, [canvasRef, mergeStroke]);

  const commitStroke = useCallback((strokeCanvas: HTMLCanvasElement) => {
    commitToActiveLayer(strokeCanvas, 'Brush Stroke');
  }, [commitToActiveLayer]);

  const commitShape = useCallback((shapeCanvas: HTMLCanvasElement) => {
    commitToActiveLayer(shapeCanvas, 'Shape');
  }, [commitToActiveLayer]);

  return { commitStroke, commitShape };
}
