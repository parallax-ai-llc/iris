/**
 * The document image that leaves the editor (save, Save As, Export As, format
 * exports, Copy to Clipboard, the PSD composite preview).
 *
 * It is re-composited from the layers with `compositeLayers`, never read from
 * the on-screen canvas: that canvas also carries display-only state (Gamut
 * Warning overlay, Proof Colors, the single-channel / hidden-channel view, the
 * live adjustment preview) which must not end up in a file.
 *
 * Rotation and flip are view transforms applied at render time; they are
 * baked into the output here, as before.
 */

import type { Layer } from '@/features/image-editor/stores/imageEditor.store';
import { compositeLayers } from '@/features/image-editor/canvas/layerCompositor';
import { documentSize } from '@/features/image-editor/canvas/layerMerge';

export interface DocumentOutputState {
  layers: Layer[];
  canvasWidth: number;
  canvasHeight: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

/** Draw `canvas` rotated / flipped into a new canvas (same canvas when untransformed). */
export function bakeViewTransform(
  canvas: HTMLCanvasElement,
  rotation: number,
  flipHorizontal: boolean,
  flipVertical: boolean,
): HTMLCanvasElement {
  if (rotation === 0 && !flipHorizontal && !flipVertical) return canvas;

  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * cos + canvas.height * sin);
  out.height = Math.round(canvas.width * sin + canvas.height * cos);
  const ctx = out.getContext('2d');
  if (!ctx) return canvas;

  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(radians);
  ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

/** Document size from the store, or the layer extent before it is known. */
export function outputSize(state: Pick<DocumentOutputState, 'layers' | 'canvasWidth' | 'canvasHeight'>): {
  width: number;
  height: number;
} {
  return documentSize(state.layers, state.canvasWidth, state.canvasHeight);
}

/**
 * Composite the document for output. `displayCanvas` is used only when the
 * document has no layers yet (nothing to composite).
 */
export async function renderDocumentForOutput(
  state: DocumentOutputState,
  displayCanvas: HTMLCanvasElement | null,
): Promise<HTMLCanvasElement | null> {
  let flat: HTMLCanvasElement | null;
  if (state.layers.length === 0) {
    flat = displayCanvas;
  } else {
    const { width, height } = outputSize(state);
    flat = await compositeLayers(state.layers, width, height);
  }
  if (!flat) return null;
  return bakeViewTransform(flat, state.rotation, state.flipHorizontal, state.flipVertical);
}
