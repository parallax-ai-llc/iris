/**
 * Replicate Provider Model Definitions
 * Contains all model configurations for the Replicate adapter
 */

import { ModelInfo } from '../types.js';

/**
 * All supported models for the Replicate provider
 * Includes: text-to-image, text-to-video, image-to-video, face-swap, inpaint, video-inpaint, motion-control, video-upscale
 */
export const REPLICATE_MODELS: ModelInfo[] = [
  {
    id: 'black-forest-labs/flux-schnell',
    name: 'FLUX Schnell',
    provider: 'replicate',
    capabilities: ['text-to-image', 'image-to-image'],
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    constraints: {
      maxImageSize: 1024,
      supportedFormats: ['png', 'webp'],
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    },
    pricing: {
      unit: 'image',
      inputCost: 0,
      outputCost: 0.003,
      currency: 'USD',
    },
    defaultParameters: {
      numOutputs: 1,
    },
  },
  {
    id: 'stability-ai/sdxl',
    name: 'Stable Diffusion XL',
    provider: 'replicate',
    capabilities: ['text-to-image', 'image-to-image'],
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    constraints: {
      maxImageSize: 1024,
      supportedFormats: ['png', 'webp'],
      supportedAspectRatios: ['1:1', '16:9', '9:16'],
    },
    pricing: {
      unit: 'image',
      inputCost: 0,
      outputCost: 0.004,
      currency: 'USD',
    },
    defaultParameters: {
      numOutputs: 1,
    },
  },
  // Video models via Replicate
  {
    id: 'openai/sora-2',
    name: 'Sora 2 (via Replicate)',
    provider: 'replicate',
    capabilities: ['text-to-video'],
    inputTypes: ['text'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 20,
      supportedDurations: [5, 10, 15, 20],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'second',
      inputCost: 0,
      outputCost: 0.1,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  {
    id: 'minimax/video-01',
    name: 'MiniMax Video-01 (via Replicate)',
    provider: 'replicate',
    capabilities: ['text-to-video'],
    inputTypes: ['text'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 6,
      supportedDurations: [6],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.3,
      currency: 'USD',
    },
    defaultParameters: {
      aspectRatio: '16:9',
    },
  },
  // Face Swap models
  {
    id: 'codeplugtech/face-swap',
    name: 'Face Swap (Fast)',
    provider: 'replicate',
    capabilities: ['face-swap'],
    inputTypes: ['image'],
    outputTypes: ['image'],
    constraints: {
      supportedFormats: ['png', 'jpg', 'webp'],
    },
    pricing: {
      unit: 'image',
      inputCost: 0,
      outputCost: 0.003,
      currency: 'USD',
    },
  },
  {
    id: 'easel/advanced-face-swap',
    name: 'Advanced Face Swap (High Quality)',
    provider: 'replicate',
    capabilities: ['face-swap'],
    inputTypes: ['image'],
    outputTypes: ['image'],
    constraints: {
      supportedFormats: ['png', 'jpg', 'webp'],
    },
    pricing: {
      unit: 'image',
      inputCost: 0,
      outputCost: 0.01,
      currency: 'USD',
    },
  },
  // Image Inpaint models
  {
    id: 'black-forest-labs/flux-fill-pro',
    name: 'FLUX Fill Pro (Inpaint)',
    provider: 'replicate',
    capabilities: ['inpaint'],
    inputTypes: ['image'],
    outputTypes: ['image'],
    constraints: {
      supportedFormats: ['png', 'jpg', 'webp'],
      supportedAspectRatios: [
        '1:1',
        '16:9',
        '9:16',
        '4:3',
        '3:4',
        '21:9',
        '9:21',
      ],
    },
    pricing: {
      unit: 'image',
      inputCost: 0,
      outputCost: 0.05,
      currency: 'USD',
    },
    defaultParameters: {
      guidance: 30,
      outputFormat: 'png',
    },
  },
  // Kling Video models via Replicate
  {
    id: 'kling-2.6',
    name: 'Kling 2.6 (via Replicate)',
    provider: 'replicate',
    capabilities: ['text-to-video', 'image-to-video'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 10,
      supportedDurations: [5, 10],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.6,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  {
    id: 'kling-2.5',
    name: 'Kling 2.5 (via Replicate)',
    provider: 'replicate',
    capabilities: ['text-to-video', 'image-to-video'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 10,
      supportedDurations: [5, 10],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.55,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  {
    id: 'kling-2.5-turbo',
    name: 'Kling 2.5 Turbo (via Replicate)',
    provider: 'replicate',
    capabilities: ['text-to-video', 'image-to-video'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 10,
      supportedDurations: [5, 10],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.35,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  {
    id: 'kling-2.1',
    name: 'Kling 2.1 (via Replicate)',
    provider: 'replicate',
    capabilities: ['text-to-video', 'image-to-video'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 10,
      supportedDurations: [5, 10],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.5,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  {
    id: 'kling-2.0',
    name: 'Kling 2.0 (via Replicate)',
    provider: 'replicate',
    capabilities: ['text-to-video', 'image-to-video'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 10,
      supportedDurations: [5, 10],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.5,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  {
    id: 'kling-1.6-pro',
    name: 'Kling 1.6 Pro (via Replicate)',
    provider: 'replicate',
    capabilities: ['image-to-video'], // Kling 1.6 Pro only supports image-to-video
    inputTypes: ['image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 10,
      supportedDurations: [5, 10],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.4,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  {
    id: 'kling-1.6-standard',
    name: 'Kling 1.6 Standard (via Replicate)',
    provider: 'replicate',
    capabilities: ['image-to-video'], // Kling 1.6 supports first/last frame via image-to-video
    inputTypes: ['image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 5,
      supportedDurations: [5],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.25,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  {
    id: 'kling-1.5-standard',
    name: 'Kling 1.5 Standard (via Replicate)',
    provider: 'replicate',
    capabilities: ['image-to-video'], // Kling 1.5 only supports image-to-video
    inputTypes: ['image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 5,
      supportedDurations: [5],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.2,
      currency: 'USD',
    },
    defaultParameters: {
      duration: 5,
      aspectRatio: '16:9',
    },
  },
  // Video Inpaint models
  {
    id: 'jd7h/propainter',
    name: 'ProPainter (Video Inpaint)',
    provider: 'replicate',
    capabilities: ['video-inpaint'],
    inputTypes: ['video', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 60,
      supportedFormats: ['mp4', 'webm'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.08,
      currency: 'USD',
    },
  },
  {
    id: 'ayushunleashed/minimax-remover',
    name: 'MiniMax Remover (Video Object Removal)',
    provider: 'replicate',
    capabilities: ['video-inpaint'],
    inputTypes: ['video', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 60,
      supportedFormats: ['mp4', 'webm'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.1,
      currency: 'USD',
    },
  },
  // Motion Control models
  {
    id: 'kwaivgi/kling-v2.6-motion-control',
    name: 'Kling 2.6 Motion Control',
    provider: 'replicate',
    capabilities: ['motion-control'],
    inputTypes: ['image', 'video'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 10,
      supportedFormats: ['mp4'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.5,
      currency: 'USD',
    },
  },
  // Video Upscale models
  {
    id: 'topazlabs/video-upscale',
    name: 'Topaz Video Upscale',
    provider: 'replicate',
    capabilities: ['video-upscale'],
    inputTypes: ['video'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 120,
      supportedFormats: ['mp4', 'webm'],
      supportedResolutions: ['720p', '1080p', '4k'],
    },
    pricing: {
      unit: 'video',
      inputCost: 0,
      outputCost: 0.5,
      currency: 'USD',
    },
    defaultParameters: {
      targetResolution: '1080p',
      targetFps: 30,
    },
  },
];

/**
 * Map short image model names to full Replicate model paths
 */
export const IMAGE_MODEL_MAP: Record<string, string> = {
  'flux-schnell': 'black-forest-labs/flux-schnell',
  'flux-dev': 'black-forest-labs/flux-dev',
  'flux-pro': 'black-forest-labs/flux-pro',
  'flux-1.1-pro': 'black-forest-labs/flux-1.1-pro',
  sdxl: 'stability-ai/sdxl',
  'stable-diffusion-xl': 'stability-ai/sdxl',
};

/**
 * Map video model IDs to Replicate model paths
 */
export const VIDEO_MODEL_MAP: Record<string, string> = {
  // Kling 2.x models
  'kling-2.6': 'kwaivgi/kling-v2.6',
  'kling-2.5': 'kwaivgi/kling-v2.5-turbo-pro',
  'kling-2.5-turbo': 'kwaivgi/kling-v2.5-turbo-pro',
  'kling-2.1': 'kwaivgi/kling-v2.1',
  'kling-2.0': 'kwaivgi/kling-v2.0',
  // Kling 1.x models
  'kling-1.6-standard': 'kwaivgi/kling-v1.6-standard',
  'kling-1.6-pro': 'kwaivgi/kling-v1.6-pro',
  'kling-1.5-standard': 'kwaivgi/kling-v1.5-standard',
  // MiniMax
  'video-01': 'minimax/video-01',
};

/**
 * Models that do NOT support end_image (last frame) for image-to-video
 */
export const MODELS_WITHOUT_END_IMAGE_SUPPORT = [
  'kling-2.6',
  'kling-2.5',
  'kling-2.5-turbo',
  'kling-2.0',
];
