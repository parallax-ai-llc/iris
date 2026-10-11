/**
 * Canvas-level image editor shortcuts: Delete/Backspace erases the selected
 * area, arrow keys nudge the active layer (Shift = 10px). Keys live in
 * IMAGE_EDITOR_KEYMAP. Mounted by EditorCanvas, which owns the canvas ref the
 * history snapshots are taken from. A pending (debounced) nudge entry is
 * pushed right away when the canvas unmounts.
 */

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useKeymapLayer, type ShortcutHandler } from '@/shared/lib/shortcuts';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { getActiveStoreSafe } from '@/features/image-editor/stores/imageEditorRegistry';
import { layerOwnCanvas, selectionMaskForRect } from '@/features/image-editor/canvas/layerSurface';
import {
  IMAGE_EDITOR_KEYMAP,
  type ImageEditorCanvasCommand,
} from '@/features/image-editor/lib/shortcuts/imageEditorKeymap';

const getState = () => useImageEditorStore.getState();

export const NUDGE_DEBOUNCE_MS = 300;

type EditorStore = Pick<typeof useImageEditorStore, 'getState'>;

function pushHistorySnapshot(canvasRef: RefObject<HTMLCanvasElement | null>, label: string, store: EditorStore = useImageEditorStore): void {
  requestAnimationFrame(() => {
    store.getState().pushHistory(label, canvasRef.current?.toDataURL() ?? '');
  });
}

/**
 * Erase the selected area on the active layer. Returns false when there is
 * nothing to erase so the key falls through (e.g. Backspace elsewhere).
 *
 * The selection mask is in document space; it is cut to the layer's
 * rectangle (layer x / y / size), so a moved layer erases what is under the
 * selection on screen. Invert and feather apply.
 */
function eraseSelection(canvasRef: RefObject<HTMLCanvasElement | null>): boolean {
  const { selection, selectionFeather, activeLayerId, layers, canvasWidth, canvasHeight } = getState();
  if (!selection?.maskDataUrl || !activeLayerId) return false;
  const layer = layers.find((l) => l.id === activeLayerId);
  if (!layer || layer.locked || !layer.imageData) return false;
  const store = getActiveStoreSafe() ?? useImageEditorStore;
  const docW = canvasWidth || canvasRef.current?.width || layer.width;
  const docH = canvasHeight || canvasRef.current?.height || layer.height;

  void (async () => {
    const own = await layerOwnCanvas(layer, docW, docH);
    if (!own) return;
    const mask = await selectionMaskForRect(selection, selectionFeather, docW, docH, own.rect);
    if (!mask) return;
    const pixels = own.ctx.getImageData(0, 0, own.canvas.width, own.canvas.height);
    for (let i = 0; i < mask.length; i++) {
      const a = i * 4 + 3;
      pixels.data[a] = Math.round(pixels.data[a] * (1 - mask[i] / 255));
    }
    own.ctx.putImageData(pixels, 0, 0);

    const state = store.getState();
    if (!state.layers.some((l) => l.id === layer.id)) return;
    state.updateLayer(layer.id, { imageData: own.canvas.toDataURL('image/png') });
    state.clearSelection();
    pushHistorySnapshot(canvasRef, 'Delete Selection', store);
  })();
  return true;
}

export function useImageEditorCanvasShortcuts(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store of the tab the pending nudge belongs to (the canvas unmounts on tab switch)
  const nudgeStoreRef = useRef<EditorStore | null>(null);

  // Unmount (tab switch, editor close) must not lose the debounced nudge entry.
  useEffect(
    () => () => {
      if (!nudgeTimerRef.current) return;
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
      nudgeStoreRef.current?.getState().pushHistory('Nudge Layer', '');
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
      const store = getActiveStoreSafe() ?? useImageEditorStore;
      nudgeStoreRef.current = store;
      nudgeTimerRef.current = setTimeout(() => {
        nudgeTimerRef.current = null;
        pushHistorySnapshot(canvasRef, 'Nudge Layer', store);
      }, NUDGE_DEBOUNCE_MS);
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
