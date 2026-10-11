/**
 * The image an AI tool works on.
 *
 * The server tools take an asset id. The original asset (`sourceAsset.id`) is
 * only right while the document is still exactly that asset. As soon as the
 * document differs (any edit in history, an untracked change, a changed or
 * extra layer, a local file or a PSD), the current document is composited
 * from its layers at the CURRENT document size and uploaded, and the AI tool
 * gets that upload. This keeps crops, strokes and filters, and makes an
 * inpaint mask painted on the current document line up with what is sent.
 *
 * Several layers still go through the merge confirmation in useAIOperation
 * first; this module decides and performs the upload.
 */

import type { IrisAsset } from '@/shared/api/types';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';
import { flattenLayersToBlob } from '@/features/image-editor/canvas/layerCompositor';
import { documentSize } from '@/features/image-editor/canvas/layerMerge';
import { uploadImage } from '@/shared/api/image.api';

export interface AISourceState {
  sourceAsset: IrisAsset | null;
  layers: Layer[];
  history: ReadonlyArray<{ label: string }>;
  historyIndex: number;
  hasUntrackedChanges: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export interface AISourceDeps {
  flattenLayersToBlob: (layers: Layer[], width: number, height: number) => Promise<Blob>;
  uploadImage: (file: File, options?: { storagePath?: string; name?: string }) => Promise<IrisAsset | null>;
}

const defaultDeps: AISourceDeps = {
  flattenLayersToBlob: (layers, width, height) => flattenLayersToBlob(layers, width, height),
  uploadImage,
};

/** History label of the baseline entry every opened document starts with. */
const OPEN_LABEL = 'Open';

function isServerImageAsset(asset: IrisAsset): boolean {
  if (!asset.id || asset.id.startsWith('local-')) return false;
  const mime = asset.mimeType ?? '';
  if (mime && !mime.startsWith('image/')) return false;
  if (/photoshop|psd/i.test(mime) || /\.psd$/i.test(asset.name ?? '')) return false;
  return true;
}

/** A single layer that renders exactly like the opened image. */
function isPlainLayer(layer: Layer): boolean {
  return (
    (layer.type === undefined || layer.type === 'raster') &&
    layer.visible &&
    layer.opacity === 100 &&
    layer.blendMode === 'normal' &&
    (layer.x ?? 0) === 0 &&
    (layer.y ?? 0) === 0 &&
    !(layer.mask?.enabled && layer.mask.data) &&
    !layer.effects?.some((e) => e.enabled)
  );
}

/** True while the document is still exactly the opened source asset. */
export function documentMatchesSource(state: AISourceState): boolean {
  const { sourceAsset, layers, history, historyIndex } = state;
  if (!sourceAsset || !isServerImageAsset(sourceAsset)) return false;
  if (state.hasUntrackedChanges) return false;
  const atOpen =
    history.length === 0 || (historyIndex <= 0 && history[0]?.label === OPEN_LABEL);
  if (!atOpen) return false;
  if (layers.length > 1) return false;
  return layers.length === 0 || isPlainLayer(layers[0]);
}

/** Composite the current document and upload it; returns the new asset id. */
export async function uploadDocumentComposite(
  state: AISourceState,
  name: string,
  deps: AISourceDeps = defaultDeps,
): Promise<string> {
  const { width, height } = documentSize(state.layers, state.canvasWidth, state.canvasHeight);
  const blob = await deps.flattenLayersToBlob(state.layers, width, height);
  const file = new File([blob], `${name}-${Date.now()}.png`, { type: 'image/png' });
  const storagePath = state.sourceAsset?.storagePath || 'images';
  const uploaded = await deps.uploadImage(file, { storagePath, name });
  if (!uploaded?.id) throw new Error('Failed to upload the current document');
  return uploaded.id;
}

/**
 * Asset id for an AI request on a document WITHOUT the multi-layer merge
 * question (one layer or none). Null when there is no document.
 */
export async function resolveAIInputAssetId(
  state: AISourceState,
  deps: AISourceDeps = defaultDeps,
): Promise<string | null> {
  if (!state.sourceAsset?.id) return null;
  if (documentMatchesSource(state)) return state.sourceAsset.id;
  return uploadDocumentComposite(state, 'edited-document', deps);
}
