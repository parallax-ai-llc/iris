/**
 * Import a user's local file into the disk asset store (desktop gallery "Upload").
 *
 * The cloud uploads to GCS; locally we reuse the host's `storeOutput` (the same
 * primitive generation uses) to write `<dataDir>/assets/<id>/` + meta.json, so an
 * imported file shows up in the gallery exactly like a generated one.
 */

import { createLocalNodeHost } from './local-node-host.js';
import type { LocalWorkflowStore } from './local-workflow-store.js';
import type { StoreOutputResult } from 'iris-engine';

export interface ImportAssetInput {
  /** Original file name (extension drives the stored file name). */
  fileName?: string;
  /** Raw base64 or a `data:` URL — both accepted. */
  base64: string;
  mimeType?: string;
  assetType?: string;
}

export interface LocalImporterOptions {
  dataDir: string;
  store: LocalWorkflowStore;
  getPublicBaseUrl: () => string;
  userId?: string;
}

export function createLocalImporter(
  opts: LocalImporterOptions,
): (input: ImportAssetInput) => Promise<StoreOutputResult> {
  const host = createLocalNodeHost({
    dataDir: opts.dataDir,
    store: opts.store,
    getPublicBaseUrl: opts.getPublicBaseUrl,
    userId: opts.userId,
  });
  const userId = opts.userId ?? 'local';

  return function importAsset(input: ImportAssetInput): Promise<StoreOutputResult> {
    const mime = input.mimeType ?? '';
    const type = mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('audio/')
        ? 'audio'
        : (input.assetType ?? '').toUpperCase() === 'VIDEO'
          ? 'video'
          : 'image';
    const baseName = (input.fileName ?? 'imported').replace(/\.[^.]+$/, '');
    return host.media.storeOutput({
      output: {
        type,
        base64: input.base64,
        metadata: {
          ...(input.mimeType ? { contentType: input.mimeType } : {}),
          ...(input.fileName ? { name: input.fileName } : {}),
        },
      },
      userId,
      baseName,
    });
  };
}
