/**
 * Replicate Provider Utility Functions
 * Pure functions for request building and mapping
 */

import { IMAGE_MODEL_MAP, VIDEO_MODEL_MAP } from './replicate-models.js';

/**
 * Map short model names to full Replicate model paths for image models
 * @param modelId - Short model name or full path
 * @returns Full Replicate model path
 */
export function mapImageModelToReplicatePath(modelId: string): string {
  if (modelId.includes('/')) {
    return modelId;
  }
  return IMAGE_MODEL_MAP[modelId] || modelId;
}

/**
 * Map model ID to Replicate model path for video models
 * @param modelId - Model ID (e.g., 'kling-2.6')
 * @returns Full Replicate model path (e.g., 'kwaivgi/kling-v2.6')
 */
export function mapModelToReplicatePath(modelId: string): string {
  return VIDEO_MODEL_MAP[modelId] || modelId;
}

/**
 * Map aspect ratio to model-specific format
 * @param aspectRatio - Aspect ratio string (e.g., '16:9')
 * @param model - Model identifier for model-specific formatting
 * @returns Mapped aspect ratio string
 */
export function mapAspectRatio(
  aspectRatio: string | undefined,
  model: string
): string {
  if (!aspectRatio) return model === 'sora' ? 'landscape' : '16:9';

  if (model === 'sora') {
    if (aspectRatio === '16:9') return 'landscape';
    if (aspectRatio === '9:16') return 'portrait';
    if (aspectRatio === '1:1') return 'square';
    return 'landscape';
  }

  return aspectRatio;
}

/**
 * Build video input parameters based on model type
 * @param model - Model identifier
 * @param prompt - Text prompt for video generation
 * @param parameters - Additional parameters
 * @param imageUrl - Optional image URL for image-to-video
 * @returns Input object for Replicate API
 */
export function buildVideoInput(
  model: string,
  prompt: string,
  parameters: Record<string, unknown>,
  imageUrl?: string
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt };

  if (model.includes('sora')) {
    const requestedDuration = (parameters.duration as number) || 5;
    if (requestedDuration <= 4) {
      input.seconds = 4;
    } else if (requestedDuration <= 8) {
      input.seconds = 8;
    } else {
      input.seconds = 12;
    }
    input.aspect_ratio = mapAspectRatio(
      parameters.aspectRatio as string,
      'sora'
    );
    if (parameters.seed) input.seed = parameters.seed;
  } else if (model.includes('minimax')) {
    input.prompt_optimizer = true;
    if (parameters.aspectRatio) {
      const ar = parameters.aspectRatio as string;
      if (ar === '16:9') input.aspect_ratio = 'landscape';
      else if (ar === '9:16') input.aspect_ratio = 'portrait';
      else input.aspect_ratio = 'square';
    }
  } else if (model.includes('kling')) {
    input.duration = parameters.duration || 5;
    if (parameters.aspectRatio) {
      input.aspect_ratio = parameters.aspectRatio;
    }
    if (parameters.negativePrompt) {
      input.negative_prompt = parameters.negativePrompt;
    }
    if (parameters.cfgScale) {
      input.cfg_scale = parameters.cfgScale;
    }
    if (imageUrl) {
      input.image = imageUrl;
    }
  } else {
    if (parameters.duration) input.duration = parameters.duration;
    if (parameters.aspectRatio) input.aspect_ratio = parameters.aspectRatio;
  }

  return input;
}

/**
 * Models that support the 'mode' parameter for image-to-video
 * - kling-2.1: supports "standard" / "pro" (note: API uses "standard", not "std")
 * Other Kling models do NOT have a mode parameter
 */
const MODELS_WITH_MODE_SUPPORT = ['kling-2.1'];

/**
 * Map frontend mode values to Replicate API values
 * Frontend uses 'std'/'pro', but kling-2.1 API expects 'standard'/'pro'
 */
function mapModeToApiValue(mode: string): string {
  if (mode === 'std') return 'standard';
  return mode;
}

/**
 * Build Kling-specific input for image-to-video with first/last frame support
 * @param model - Model identifier (e.g., 'kling-2.1', 'kling-2.6')
 * @param prompt - Text prompt
 * @param parameters - Additional parameters
 * @param startFrameUrl - URL of the start frame image
 * @param endFrameUrl - Optional URL of the end frame image
 * @returns Input object for Replicate API
 */
export function buildKlingImageToVideoInput(
  model: string,
  prompt: string,
  parameters: Record<string, unknown>,
  startFrameUrl: string,
  endFrameUrl?: string
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt,
    start_image: startFrameUrl,
    duration: parameters.duration || 5,
  };

  // Only kling-2.1 supports the mode parameter
  // Other models (kling-2.0, kling-2.5, kling-2.6, etc.) do not have this parameter
  if (MODELS_WITH_MODE_SUPPORT.includes(model)) {
    if (endFrameUrl) {
      input.end_image = endFrameUrl;
      // End frame requires 'pro' mode
      input.mode = 'pro';
    } else if (parameters.mode) {
      // Map 'std' to 'standard' for kling-2.1 API
      input.mode = mapModeToApiValue(parameters.mode as string);
    } else {
      // Default to 'standard' mode if not specified
      input.mode = 'standard';
    }
  } else {
    // For models without mode support, just add end_image if provided
    if (endFrameUrl) {
      input.end_image = endFrameUrl;
    }
  }

  // Aspect ratio
  if (parameters.aspectRatio) {
    input.aspect_ratio = parameters.aspectRatio;
  }

  // Negative prompt (not supported on all models)
  if (parameters.negativePrompt) {
    input.negative_prompt = parameters.negativePrompt;
  }

  // CFG scale
  if (parameters.cfgScale) {
    input.cfg_scale = parameters.cfgScale;
  }

  return input;
}

/**
 * Build video upscale input parameters
 * @param _model - Model identifier (unused but kept for API consistency)
 * @param videoUrl - URL of the video to upscale
 * @param parameters - Additional parameters including target resolution and fps
 * @returns Input object for Replicate API
 */
export function buildVideoUpscaleInput(
  _model: string,
  videoUrl: string,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  // Topaz Labs video upscaler (topazlabs/video-upscale)
  // Supports: 720p, 1080p, 4k resolution and fps up to 60
  const upscaleVideo = parameters.upscaleVideo as
    | Record<string, unknown>
    | undefined;

  const input: Record<string, unknown> = {
    video: videoUrl,
    target_resolution:
      upscaleVideo?.targetResolution || parameters.targetResolution || '1080p',
    target_fps: upscaleVideo?.targetFps || parameters.targetFps || 30,
  };

  return input;
}

/**
 * Build video inpaint input parameters for ProPainter model
 * @param videoUrl - URL of the video to inpaint
 * @param maskUrl - URL of the mask
 * @param parameters - Additional parameters
 * @returns Input object for Replicate API
 */
export function buildProPainterInput(
  videoUrl: string,
  maskUrl: string,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  return {
    video: videoUrl,
    mask: maskUrl,
    resize_ratio: parameters.resizeRatio || 1.0,
    dilate_radius: parameters.dilateRadius || 8,
    raft_iter: parameters.raftIter || 20,
    subvideo_length: parameters.subvideoLength || 80,
    neighbor_length: parameters.neighborLength || 10,
    ref_stride: parameters.refStride || 10,
    fp16: parameters.fp16 !== false,
  };
}

/**
 * Build video inpaint input parameters for MiniMax Remover model
 * @param videoUrl - URL of the video
 * @param maskUrl - URL of the mask video
 * @returns Input object for Replicate API
 */
export function buildMiniMaxRemoverInput(
  videoUrl: string,
  maskUrl: string
): Record<string, unknown> {
  return {
    video: videoUrl,
    mask_video: maskUrl,
  };
}

/**
 * Build motion control input parameters
 * @param imageUrl - URL of the reference image
 * @param videoUrl - URL of the motion reference video
 * @param parameters - Additional parameters
 * @returns Input object for Replicate API
 */
export function buildMotionControlInput(
  imageUrl: string,
  videoUrl: string,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  return {
    image: imageUrl,
    video: videoUrl,
    mode: parameters.mode || 'std',
    keep_original_sound: parameters.keepOriginalSound !== false,
    character_orientation: parameters.characterOrientation || 'image',
  };
}

/**
 * Build inpaint input parameters for FLUX Fill Pro
 * @param imageUrl - URL of the source image
 * @param maskUrl - URL of the mask
 * @param prompt - Text prompt for inpainting
 * @param parameters - Additional parameters
 * @returns Input object for Replicate API
 */
export function buildInpaintInput(
  imageUrl: string,
  maskUrl: string,
  prompt: string,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    image: imageUrl,
    mask: maskUrl,
    prompt,
    // Optional parameters with defaults
    guidance: parameters.guidance || 30,
    output_format: parameters.outputFormat || 'png',
    safety_tolerance: parameters.safetyTolerance || 2,
    prompt_upsampling: parameters.promptUpsampling !== false, // default true
  };

  // Add optional parameters if provided
  if (parameters.seed !== undefined) {
    input.seed = parameters.seed;
  }
  if (parameters.steps !== undefined) {
    input.steps = parameters.steps;
  }
  if (parameters.outputQuality !== undefined) {
    input.output_quality = parameters.outputQuality;
  }

  return input;
}
