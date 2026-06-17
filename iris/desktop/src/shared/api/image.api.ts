/**
 * Iris API - Image operations
 * Specialized API client for image assets
 */

import { apiClient } from './client';
import {
  IrisAsset,
  AssetListResponse,
  AssetQueryParams,
  AssetVersion,
  GenerateImageData,
} from './types';
import { useImageStore } from '@/features/images/stores/image.store';

// Re-export cache and asset functions for convenience
export { invalidateAssetCache, clearAssetCache, replaceAssetFile } from './asset.api';

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
 * Get list of images (filtered by type: IMAGE)
 */
export async function getImages(params?: AssetQueryParams): Promise<AssetListResponse | null> {
  const queryParams = { ...params, type: 'IMAGE' as const };
  const queryString = buildQueryString(queryParams as Record<string, unknown>);
  const response = await apiClient.get<AssetListResponse>(
    `/api/iris/assets${queryString}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Get single image by ID
 */
export async function getImage(id: string): Promise<IrisAsset | null> {
  const response = await apiClient.get<IrisAsset>(
    `/api/iris/assets/${id}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Generate image with AI
 * Supports both text-to-image and image-to-image generation
 */
export async function generateImage(data: GenerateImageData): Promise<IrisAsset | null> {
  const requestBody: Record<string, unknown> = {
    ...data,
    assetType: 'IMAGE',
    storagePath: data.storagePath || 'images',
    settings: {
      model: data.model,
      providerId: data.providerId,
      aspectRatio: data.aspectRatio,
      resolution: data.resolution,
    },
  };

  // Add preset mode if specified
  if (data.presetMode) {
    (requestBody.settings as Record<string, unknown>).presetMode = data.presetMode;
  }

  // Add image-to-image specific settings
  if (data.referenceAssetId) {
    requestBody.referenceAssetId = data.referenceAssetId;
    (requestBody.settings as Record<string, unknown>).referenceAssetId = data.referenceAssetId;
  }
  if (data.referenceImageBase64) {
    requestBody.referenceImageBase64 = data.referenceImageBase64;
    (requestBody.settings as Record<string, unknown>).referenceImageBase64 = data.referenceImageBase64;
  }
  if ((data.referenceAssetId || data.referenceImageBase64) && data.imageStrength !== undefined) {
    (requestBody.settings as Record<string, unknown>).imageStrength = data.imageStrength;
  }

  const response = await apiClient.post<IrisAsset>(
    '/api/iris/assets/generate',
    requestBody,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Upload image file
 */
export async function uploadImage(
  file: File,
  options?: {
    storagePath?: string;
    name?: string;
  }
): Promise<IrisAsset | null> {
  const additionalData: Record<string, string> = {
    assetType: 'IMAGE',
  };

  if (options?.storagePath) {
    additionalData.storagePath = options.storagePath;
  }
  if (options?.name) {
    additionalData.name = options.name;
  }

  const response = await apiClient.uploadFile<IrisAsset>(
    '/api/iris/assets/upload',
    file,
    'file',
    additionalData,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Delete image
 */
export async function deleteImage(id: string): Promise<boolean> {
  const response = await apiClient.delete(
    `/api/iris/assets/${id}`,
    { requireAuth: true }
  );
  return response.success;
}

/**
 * Get download URL for image
 */
export async function downloadImageUrl(id: string): Promise<string | null> {
  const response = await apiClient.get<{ url: string }>(
    `/api/iris/assets/${id}/download`,
    { requireAuth: true }
  );
  return response.success && response.data?.url ? response.data.url : null;
}

/**
 * Get image version history
 */
export async function getImageVersions(id: string): Promise<AssetVersion[] | null> {
  const response = await apiClient.get<{ versions: AssetVersion[] }>(
    `/api/iris/assets/${id}/versions`,
    { requireAuth: true }
  );
  return response.success ? response.data!.versions : null;
}

// ==================== Image Editing Operations ====================

/**
 * Upscale image request interface
 */
export interface IUpscaleImageRequest {
  assetId: string;
  scale: 2 | 4;
  upscaleType?: 'crisp' | 'creative';
}

/**
 * Remove background request interface
 */
export interface IRemoveBackgroundRequest {
  assetId: string;
}

/**
 * Asset status response interface
 */
export interface IAssetStatusResponse {
  status: string;
  asset?: IrisAsset;
  progress?: number;
  error?: string;
}

/**
 * Upscale image (2x or 4x)
 * Creates a new asset with the upscaled version
 */
export async function upscaleImage(id: string, scale: 2 | 4): Promise<IrisAsset | null> {
  // Get the original asset to use as reference
  const originalAsset = await getImage(id);
  if (!originalAsset) {
    return null;
  }

  // Use the generate endpoint with image-upscale capability
  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: '', // Not needed for upscale
      editMode: 'upscale',
      parentAssetId: id,
      settings: {
        model: scale === 4 ? 'recraft-creative-upscale' : 'recraft-crisp-upscale',
        providerId: 'recraft',
        upscaleType: scale === 4 ? 'creative' : 'crisp',
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
 * Remove background from image
 * Creates a new asset with the background removed
 */
export async function removeBackground(
  id: string,
  storagePath?: string
): Promise<IrisAsset | null> {
  let resolvedPath = storagePath || 'images';
  if (!storagePath) {
    const originalAsset = await getImage(id);
    if (!originalAsset) return null;
    resolvedPath = originalAsset.path || 'images';
  }

  // Use the generate endpoint with background-remove capability
  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: resolvedPath,
      prompt: '', // Not needed for background removal
      editMode: 'bgRemove',
      parentAssetId: id,
      settings: {
        model: 'recraft-remove-background',
        providerId: 'recraft',
        removeBackground: true,
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
 * Replace sky in image
 * Creates a new asset with the sky replaced
 */
export async function skyReplaceImage(id: string, backgroundPrompt?: string): Promise<IrisAsset | null> {
  const originalAsset = await getImage(id);
  if (!originalAsset) return null;

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: backgroundPrompt || 'clear blue sky with white clouds',
      editMode: 'skyReplace',
      parentAssetId: id,
      settings: {
        model: 'stable-image-sky-replace',
        providerId: 'stability',
        referenceAssetId: id,
        skyReplace: {
          backgroundPrompt: backgroundPrompt || 'clear blue sky with white clouds',
          foregroundPrompt: 'natural lighting, realistic',
        },
      },
      referenceAssetId: id,
    },
    { requireAuth: true }
  );

  return response.success && response.data?.asset ? response.data.asset : null;
}

/**
 * Relight image
 * Creates a new asset with adjusted lighting
 */
export async function relightImage(id: string, lightingPrompt?: string): Promise<IrisAsset | null> {
  const originalAsset = await getImage(id);
  if (!originalAsset) return null;

  const prompt = lightingPrompt || 'soft natural lighting from the left';

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt,
      editMode: 'relight',
      parentAssetId: id,
      settings: {
        model: 'fal-ai/iclight-v2',
        providerId: 'fal',
        referenceAssetId: id,
        relightSettings: {
          lightingPrompt: prompt,
        },
      },
      referenceAssetId: id,
    },
    { requireAuth: true }
  );

  return response.success && response.data?.asset ? response.data.asset : null;
}

/**
 * Auto enhance image
 * Creates a new asset with AI-enhanced quality
 */
export async function autoEnhanceImage(id: string): Promise<IrisAsset | null> {
  const originalAsset = await getImage(id);
  if (!originalAsset) return null;

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: '',
      editMode: 'autoEnhance',
      parentAssetId: id,
      settings: {
        model: 'stable-image-auto-enhance',
        providerId: 'stability',
        referenceAssetId: id,
      },
      referenceAssetId: id,
    },
    { requireAuth: true }
  );

  return response.success && response.data?.asset ? response.data.asset : null;
}

/**
 * Get asset status for polling processing progress
 * Use this to check if an asset has finished processing
 */
export async function getAssetStatus(id: string): Promise<IAssetStatusResponse | null> {
  const response = await apiClient.get<IrisAsset>(
    `/api/iris/assets/${id}`,
    { requireAuth: true }
  );

  if (!response.success || !response.data) {
    return null;
  }

  const asset = response.data;
  return {
    status: asset.processingStatus || 'READY',
    asset: asset,
    error: asset.processingError || undefined,
  };
}

/**
 * Poll an image asset until it is READY (or FAILED).
 * The upload handler returns immediately with PROCESSING / empty storagePath
 * and finishes storage in the background, so callers that need a usable asset
 * (e.g. picking it as an image-to-video start frame) should await this first.
 */
export async function pollAssetUntilReady(
  id: string,
  options?: { maxAttempts?: number; intervalMs?: number },
): Promise<IrisAsset | null> {
  const maxAttempts = options?.maxAttempts ?? 60; // 60 × 500ms = 30s
  const intervalMs = options?.intervalMs ?? 500;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getAssetStatus(id);
    if (!status) return null;
    if (status.status === 'READY' && status.asset?.storagePath) return status.asset;
    if (status.status === 'FAILED') return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * Face Restore request interface
 */
export interface IFaceRestoreRequest {
  assetId: string;
  model?: 'gfpgan' | 'codeformer';
  fidelity?: number; // 0-1, higher = more faithful to original
}

/**
 * Colorize request interface
 */
export interface IColorizeRequest {
  assetId: string;
  style?: 'natural' | 'vivid' | 'vintage' | 'cinematic';
}

/**
 * Restore faces in image using AI
 * Creates a new asset with restored/enhanced faces
 */
export async function faceRestoreImage(
  id: string,
  model: 'gfpgan' | 'codeformer' = 'codeformer',
  fidelity: number = 0.5
): Promise<IrisAsset | null> {
  // Get the original asset to use as reference
  const originalAsset = await getImage(id);
  if (!originalAsset) {
    return null;
  }

  // Use the generate endpoint with face-restore capability
  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: '', // Not needed for face restore
      editMode: 'faceRestore',
      parentAssetId: id,
      settings: {
        model: `face-restore-${model}`,
        providerId: 'replicate',
        faceRestore: true,
        faceRestoreModel: model,
        fidelity: fidelity,
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
 * Colorize black and white image using AI
 * Creates a new asset with colorized version
 */
export async function colorizeImage(
  id: string,
  style: 'natural' | 'vivid' | 'vintage' | 'cinematic' = 'natural'
): Promise<IrisAsset | null> {
  // Get the original asset to use as reference
  const originalAsset = await getImage(id);
  if (!originalAsset) {
    return null;
  }

  // Use the generate endpoint with colorize capability
  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: '', // Not needed for colorization
      editMode: 'colorize',
      parentAssetId: id,
      settings: {
        model: 'colorize-deoldify',
        providerId: 'replicate',
        colorize: true,
        colorizeStyle: style,
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
 * Inpaint request interface
 */
export interface IInpaintRequest {
  assetId: string;
  prompt: string;
  negativePrompt?: string;
  maskDataUrl: string; // Base64 PNG data URL
}

/**
 * Outpaint request interface
 */
export interface IOutpaintRequest {
  assetId: string;
  prompt?: string;
  direction: 'top' | 'bottom' | 'left' | 'right' | 'all';
  expandAmount: number; // In pixels
}

/**
 * Inpaint image - modify specific masked areas with AI
 * Creates a new asset with the inpainted version
 */
export async function inpaintImage(
  id: string,
  prompt: string,
  maskDataUrl: string,
  negativePrompt?: string
): Promise<IrisAsset | null> {
  // Get the original asset to use as reference
  const originalAsset = await getImage(id);
  if (!originalAsset) {
    return null;
  }

  // Extract base64 data from data URL
  const maskBase64 = maskDataUrl.replace(/^data:image\/\w+;base64,/, '');

  // Use the generate endpoint with inpaint capability
  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: prompt,
      negativePrompt: negativePrompt,
      parentAssetId: id,
      settings: {
        model: 'stability-inpaint',
        providerId: 'stability',
        editMode: 'inpaint',
        referenceAssetId: id,
      },
      referenceAssetId: id,
      maskImageBase64: maskBase64,
      editMode: 'inpaint',
    },
    { requireAuth: true }
  );

  if (response.success && response.data?.asset) {
    return response.data.asset;
  }
  return null;
}

/**
 * Content-Aware Fill - automatically fill selected area using AI inpainting
 * Uses a generic prompt to blend the fill seamlessly with surrounding content
 */
export async function contentAwareFill(
  id: string,
  maskDataUrl: string
): Promise<IrisAsset | null> {
  return inpaintImage(
    id,
    'Fill this area seamlessly matching the surrounding content, texture, and lighting. Remove any objects and blend naturally.',
    maskDataUrl
  );
}

/**
 * Outpaint image - expand image beyond its boundaries with AI
 * Creates a new asset with the expanded version
 */
export async function outpaintImage(
  id: string,
  direction: 'top' | 'bottom' | 'left' | 'right' | 'all',
  expandAmount: number,
  prompt?: string
): Promise<IrisAsset | null> {
  // Get the original asset to use as reference
  const originalAsset = await getImage(id);
  if (!originalAsset) {
    return null;
  }

  // Convert direction to array format expected by server
  const directions = direction === 'all'
    ? ['top', 'bottom', 'left', 'right']
    : [direction];

  // Use the generate endpoint with outpaint capability
  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: prompt || '',
      parentAssetId: id,
      settings: {
        model: 'stability-outpaint',
        providerId: 'stability',
        editMode: 'outpaint',
        referenceAssetId: id,
        outpaint: {
          directions,
          expandAmount,
        },
      },
      referenceAssetId: id,
      editMode: 'outpaint',
      outpaint: {
        directions,
        expandAmount,
      },
    },
    { requireAuth: true }
  );

  if (response.success && response.data?.asset) {
    return response.data.asset;
  }
  return null;
}

// ==================== Neural Filter API Functions ====================

/**
 * Smart Portrait — AI-powered portrait enhancement with adjustable parameters.
 * Uses Replicate (InstantID / PhotoMaker) for realistic face-aware edits.
 */
export async function smartPortrait(
  id: string,
  params: {
    smoothSkin?: number; // 0-100
    enhanceEyes?: number; // 0-100
    enhanceLips?: number; // 0-100
    faceLight?: number; // -100 to 100
    age?: number; // -50 to 50 (negative = younger, positive = older)
  } = {}
): Promise<IrisAsset | null> {
  const originalAsset = useImageStore.getState().images.find((a) => a.id === id);
  if (!originalAsset) {
    return null;
  }

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: '',
      settings: {
        model: 'smart-portrait',
        providerId: 'replicate',
        referenceAssetId: id,
        smartPortrait: {
          smoothSkin: params.smoothSkin ?? 50,
          enhanceEyes: params.enhanceEyes ?? 30,
          enhanceLips: params.enhanceLips ?? 20,
          faceLight: params.faceLight ?? 0,
          age: params.age ?? 0,
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
 * Super Zoom — AI-powered upscaling beyond standard 4x.
 * Uses Recraft upscale with enhanced detail reconstruction.
 */
export async function superZoom(
  id: string,
  scale: number = 4
): Promise<IrisAsset | null> {
  const originalAsset = useImageStore.getState().images.find((a) => a.id === id);
  if (!originalAsset) {
    return null;
  }

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: '',
      settings: {
        model: 'recraft-upscale',
        providerId: 'recraft',
        referenceAssetId: id,
        upscale: {
          scale: Math.min(Math.max(scale, 2), 8),
          enhanceDetails: true,
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
 * Makeup Transfer — Transfer makeup style from a reference face to target.
 * Uses Replicate for face-aware makeup application.
 */
export async function makeupTransfer(
  id: string,
  referenceId: string,
  params: {
    intensity?: number; // 0-100
    lipOnly?: boolean;
    eyeOnly?: boolean;
  } = {}
): Promise<IrisAsset | null> {
  const originalAsset = useImageStore.getState().images.find((a) => a.id === id);
  const referenceAsset = useImageStore.getState().images.find((a) => a.id === referenceId);
  if (!originalAsset || !referenceAsset) {
    return null;
  }

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: '',
      settings: {
        model: 'makeup-transfer',
        providerId: 'replicate',
        referenceAssetId: id,
        makeupTransfer: {
          styleReferenceAssetId: referenceId,
          intensity: params.intensity ?? 80,
          lipOnly: params.lipOnly ?? false,
          eyeOnly: params.eyeOnly ?? false,
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
 * Photo Restoration — AI-powered old/damaged photo restoration.
 * Chains face restoration (GFPGAN) + colorization (DDColor) via Replicate.
 */
export async function photoRestoration(
  id: string,
  params: {
    colorize?: boolean; // Also colorize B&W photos
    scratchRemoval?: boolean; // Remove scratches/damage
    faceEnhance?: boolean; // Enhance faces specifically
  } = {}
): Promise<IrisAsset | null> {
  const originalAsset = useImageStore.getState().images.find((a) => a.id === id);
  if (!originalAsset) {
    return null;
  }

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: '',
      settings: {
        model: 'photo-restoration',
        providerId: 'replicate',
        referenceAssetId: id,
        photoRestoration: {
          colorize: params.colorize ?? true,
          scratchRemoval: params.scratchRemoval ?? true,
          faceEnhance: params.faceEnhance ?? true,
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
 * Landscape Mixer — Blend two landscape images with AI-guided composition.
 * Uses Stability (img2img + inpaint) for seamless landscape blending.
 */
export async function landscapeMixer(
  id: string,
  referenceId: string,
  params: {
    prompt?: string; // Guide the blend style
    blendStrength?: number; // 0-100
    preserveForeground?: boolean;
  } = {}
): Promise<IrisAsset | null> {
  const originalAsset = useImageStore.getState().images.find((a) => a.id === id);
  const referenceAsset = useImageStore.getState().images.find((a) => a.id === referenceId);
  if (!originalAsset || !referenceAsset) {
    return null;
  }

  const response = await apiClient.post<{ asset: IrisAsset }>(
    '/api/iris/assets/generate',
    {
      assetType: 'IMAGE',
      storagePath: originalAsset.path || 'images',
      prompt: params.prompt || 'blend landscapes seamlessly',
      settings: {
        model: 'stability-landscape-mixer',
        providerId: 'stability',
        referenceAssetId: id,
        landscapeMixer: {
          styleReferenceAssetId: referenceId,
          blendStrength: params.blendStrength ?? 50,
          preserveForeground: params.preserveForeground ?? true,
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
