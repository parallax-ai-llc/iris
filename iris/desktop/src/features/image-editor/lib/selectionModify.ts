/**
 * Select > Grow / Similar / Expand / Contract / Smooth / Border.
 *
 * The stored selection is a grayscale mask image (`selection.maskDataUrl`,
 * document size, white = selected). The mask is always the real selected area:
 * Select > Inverse bakes the inversion into it. Every operation runs the
 * morphology / colour functions of canvas/selectionEngine.ts on the mask, then
 * stores the result with fresh bounds. Feather is kept.
 * A selection that becomes empty is cleared. The selection is not document
 * content, so no history entry is pushed and the document does not turn dirty.
 */

import type { StoreApi } from 'zustand';
import type { ImageEditorActions, ImageEditorState } from '@/features/image-editor/stores/imageEditor.store';
import {
  borderSelection,
  contractSelection,
  expandSelection,
  getSelectionBounds,
  growSelection,
  isSelectionEmpty,
  loadSelectionMask,
  maskToDataUrl,
  similarSelection,
  smoothSelection,
} from '@/features/image-editor/canvas/selectionEngine';
import { compositeLayers } from '@/features/image-editor/canvas/layerCompositor';
import { documentSize } from '@/features/image-editor/canvas/layerMerge';

type Full = ImageEditorState & ImageEditorActions;
type GetState = StoreApi<Full>['getState'];
type SetState = StoreApi<Full>['setState'];

export type MorphologyOp = 'expand' | 'contract' | 'smooth' | 'border';
export type ColorOp = 'grow' | 'similar';

const MORPHOLOGY: Record<MorphologyOp, (m: Uint8ClampedArray, w: number, h: number, amount: number) => Uint8ClampedArray> = {
  expand: expandSelection,
  contract: contractSelection,
  smooth: smoothSelection,
  border: borderSelection,
};

/** The selection mask at document size (already the real selected area). */
async function effectiveMask(get: GetState): Promise<{ mask: Uint8ClampedArray; width: number; height: number } | null> {
  const { selection, layers, canvasWidth, canvasHeight } = get();
  if (!selection?.maskDataUrl) return null;
  const { width, height } = documentSize(layers, canvasWidth, canvasHeight);
  const mask = await loadSelectionMask(selection.maskDataUrl, width, height);
  return { mask, width, height };
}

function storeMask(get: GetState, set: SetState, mask: Uint8ClampedArray, width: number, height: number): void {
  const current = get().selection;
  if (!current) return; // deselected while working
  if (isSelectionEmpty(mask)) {
    set({ selection: null });
    return;
  }
  set({
    selection: {
      ...current,
      maskDataUrl: maskToDataUrl(mask, width, height),
      bounds: getSelectionBounds(mask, width, height),
    },
  });
}

/** Expand / Contract / Smooth / Border the selection by `amount` pixels. */
export async function modifySelectionMorphology(
  get: GetState,
  set: SetState,
  op: MorphologyOp,
  amount: number,
): Promise<void> {
  const source = get().selection;
  const eff = await effectiveMask(get);
  if (!eff || get().selection !== source) return;
  const next = MORPHOLOGY[op](eff.mask, eff.width, eff.height, Math.max(0, Math.round(amount)));
  storeMask(get, set, next, eff.width, eff.height);
}

/**
 * Grow (adjacent similar pixels) or Similar (similar pixels anywhere), using
 * the composited document colours and the selection tolerance.
 */
export async function modifySelectionByColor(get: GetState, set: SetState, op: ColorOp): Promise<void> {
  const source = get().selection;
  const eff = await effectiveMask(get);
  if (!eff || get().selection !== source) return;
  const canvas = await compositeLayers(get().layers, eff.width, eff.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || get().selection !== source) return;
  const pixels = ctx.getImageData(0, 0, eff.width, eff.height);
  const tolerance = get().selectionTolerance;
  const next =
    op === 'grow'
      ? growSelection(eff.mask, pixels, eff.width, eff.height, tolerance)
      : similarSelection(eff.mask, pixels, eff.width, eff.height, tolerance);
  storeMask(get, set, next, eff.width, eff.height);
}
