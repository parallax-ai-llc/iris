/**
 * Iris API - Video operations
 * Specialized API client for video assets
 */

import { apiClient } from './client';
import {
  IrisAsset,
  AssetListResponse,
  AssetQueryParams,
  AssetVersion,
} from './types';
import { IS_SELF_HOST } from '@/config/self-host';
import { irisLocalFetch } from './iris-local';

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

// ==================== Types ====================

export interface GenerateVideoData {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  providerId?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  duration?: number; // in seconds
  storagePath?: string;
  name?: string;
  // Image-to-Video: reference image for guided generation (legacy single-reference)
  referenceAssetId?: string;
  // Image-to-Video: explicit start/end frame asset IDs (Kling/Seedance first-last frame)
  startFrameAssetId?: string;
  endFrameAssetId?: string;
  // Inline (base64) start/end frame images — used when a pasted/picked file
  // shouldn't be persisted into the user's library before generation.
  startFrameBase64?: string;
  endFrameBase64?: string;
}

export interface VideoStatusResponse {
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  asset?: IrisAsset;
  progress?: number; // 0-100
  error?: string;
}

// ==================== API Functions ====================

/**
 * Get list of videos (filtered by type: VIDEO)
 */
export async function getVideos(params?: AssetQueryParams): Promise<AssetListResponse | null> {
  const queryParams = { ...params, type: 'VIDEO' as const };
  const queryString = buildQueryString(queryParams as Record<string, unknown>);
  // Self-host: assets live on the local engine's disk store, not the cloud.
  if (IS_SELF_HOST) {
    try {
      return await irisLocalFetch<AssetListResponse>(`/api/iris/assets${queryString}`);
    } catch {
      return null;
    }
  }
  const response = await apiClient.get<AssetListResponse>(
    `/api/iris/assets${queryString}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Get single video by ID
 */
export async function getVideo(id: string): Promise<IrisAsset | null> {
  if (IS_SELF_HOST) {
    try {
      return await irisLocalFetch<IrisAsset>(`/api/iris/assets/${id}`);
    } catch {
      return null;
    }
  }
  const response = await apiClient.get<IrisAsset>(
    `/api/iris/assets/${id}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Generate video with AI
 * Supports both text-to-video and image-to-video generation
 */
export async function generateVideo(data: GenerateVideoData): Promise<IrisAsset | null> {
  const requestBody: Record<string, unknown> = {
    ...data,
    assetType: 'VIDEO',
    storagePath: data.storagePath || 'videos',
    settings: {
      model: data.model,
      providerId: data.providerId,
      aspectRatio: data.aspectRatio || '16:9',
      duration: data.duration || 5,
    },
  };

  // Add image-to-video specific settings
  if (data.referenceAssetId) {
    requestBody.referenceAssetId = data.referenceAssetId;
    (requestBody.settings as Record<string, unknown>).referenceAssetId = data.referenceAssetId;
  }
  if (data.startFrameAssetId) {
    requestBody.startFrameAssetId = data.startFrameAssetId;
  }
  if (data.endFrameAssetId) {
    requestBody.endFrameAssetId = data.endFrameAssetId;
  }
  if (data.startFrameBase64) {
    requestBody.startFrameBase64 = data.startFrameBase64;
  }
  if (data.endFrameBase64) {
    requestBody.endFrameBase64 = data.endFrameBase64;
  }

  // Self-host: generate through the local engine (BYOK) and store on disk.
  if (IS_SELF_HOST) {
    return irisLocalFetch<IrisAsset>('/api/iris/assets/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  }

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    requestBody,
    { requireAuth: true }
  );

  if (response.success && response.data?.asset) {
    return response.data.asset;
  }
  return response.success ? (response.data as unknown as IrisAsset) : null;
}

/**
 * Upload video file
 */
export async function uploadVideo(
  file: File,
  options?: {
    storagePath?: string;
    name?: string;
  }
): Promise<{ asset: IrisAsset | null; error?: string }> {
  const additionalData: Record<string, string> = {
    assetType: 'VIDEO',
  };

  if (options?.storagePath) {
    additionalData.storagePath = options.storagePath;
  }
  if (options?.name) {
    additionalData.name = options.name;
  }

  const response = await apiClient.uploadFile<{ asset: IrisAsset }>(
    '/api/iris/assets/upload',
    file,
    'file',
    additionalData,
    { requireAuth: true }
  );

  if (response.success && response.data?.asset) {
    return { asset: response.data.asset };
  }

  // Fallback: server may return asset at top level (e.g., { id, name, ... })
  if (response.success && response.data && (response.data as { id?: string }).id) {
    return { asset: response.data as unknown as IrisAsset };
  }

  return { asset: null, error: response.error };
}

/**
 * Delete video
 */
export async function deleteVideo(id: string): Promise<{ success: boolean; error?: string }> {
  const response = await apiClient.delete(
    `/api/iris/assets/${id}`,
    { requireAuth: true }
  );
  return { success: response.success, error: response.error };
}

/**
 * Get download URL for video
 * Returns the authenticated download endpoint URL
 */
export async function downloadVideoUrl(id: string): Promise<string | null> {
  // The download endpoint streams the decrypted file directly
  // We need to construct the URL with auth token for direct download
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';
  return `${API_BASE_URL}/api/iris/assets/${id}/download`;
}

/**
 * Get video version history
 */
export async function getVideoVersions(id: string): Promise<AssetVersion[] | null> {
  const response = await apiClient.get<{ versions: AssetVersion[] }>(
    `/api/iris/assets/${id}/versions`,
    { requireAuth: true }
  );
  return response.success ? response.data!.versions : null;
}

/**
 * Get video processing status for polling
 */
export async function getVideoStatus(id: string): Promise<VideoStatusResponse | null> {
  let asset: IrisAsset | null;
  if (IS_SELF_HOST) {
    try {
      asset = await irisLocalFetch<IrisAsset>(`/api/iris/assets/${id}`);
    } catch {
      asset = null;
    }
  } else {
    const response = await apiClient.get<IrisAsset>(
      `/api/iris/assets/${id}`,
      { requireAuth: true }
    );
    asset = response.success ? response.data ?? null : null;
  }

  if (!asset) {
    return null;
  }
  return {
    status: (asset.processingStatus as VideoStatusResponse['status']) || 'READY',
    asset: asset,
    error: asset.processingError || undefined,
  };
}

// ==================== Video Editing Operations ====================

/**
 * Poll for video asset status until READY or FAILED
 */
export async function pollVideoStatus(
  assetId: string,
  maxAttempts = 120,
  intervalMs = 3000
): Promise<IrisAsset | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getVideoStatus(assetId);
    if (!status) return null;

    if (status.status === 'READY') {
      return status.asset || null;
    }

    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Video processing failed');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Video processing timed out');
}

/**
 * Upscale video (legacy - no settings)
 */
export async function upscaleVideo(id: string): Promise<IrisAsset | null> {
  return upscaleVideoWithSettings(id, {});
}

/**
 * Upscale video with resolution and frame rate settings
 */
export async function upscaleVideoWithSettings(
  id: string,
  options: {
    targetResolution?: '720p' | '1080p' | '4K';
    targetFps?: number;
  } = {}
): Promise<IrisAsset | null> {
  const originalAsset = await getVideo(id);
  if (!originalAsset) {
    return null;
  }

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'VIDEO',
      storagePath: originalAsset.path || 'videos',
      prompt: '',
      editMode: 'upscale',
      sourceAssetId: id,
      settings: {
        model: 'topazlabs-video-upscale',
        upscale: true,
        referenceAssetId: id,
        upscaleVideo: {
          targetResolution: (options.targetResolution || '1080p').toLowerCase(),
          targetFps: options.targetFps || 30,
        },
      },
      referenceAssetId: id,
    },
    { requireAuth: true }
  );

  if (response.success && response.data?.asset) {
    return response.data.asset;
  }
  return null;
}

/**
 * Cut/trim video into segments using the dedicated cut endpoint
 */
export interface CutVideoSegment {
  id: string;
  startTime: number;
  endTime: number;
  label?: string;
}

export async function cutVideoSegments(
  sourceAssetId: string,
  segments: CutVideoSegment[],
  exportMode: 'merge' | 'individual',
  outputName?: string
): Promise<{ assets: IrisAsset[]; totalCreated: number } | null> {
  const originalAsset = await getVideo(sourceAssetId);
  if (!originalAsset) {
    return null;
  }

  const response = await apiClient.post<{
    assets: IrisAsset[];
    totalCreated: number;
    exportMode: string;
    message: string;
  }>(
    '/api/iris/assets/cut',
    {
      sourceAssetId,
      segments,
      exportMode,
      outputName,
      storagePath: originalAsset.path || 'videos',
    },
    { requireAuth: true }
  );

  if (response.success && response.data) {
    return {
      assets: response.data.assets,
      totalCreated: response.data.totalCreated,
    };
  }
  return null;
}

/**
 * Cut/trim video (legacy single segment)
 */
export async function cutVideo(
  id: string,
  startTime: number,
  endTime: number
): Promise<IrisAsset | null> {
  const result = await cutVideoSegments(
    id,
    [{ id: '1', startTime, endTime }],
    'merge'
  );
  return result?.assets?.[0] || null;
}

/**
 * Inpaint video - modify masked areas with AI
 * Requires video >= 8 seconds
 */
export async function inpaintVideo(
  id: string,
  prompt: string,
  maskDataUrl: string
): Promise<IrisAsset | null> {
  const originalAsset = await getVideo(id);
  if (!originalAsset) {
    return null;
  }

  // Extract base64 data from data URL
  const maskBase64 = maskDataUrl.replace(/^data:image\/\w+;base64,/, '');

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'VIDEO',
      storagePath: originalAsset.path || 'videos',
      prompt,
      editMode: 'inpaint',
      sourceAssetId: id,
      maskImageBase64: maskBase64,
      settings: {
        model: 'veo2-video-inpaint',
        referenceAssetId: id,
      },
      referenceAssetId: id,
    },
    { requireAuth: true }
  );

  if (response.success && response.data?.asset) {
    return response.data.asset;
  }
  return null;
}

/**
 * Motion control - transfer motion from video to reference image
 */
export async function motionControlVideo(
  videoId: string,
  referenceImage: File,
  options: {
    mode?: 'std' | 'pro';
    characterOrientation?: 'image' | 'video';
    keepOriginalSound?: boolean;
  } = {}
): Promise<IrisAsset | null> {
  const originalAsset = await getVideo(videoId);
  if (!originalAsset) {
    return null;
  }

  // Use uploadFile for multipart (sends referenceImage as file)
  const additionalData: Record<string, string> = {
    assetType: 'VIDEO',
    storagePath: originalAsset.path || 'videos',
    prompt: '',
    editMode: 'motionControl',
    motionSourceAssetId: videoId,
    settings: JSON.stringify({
      model: 'kling-motion-control',
      referenceAssetId: videoId,
      motionControl: {
        mode: options.mode || 'std',
        characterOrientation: options.characterOrientation || 'image',
        keepOriginalSound: options.keepOriginalSound ?? false,
      },
    }),
  };

  const response = await apiClient.uploadFile<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    referenceImage,
    'referenceImage',
    additionalData,
    { requireAuth: true }
  );

  if (response.success && response.data?.asset) {
    return response.data.asset;
  }
  return null;
}
