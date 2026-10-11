/**
 * Canvas-level image editor shortcuts: Delete/Backspace erases the selected
 * area, arrow keys nudge the active layer (Shift = 10px). Keys live in
 * IMAGE_EDITOR_KEYMAP. Mounted by EditorCanvas, which owns the canvas ref the
 * history snapshots are taken from.
 */

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useKeymapLayer, type ShortcutHandler } from '@/shared/lib/shortcuts';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  IMAGE_EDITOR_KEYMAP,
  type ImageEditorCanvasCommand,
} from '@/features/image-editor/lib/shortcuts/imageEditorKeymap';

const getState = () => useImageEditorStore.getState();

function pushHistorySnapshot(canvasRef: RefObject<HTMLCanvasElement | null>, label: string): void {
  requestAnimationFrame(() => {
    if (canvasRef.current) {
      getState().pushHistory(label, canvasRef.current.toDataURL());
    }
  });
}

/**
 * Erase the selected area on the active layer. Returns false when there is
 * nothing to erase so the key falls through (e.g. Backspace elsewhere).
 */
function eraseSelection(canvasRef: RefObject<HTMLCanvasElement | null>): boolean {
  const { selection, activeLayerId, layers, updateLayer, clearSelection } = getState();
  if (!selection?.maskDataUrl || !activeLayerId) return false;
  const layer = layers.find((l) => l.id === activeLayerId);
  if (!layer || layer.locked || !layer.imageData) return false;

  const layerImg = new Image();
  layerImg.onload = () => {
    const maskImg = new Image();
    maskImg.onload = () => {
      const c = document.createElement('canvas');
      c.width = layer.width || layerImg.width;
      c.height = layer.height || layerImg.height;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(layerImg, 0, 0, c.width, c.height);

      // Mask stores its value in R (A = 255); destination-out erases by source
      // alpha, so move the mask value into the alpha channel first.
      const alphaMaskCanvas = document.createElement('canvas');
      alphaMaskCanvas.width = c.width;
      alphaMaskCanvas.height = c.height;
      const alphaMaskCtx = alphaMaskCanvas.getContext('2d');
      if (!alphaMaskCtx) return;
      alphaMaskCtx.drawImage(maskImg, 0, 0, c.width, c.height);
      const maskData = alphaMaskCtx.getImageData(0, 0, c.width, c.height);
      const pixels = maskData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i + 3] = pixels[i];
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
      }
      alphaMaskCtx.putImageData(maskData, 0, 0);

      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(alphaMaskCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      updateLayer(activeLayerId, { imageData: c.toDataURL('image/png') });
      clearSelection();
      pushHistorySnapshot(canvasRef, 'Delete Selection');
    };
    maskImg.src = selection.maskDataUrl!;
  };
  layerImg.src = layer.imageData;
  return true;
}

export function useImageEditorCanvasShortcuts(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    },
    [],
  );

  const handlers = useMemo<Record<ImageEditorCanvasCommand, ShortcutHandler>>(() => {
    const nudge = (dx: number, dy: number): ShortcutHandler => (e) => {
      const { editMode, activeLayerId, layers, updateLayer } = getState();
      // Move tool (V) and the legacy 'select' mode both move layers.
      if (editMode !== 'select' && editMode !== 'move') return false;
      if (!activeLayerId) return false;
      const layer = layers.find((l) => l.id === activeLayerId);
      if (!layer || layer.locked) return false;
      const step = e.shiftKey ? 10 : 1;
      updateLayer(activeLayerId, { x: (layer.x ?? 0) + dx * step, y: (layer.y ?? 0) + dy * step });

      // Debounced history: rapid presses become one entry.
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = setTimeout(() => pushHistorySnapshot(canvasRef, 'Nudge Layer'), 300);
    };
    return {
      deleteSelection: () => eraseSelection(canvasRef),
      nudgeUp: nudge(0, -1),
      nudgeDown: nudge(0, 1),
      nudgeLeft: nudge(-1, 0),
      nudgeRight: nudge(1, 0),
    };
  }, [canvasRef]);

  useKeymapLayer('editor', IMAGE_EDITOR_KEYMAP, handlers);
}
