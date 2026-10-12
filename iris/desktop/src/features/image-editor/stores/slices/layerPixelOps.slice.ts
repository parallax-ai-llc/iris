/**
 * Store actions that rewrite a layer's pixels outside the canvas component:
 * warp, fill / stroke path and content-aware fill.
 *
 * Split out of `imageEditor.store.ts`. Each one records one history entry
 * after the layer changed (so the document becomes dirty and one undo reverts
 * it) and follows the layer geometry rules of `canvas/layerRegion.ts`: paths
 * are in document coordinates, an empty layer is a transparent document-size
 * layer, and an offset layer keeps its off-canvas pixels.
 */

import type { StoreApi } from 'zustand';
import { layerEditSurface, loadImageElement } from '@/features/image-editor/canvas/layerSurface';
import { isPaintableLayer, type Rect } from '@/features/image-editor/canvas/layerRegion';
import { documentSize as layersDocumentSize } from '@/features/image-editor/canvas/layerMerge';
import type { ImageEditorActions, ImageEditorState, PathPoint } from '../imageEditor.store';

type Full = ImageEditorState & ImageEditorActions;
type SetState = StoreApi<Full>['setState'];
type GetState = StoreApi<Full>['getState'];

export type LayerPixelOpsSliceActions = Pick<
  ImageEditorActions,
  'applyWarp' | 'fillPath' | 'strokePath' | 'contentAwareFill'
>;

/** Trace a path given in document space onto a surface whose origin is `origin`. */
function tracePath(ctx: CanvasRenderingContext2D, points: PathPoint[], closed: boolean, origin: Rect) {
  const ox = -origin.x;
  const oy = -origin.y;
  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) {
      ctx.moveTo(pt.x + ox, pt.y + oy);
      return;
    }
    const prev = points[i - 1];
    if (prev.handleOut && pt.handleIn) {
      ctx.bezierCurveTo(
        prev.handleOut.x + ox, prev.handleOut.y + oy,
        pt.handleIn.x + ox, pt.handleIn.y + oy,
        pt.x + ox, pt.y + oy,
      );
    } else {
      ctx.lineTo(pt.x + ox, pt.y + oy);
    }
  });
  if (closed) ctx.closePath();
}

/** The document size, not the bottom layer's (it can be smaller or moved). */
function documentSize(get: GetState) {
  const { canvasWidth, canvasHeight, layers } = get();
  return layersDocumentSize(layers, canvasWidth, canvasHeight);
}

export function createLayerPixelOpsSlice(set: SetState, get: GetState): LayerPixelOpsSliceActions {
  /** Shared by fill and stroke path: paint the path onto the active layer. */
  const paintPath = async (pathId: string, mode: 'fill' | 'stroke') => {
    const { paths, layers, activeLayerId, brushSettings } = get();
    const path = paths.find((p) => p.id === pathId);
    const layer = layers.find((l) => l.id === activeLayerId);
    if (!path || !layer || path.points.length < 2 || !isPaintableLayer(layer) || layer.locked) return;

    const doc = documentSize(get);
    const surface = await layerEditSurface(layer, doc.width, doc.height);
    if (!surface) return;
    const { ctx, canvas, rect } = surface;

    tracePath(ctx, path.points, path.closed, rect);
    if (mode === 'fill') {
      ctx.fillStyle = brushSettings.color;
      ctx.fill();
    } else {
      ctx.strokeStyle = brushSettings.color;
      ctx.lineWidth = brushSettings.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // The layer may have been deleted while the image loaded.
    if (!get().layers.some((l) => l.id === layer.id)) return;
    get().updateLayer(layer.id, {
      imageData: canvas.toDataURL('image/png'),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
    get().pushHistory(mode === 'fill' ? 'Fill Path' : 'Stroke Path', '');
  };

  return {
    applyWarp: async () => {
      const { warpGrid, layers, activeLayerId } = get();
      if (!warpGrid) return;

      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (!activeLayer?.imageData) {
        // Nothing to warp on an empty layer: leave warp mode without a change.
        set({ isWarpMode: false, warpGrid: null });
        return;
      }

      const { applyWarpToCanvas, dataUrlToCanvas } = await import('@/features/image-editor/canvas/canvasEngine');
      const sourceCanvas = await dataUrlToCanvas(activeLayer.imageData);
      const warpedCanvas = applyWarpToCanvas(sourceCanvas, warpGrid);

      get().updateLayer(activeLayer.id, { imageData: warpedCanvas.toDataURL('image/png') });
      set({ isWarpMode: false, warpGrid: null });
      get().pushHistory('Warp', '');
    },

    fillPath: (pathId) => paintPath(pathId, 'fill'),

    strokePath: (pathId) => paintPath(pathId, 'stroke'),

    contentAwareFill: async () => {
      const { selection, layers, sourceAsset, activeLayerId, isProcessing } = get();
      if (!selection || !sourceAsset?.id || isProcessing) return;

      const doc = documentSize(get);
      get().setProcessing(true, 'Content-Aware Fill');
      try {
        const { selectionToInpaintMask } = await import('@/features/image-editor/canvas/selectionEngine');
        const { contentAwareFill: contentAwareFillApi, waitForEditResult } = await import('@/shared/api/image.api');
        const { resolveAIInputAssetId } = await import('@/features/image-editor/lib/aiSource');

        // The mask is already the real selected area (Inverse is baked in).
        const inpaintMask = await selectionToInpaintMask(selection.maskDataUrl, doc.width, doc.height);
        // Send the CURRENT document (the original asset only while unchanged),
        // so edits are kept and the document-size mask lines up with the image.
        const inputAssetId = await resolveAIInputAssetId(get());
        if (!inputAssetId) return;
        // POST answers 202 with a pending asset: wait for the finished image.
        const job = await contentAwareFillApi(inputAssetId, inpaintMask);
        const result = job?.id ? await waitForEditResult(job.id) : null;
        const imageUrl = result?.previewUrl || result?.publicUrl;
        const targetId = layers.find((l) => l.id === activeLayerId)?.id;
        if (!imageUrl || !targetId) return;

        const img = await loadImageElement(imageUrl, 'anonymous');
        if (!img || !get().layers.some((l) => l.id === targetId)) return;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        // The result is the whole document image.
        get().updateLayer(targetId, {
          imageData: canvas.toDataURL('image/png'),
          x: 0,
          y: 0,
          width: img.width,
          height: img.height,
        });
        set({ selection: null });
        get().pushHistory('Content-Aware Fill', '');
      } finally {
        get().setProcessing(false);
      }
    },
  };
}
