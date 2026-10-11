/**
 * Put a server AI edit result (e.g. Relight) on the canvas as a new layer.
 *
 * Unlike the store's `addLayerFromUrl`, the result is
 *   - scaled to the canvas size (IC-Light returns 512x512 whatever the input),
 *   - given an opacity (Relight "strength"),
 *   - optionally masked by the current selection (non-destructive layer mask),
 *   - recorded as one history entry, so a single undo removes it.
 *
 * Kept outside imageEditor.store.ts (over the 1,000-line limit) and written
 * against the store API so it works on the tab that started the job even if
 * the user switched tabs while waiting.
 */

import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import type { SelectionData } from '@/features/image-editor/stores/imageEditor.store';

type StoreLike = Pick<ImageEditorStoreApi, 'getState'>;

export interface AddResultLayerInput {
  /** PNG data URL already sized to width x height. */
  dataUrl: string;
  name: string;
  width: number;
  height: number;
  /** 0..100 */
  opacity: number;
  /** Grayscale mask data URL (white = visible), or undefined for none. */
  maskDataUrl?: string;
  historyLabel: string;
}

/**
 * Store part: add the layer, place it over the whole canvas, attach the mask
 * and push one history entry. Returns the new layer id.
 */
export function addResultLayer(store: StoreLike, input: AddResultLayerInput): string {
  const state = store.getState();
  const id = state.addLayer(input.dataUrl, input.name);
  const opacity = Math.round(Math.min(100, Math.max(0, input.opacity)));
  store.getState().updateLayer(id, {
    x: 0,
    y: 0,
    width: input.width,
    height: input.height,
    opacity,
  });
  if (input.maskDataUrl) {
    store.getState().addLayerMask(id, input.maskDataUrl);
  }
  store.getState().pushHistory(input.historyLabel, input.dataUrl);
  return id;
}

/** Fetch an image as a same-origin object URL (keeps the canvas untainted). */
async function loadImage(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download result (${response.status})`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode result image'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load selection mask'));
    img.src = dataUrl;
  });
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  return [canvas, ctx];
}

/** Download `url` and draw it stretched to width x height. */
export async function renderUrlToSize(url: string, width: number, height: number): Promise<string> {
  const img = await loadImage(url);
  const [canvas, ctx] = makeCanvas(width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

/** Selection mask at canvas size, inverted when the selection is inverted. */
export async function selectionToLayerMask(
  selection: SelectionData,
  width: number,
  height: number,
): Promise<string> {
  const img = await loadDataUrl(selection.maskDataUrl);
  const [canvas, ctx] = makeCanvas(width, height);
  ctx.drawImage(img, 0, 0, width, height);
  if (selection.isInverted) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

export interface ApplyAIResultLayerOptions {
  name: string;
  historyLabel: string;
  opacity: number;
  /** Use the store's current selection as the layer mask (when there is one). */
  maskToSelection: boolean;
}

export interface ApplyAIResultLayerDeps {
  renderUrlToSize: typeof renderUrlToSize;
  selectionToLayerMask: typeof selectionToLayerMask;
}

const defaultDeps: ApplyAIResultLayerDeps = { renderUrlToSize, selectionToLayerMask };

/** Resolve the canvas size, falling back to the largest layer. */
export function getCanvasSize(store: StoreLike): { width: number; height: number } {
  const { canvasWidth, canvasHeight, layers } = store.getState();
  const width = canvasWidth > 0 ? canvasWidth : Math.max(1, ...layers.map((l) => l.x + l.width));
  const height = canvasHeight > 0 ? canvasHeight : Math.max(1, ...layers.map((l) => l.y + l.height));
  return { width, height };
}

/** Download, scale, mask and add the result layer. Returns the layer id. */
export async function applyAIResultLayer(
  store: StoreLike,
  imageUrl: string,
  options: ApplyAIResultLayerOptions,
  deps: ApplyAIResultLayerDeps = defaultDeps,
): Promise<string> {
  const { width, height } = getCanvasSize(store);
  const dataUrl = await deps.renderUrlToSize(imageUrl, width, height);
  const selection = store.getState().selection;
  const maskDataUrl =
    options.maskToSelection && selection?.maskDataUrl
      ? await deps.selectionToLayerMask(selection, width, height)
      : undefined;
  return addResultLayer(store, {
    dataUrl,
    name: options.name,
    width,
    height,
    opacity: options.opacity,
    maskDataUrl,
    historyLabel: options.historyLabel,
  });
}
