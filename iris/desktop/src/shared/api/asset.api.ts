/**
 * Iris API - Asset operations
 */

import { apiClient } from './client';
import { assetCache } from '../lib/cache/asset-cache';
import { getTokenStorage } from '@/features/auth/lib/token-storage';
import { IS_SELF_HOST } from '@/config/self-host';
import { getIrisApiBaseUrl } from './iris-local';
import {
  IrisAsset,
  AssetListResponse,
  AssetQueryParams,
  CreateAssetData,
  UpdateAssetData,
  GenerateMediaData,
  AssetVersion,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';

const buildQueryString = (params?: Record<string, unknown>): string => {
  if (!params) return '';

  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const queryString = queryParams.toString();
  return queryString ? `?${queryString}` : '';
};

/**
 * Get list of assets
 */
export async function getAssets(params?: AssetQueryParams): Promise<AssetListResponse | null> {
  const queryString = buildQueryString(params as Record<string, unknown>);
  const response = await apiClient.get<AssetListResponse>(
    `/api/iris/assets${queryString}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Get asset by ID
 */
export async function getAsset(id: string): Promise<IrisAsset | null> {
  const response = await apiClient.get<IrisAsset>(
    `/api/iris/assets/${id}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Create a new asset
 */
export async function createAsset(data: CreateAssetData): Promise<IrisAsset | null> {
  const response = await apiClient.post<IrisAsset>(
    '/api/iris/assets',
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Update an asset
 */
export async function updateAsset(id: string, data: UpdateAssetData): Promise<IrisAsset | null> {
  const response = await apiClient.put<IrisAsset>(
    `/api/iris/assets/${id}`,
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Replace an existing asset's file content (same asset ID, new encrypted file)
 * Creates a new version record server-side.
 */
export async function replaceAssetFile(
  assetId: string,
  file: File | Blob,
): Promise<IrisAsset | null> {
  const response = await apiClient.uploadFile<{ asset: IrisAsset }>(
    `/api/iris/assets/${assetId}/replace`,
    file,
    'file',
    undefined,
    { requireAuth: true }
  );
  return response.success && response.data?.asset ? response.data.asset : null;
}

/**
 * Rename an asset
 */
export async function renameAsset(id: string, name: string): Promise<IrisAsset | null> {
  const response = await apiClient.patch<IrisAsset>(
    `/api/iris/assets/${id}/rename`,
    { name },
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Delete an asset
 */
export async function deleteAsset(id: string): Promise<{ success: boolean; error?: string }> {
  const response = await apiClient.delete(`/api/iris/assets/${id}`, { requireAuth: true });
  return { success: response.success, error: response.error };
}

/**
 * Get asset version history
 */
export async function getAssetVersions(assetId: string): Promise<AssetVersion[] | null> {
  const response = await apiClient.get<{ versions: AssetVersion[] }>(
    `/api/iris/assets/${assetId}/history`,
    { requireAuth: true }
  );
  return response.success ? response.data!.versions : null;
}

/**
 * Revert asset to a specific version
 */
export async function revertAssetToVersion(
  assetId: string,
  versionId: string
): Promise<IrisAsset | null> {
  const response = await apiClient.post<IrisAsset>(
    `/api/iris/assets/${assetId}/revert`,
    { versionId },
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Generate media (image/video)
 */
export async function generateMedia(data: GenerateMediaData): Promise<IrisAsset | null> {
  const response = await apiClient.post<IrisAsset>(
    '/api/iris/assets/generate',
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

// 에셋 업로드 허용 최대 크기 (server/src/config/constants.ts MAX_UPLOAD_BYTES와 동기).
// 청크 업로드는 cipher 스트림으로 GCS에 바로 흘려보내 상수 메모리로 처리하므로
// 메모리가 아니라 플랜별 저장 쿼터가 실질 상한이다.
export const IRIS_ASSET_MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
export const IRIS_ASSET_MAX_UPLOAD_LABEL = '10GB';

// 이 크기 이상이면 청크 스트리밍 업로드 사용 (서버 MAX_DIRECT_UPLOAD_BYTES와 동기).
const IRIS_CHUNK_THRESHOLD = 20 * 1024 * 1024; // 20MB
const IRIS_DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB 청크

export interface UploadAssetOptions {
  /** Asset display name */
  name?: string;
  /** Parent asset id for version-chain tracking */
  parentAssetId?: string;
  /** Progress callback (0-100). Chunked uploads report per-chunk. */
  onProgress?: (percent: number) => void;
  /** Abort between chunks */
  signal?: AbortSignal;
  /** Override chunk size in bytes */
  chunkSize?: number;
}

/** Pull the asset out of a `{ asset, message }` envelope (server upload/complete shape). */
function unwrapAsset(data: unknown): IrisAsset | null {
  if (!data) return null;
  const maybe = data as { asset?: IrisAsset };
  return (maybe.asset ?? (data as IrisAsset)) || null;
}

/**
 * Upload a file as an Iris asset (up to 10GB).
 *
 * Small files (< 20MB) go through the single-shot `/upload` route. Larger files
 * stream through the chunked pipeline (`/upload/init` → `/upload/chunk` →
 * `/upload/complete`) so the file is never buffered whole — the server encrypts
 * each chunk straight into GCS (V2 streaming format).
 */
export async function uploadAsset(
  file: File,
  assetType: 'IMAGE' | 'VIDEO',
  storagePath?: string,
  options: UploadAssetOptions = {}
): Promise<IrisAsset | null> {
  if (file.size > IRIS_ASSET_MAX_UPLOAD_BYTES) {
    throw new Error(
      `File too large: ${file.name} exceeds ${IRIS_ASSET_MAX_UPLOAD_LABEL} limit`
    );
  }

  if (file.size >= IRIS_CHUNK_THRESHOLD) {
    return uploadAssetChunked(file, assetType, storagePath, options);
  }

  const response = await apiClient.uploadFile<{ asset?: IrisAsset }>(
    '/api/iris/assets/upload',
    file,
    'file',
    {
      assetType,
      ...(storagePath && { storagePath }),
      ...(options.name && { name: options.name }),
      ...(options.parentAssetId && { parentAssetId: options.parentAssetId }),
    },
    { requireAuth: true }
  );
  if (!response.success) return null;
  options.onProgress?.(100);
  return unwrapAsset(response.data);
}

/** 청크 스트리밍 업로드 (20MB 이상, 최대 10GB). 진행률 콜백 지원. */
async function uploadAssetChunked(
  file: File,
  assetType: 'IMAGE' | 'VIDEO',
  storagePath?: string,
  options: UploadAssetOptions = {}
): Promise<IrisAsset | null> {
  const { chunkSize = IRIS_DEFAULT_CHUNK_SIZE, onProgress, signal } = options;
  const totalChunks = Math.ceil(file.size / chunkSize);

  // 1. 세션 초기화
  const initRes = await apiClient.post<{ sessionId: string }>(
    '/api/iris/assets/upload/init',
    {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      totalSize: file.size,
      chunkSize,
      totalChunks,
      assetType,
      storagePath: storagePath || '/',
    },
    { requireAuth: true }
  );

  if (!initRes.success || !initRes.data?.sessionId) {
    throw new Error(initRes.error || 'Failed to start upload');
  }

  const { sessionId } = initRes.data;

  try {
    let uploadedBytes = 0;

    // 2. 청크별 업로드 (청크당 최대 3회 재시도)
    for (let i = 0; i < totalChunks; i++) {
      if (signal?.aborted) throw new Error('Upload cancelled');

      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const MAX_RETRIES = 3;
      let lastError: string | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const res = await apiClient.uploadFile(
          `/api/iris/assets/upload/chunk?sessionId=${encodeURIComponent(
            sessionId
          )}&chunkIndex=${i}`,
          chunk,
          'chunk',
          undefined,
          { requireAuth: true }
        );
        if (res.success) {
          lastError = null;
          break;
        }
        lastError = res.error || `Chunk ${i} upload failed`;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      if (lastError) throw new Error(lastError);

      uploadedBytes += end - start;
      onProgress?.(Math.round((uploadedBytes / file.size) * 100));
    }

    // 3. 완료 요청 (조립 + 에셋 레코드 생성)
    const completeRes = await apiClient.post<{ asset?: IrisAsset }>(
      '/api/iris/assets/upload/complete',
      {
        sessionId,
        assetType,
        name: options.name,
        parentAssetId: options.parentAssetId,
        originalFileName: file.name,
      },
      { requireAuth: true }
    );

    if (!completeRes.success) {
      throw new Error(completeRes.error || 'Failed to complete upload');
    }

    return unwrapAsset(completeRes.data);
  } catch (error) {
    // 취소 또는 실패 시 세션 정리 (best-effort)
    apiClient
      .post('/api/iris/assets/upload/cancel', { sessionId }, { requireAuth: true })
      .catch(() => {});
    throw error;
  }
}

/**
 * Download asset to local file
 */
export async function downloadAsset(asset: IrisAsset): Promise<string | null> {
  try {
    let blob: Blob;
    if (IS_SELF_HOST) {
      // Local engine streams the bytes directly (no signed-URL indirection).
      const base = await getIrisApiBaseUrl();
      const fileResponse = await fetch(`${base}/api/iris/assets/${asset.id}/download`);
      if (!fileResponse.ok) return null;
      blob = await fileResponse.blob();
    } else {
      // Get download URL
      const response = await apiClient.get<{ url: string }>(
        `/api/iris/assets/${asset.id}/download`,
        { requireAuth: true }
      );

      if (!response.success || !response.data?.url) {
        return null;
      }

      // Fetch the file
      const fileResponse = await fetch(response.data.url);
      if (!fileResponse.ok) return null;

      blob = await fileResponse.blob();
    }
    const extension = asset.mimeType.split('/')[1] || 'bin';
    const fileName = `${asset.name}.${extension}`;

    // Check if Electron API is available
    if (window.electronAPI?.files) {
      const arrayBuffer = await blob.arrayBuffer();

      // Ask user where to save
      const savePath = await window.electronAPI.files.saveFile({
        defaultPath: fileName,
        filters: [
          { name: asset.assetType === 'IMAGE' ? 'Images' : 'Videos', extensions: [extension] },
        ],
      });

      if (!savePath) return null;

      // Write file
      await window.electronAPI.files.writeFile(savePath, arrayBuffer);
      return savePath;
    } else {
      // Fallback: Browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return fileName;
    }
  } catch (error) {
    console.error('Download asset error:', error);
    return null;
  }
}

/**
 * Get download URL for an asset
 */
export async function getDownloadUrl(assetId: string): Promise<string | null> {
  const response = await apiClient.get<{ url: string }>(
    `/api/iris/assets/${assetId}/download`,
    { requireAuth: true }
  );
  return response.success ? response.data?.url ?? null : null;
}

/**
 * Move asset to different path/folder
 */
export async function moveAsset(assetId: string, newPath: string): Promise<IrisAsset | null> {
  const response = await apiClient.patch<IrisAsset>(
    `/api/iris/assets/${assetId}/move`,
    { path: newPath },
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Batch delete multiple assets
 */
export async function deleteAssets(assetIds: string[]): Promise<{ deleted: number; failed: number }> {
  const response = await apiClient.post<{ deleted: number; failed: number }>(
    '/api/iris/assets/batch-delete',
    { ids: assetIds },
    { requireAuth: true }
  );
  return response.success ? response.data! : { deleted: 0, failed: assetIds.length };
}

/**
 * Get storage usage stats
 */
export async function getStorageStats(): Promise<{
  totalBytes: number;
  imageBytes: number;
  videoBytes: number;
  assetCount: number;
} | null> {
  const response = await apiClient.get<{
    totalBytes: number;
    imageBytes: number;
    videoBytes: number;
    assetCount: number;
  }>('/api/iris/assets/stats', { requireAuth: true });
  return response.success ? response.data! : null;
}

/**
 * Get unique folder paths from assets
 */
export async function getFolders(): Promise<string[] | null> {
  const response = await apiClient.get<{ folders: string[] }>(
    '/api/iris/assets/folders',
    { requireAuth: true }
  );
  return response.success ? response.data!.folders : null;
}

// ==================== Cached Content Access ====================

/**
 * Get auth token for direct fetch calls
 */
async function getAuthToken(): Promise<string | null> {
  return getTokenStorage().getToken();
}

/**
 * Fetch asset content as ArrayBuffer with authentication
 */
async function fetchAssetContent(assetId: string, endpoint: 'download' | 'thumbnail'): Promise<ArrayBuffer | null> {
  try {
    // Self-host: local engine, no auth. It serves only /download (no separate
    // thumbnail), so thumbnail requests fall back to the full file.
    if (IS_SELF_HOST) {
      const base = await getIrisApiBaseUrl();
      const res = await fetch(`${base}/api/iris/assets/${assetId}/download`);
      if (!res.ok) return null;
      return res.arrayBuffer();
    }

    const token = await getAuthToken();
    if (!token) return null;

    const response = await fetch(`${API_BASE_URL}/api/iris/assets/${assetId}/${endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;
    return response.arrayBuffer();
  } catch (error) {
    console.error(`Failed to fetch asset ${endpoint}:`, error);
    return null;
  }
}

/**
 * Get cached blob URL for asset preview/download
 * Uses two-tier caching: memory (fast) + IndexedDB (persistent)
 * 
 * @param asset - The asset to get URL for
 * @param type - 'preview' for full content, 'thumbnail' for thumbnail
 * @returns Blob URL that can be used in img/video src, or null on error
 */
export async function getCachedAssetUrl(
  asset: IrisAsset,
  type: 'preview' | 'thumbnail' = 'preview'
): Promise<string | null> {
  const cacheKey = `${asset.id}_${type}`;
  const endpoint = type === 'thumbnail' ? 'thumbnail' : 'download';
  
  return assetCache.getBlobUrl(
    cacheKey,
    () => fetchAssetContent(asset.id, endpoint),
    asset.mimeType
  );
}

/**
 * Get cached blob URL for asset by ID (when full asset object not available)
 * 
 * @param assetId - Asset ID
 * @param mimeType - MIME type of the asset
 * @param type - 'preview' or 'thumbnail'
 */
export async function getCachedAssetUrlById(
  assetId: string,
  mimeType: string,
  type: 'preview' | 'thumbnail' = 'preview'
): Promise<string | null> {
  const cacheKey = `${assetId}_${type}`;
  const endpoint = type === 'thumbnail' ? 'thumbnail' : 'download';
  
  return assetCache.getBlobUrl(
    cacheKey,
    () => fetchAssetContent(assetId, endpoint),
    mimeType
  );
}

/**
 * Preload multiple assets into cache
 * Useful for prefetching visible gallery items
 */
export async function preloadAssets(
  assets: IrisAsset[],
  type: 'preview' | 'thumbnail' = 'thumbnail'
): Promise<void> {
  // Preload in parallel with concurrency limit
  const CONCURRENCY = 4;
  const chunks: IrisAsset[][] = [];
  
  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    chunks.push(assets.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(asset => getCachedAssetUrl(asset, type).catch(() => null))
    );
  }
}

/**
 * Invalidate cache for an asset (call after update/delete)
 */
export async function invalidateAssetCache(assetId: string): Promise<void> {
  await Promise.all([
    assetCache.invalidate(`${assetId}_preview`),
    assetCache.invalidate(`${assetId}_thumbnail`),
  ]);
}

/**
 * Clear all asset cache
 */
export async function clearAssetCache(): Promise<void> {
  await assetCache.clearAll();
}

/**
 * Get cache statistics
 */
export function getAssetCacheStats(): { memoryItems: number; memoryBytes: number } {
  return assetCache.getStats();
}
