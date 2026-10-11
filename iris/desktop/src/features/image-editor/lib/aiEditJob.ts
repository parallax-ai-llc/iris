/**
 * One server AI edit job (upscale, background remove, face restore, colorize,
 * outpaint, inpaint, relight), shared by every AI panel and the inpaint modal.
 *
 * The job is bound to the tab (store) that started it, not to the panel:
 *  - the panel may close or the user may switch tabs while it runs; the job
 *    keeps waiting (the credits are already spent) and its result is applied
 *    to the STARTING tab's store, never to whichever tab is active by then
 *  - `isProcessing` on the starting tab is always cleared (finally)
 * Only an explicit AbortSignal (e.g. a "Stop waiting" button) stops waiting;
 * the server job itself keeps running and its result stays in the gallery.
 */

import type { IrisAsset } from '@/shared/api/types';
import { waitForEditResult } from '@/shared/api/image.api';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import { getActiveStore } from '@/features/image-editor/stores/imageEditorRegistry';

export interface AIEditJobOptions {
  /** The tab the job belongs to. Defaults to the tab active when the job starts. */
  store?: ImageEditorStoreApi;
  /** Processing message shown on the starting tab. */
  message: string;
  /** Starts the server job (POST /api/iris/assets/generate → 202). */
  start: () => Promise<{ id: string } | null>;
  /** Applies the finished asset to the starting tab. */
  apply: (asset: IrisAsset, store: ImageEditorStoreApi) => Promise<void> | void;
  /** Stop waiting (the server job is not cancelled). */
  signal?: AbortSignal;
}

/** Run a job to the end. Throws the job's error; always clears isProcessing on the starting tab. */
export async function runAIEditJob(options: AIEditJobOptions): Promise<IrisAsset> {
  const store = options.store ?? getActiveStore();
  const editor = () => store.getState();

  editor().setProcessing(true, options.message);
  editor().setProcessingProgress(0);
  try {
    const job = await options.start();
    if (!job?.id) throw new Error('Failed to start processing');
    const asset = await waitForEditResult(job.id, {
      signal: options.signal,
      onProgress: (p) => editor().setProcessingProgress(p),
    });
    await options.apply(asset, store);
    return asset;
  } finally {
    editor().setProcessing(false);
  }
}

export type AIResultPlacement = 'layer' | 'opened';

/**
 * The usual result handling: a new layer on top when asked (and the document
 * has layers), otherwise the editor opens the result asset. Both act on `store`.
 */
export async function addResultLayerOrOpen(
  asset: IrisAsset,
  store: ImageEditorStoreApi,
  options: { addAsLayer: boolean; layerName: string },
): Promise<AIResultPlacement> {
  const url = asset.previewUrl || asset.publicUrl;
  if (options.addAsLayer && url && store.getState().layers.length > 0) {
    const id = await store.getState().addLayerFromUrl(url, options.layerName);
    if (!id) throw new Error('Failed to add the result as a layer');
    return 'layer';
  }
  store.getState().openEditor(asset);
  return 'opened';
}
