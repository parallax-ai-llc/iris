/**
 * Asset access rule for workflow runs.
 *
 * Node inputs may carry a library asset reference (`/api/iris/assets/<id>/...`).
 * Those inputs can come from untrusted places (webhooks, public forms, API
 * triggers, templates, upstream HTTP or AI output), so an asset id alone never
 * grants access. A run may read an asset only when the asset belongs to the
 * user the run executes as (the workflow owner, `context.userId`).
 *
 * The rule is applied twice:
 *   1. The host's `AssetHost.getAssetById(id, requesterUserId)` returns null for
 *      an asset the requester may not read.
 *   2. `resolveRunAsset` below re-checks `asset.userId === requesterUserId`, so a
 *      host that ignores the requester argument still cannot leak another
 *      user's asset.
 *
 * Bytes are then read with the run user's id (never `asset.userId`), so a host
 * that scopes storage per user looks only inside the run user's own area.
 *
 * There is no cross-owner exception: shared library items are published as
 * separate public copies with their own https URLs, and those go through the
 * normal guarded URL fetch instead of this path.
 *
 * Refusals use one generic message so a caller cannot tell a missing asset
 * from someone else's asset.
 */

import { IrisError, IRIS_ERROR_CODES } from './errors.js';
import type { AssetHost, EngineStoredAssetInfo } from './node-host.js';

/** Message for every refused or missing asset reference. */
export const ASSET_NOT_ACCESSIBLE_MESSAGE = 'Asset not found or not accessible';

/** Asset ids the engine will look up: cloud cuids and local UUIDs. Anything
 *  else (dots, separators, encoded characters) is refused before the host. */
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const ASSET_URL_PATTERN = /^\/api\/iris\/assets\/([^/?#]+)/;

/** Error thrown when a node references an asset the run cannot read. */
export class AssetNotAccessibleError extends IrisError {
  constructor(prefix?: string) {
    super(
      prefix
        ? `${prefix}: ${ASSET_NOT_ACCESSIBLE_MESSAGE}`
        : ASSET_NOT_ACCESSIBLE_MESSAGE,
      404,
      IRIS_ERROR_CODES.STORAGE_ASSET_NOT_FOUND
    );
    this.name = 'AssetNotAccessibleError';
  }
}

/** True when `id` has the shape of an asset id the engine accepts. */
export function isValidAssetId(id: string): boolean {
  return ASSET_ID_PATTERN.test(id);
}

/** The asset id in a `/api/iris/assets/<id>/...` URL, or null when the value
 *  is not such a URL. The id is returned as written; callers validate it. */
export function parseAssetIdFromUrl(url: string): string | null {
  const match = url.match(ASSET_URL_PATTERN);
  return match ? match[1] : null;
}

/**
 * Resolve an asset id for a run. Returns the asset only when it exists and is
 * owned by `requesterUserId`; otherwise null. Never throws for an unreadable
 * asset, so callers choose between failing the node and skipping a lookup.
 */
export async function resolveRunAsset(
  assets: AssetHost,
  assetId: string,
  requesterUserId: string
): Promise<EngineStoredAssetInfo | null> {
  if (!requesterUserId || !isValidAssetId(assetId)) return null;
  const asset = await assets.getAssetById(assetId, requesterUserId);
  if (!asset || asset.userId !== requesterUserId) return null;
  return asset;
}

/**
 * Like `resolveRunAsset` but for a node that needs the asset's bytes: throws
 * `AssetNotAccessibleError` when the asset is missing, not owned, or has no
 * stored file.
 */
export async function requireRunAssetFile(
  assets: AssetHost,
  assetId: string,
  requesterUserId: string,
  errorPrefix?: string
): Promise<EngineStoredAssetInfo & { storagePath: string }> {
  const asset = await resolveRunAsset(assets, assetId, requesterUserId);
  if (!asset || !asset.storagePath) {
    throw new AssetNotAccessibleError(errorPrefix);
  }
  return asset as EngineStoredAssetInfo & { storagePath: string };
}
