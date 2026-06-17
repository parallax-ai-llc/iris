/**
 * Image-to-Video model support
 *
 * Lists which video models support the first/last frame image-to-video flow.
 * Mirrors iris/features/iris/components/media/media.constants.ts so iris-desktop
 * stays in sync with the web client.
 */

/** Models that support image-to-video with start + (optional) end frame */
export const IMAGE_TO_VIDEO_SUPPORTED_MODELS = [
  // Kling
  'kling-2.6',
  'kling-2.5',
  'kling-2.5-turbo',
  'kling-2.1',
  'kling-2.0',
  'kling-1.6-standard',
  // Runway
  'gen4_turbo',
  'gen3a_turbo',
  // Seedance (ByteDance via fal.ai) — supports both start and end frames
  'seedance-2.0',
  'seedance-2.0-fast',
] as const;

/** Providers that support image-to-video */
export const IMAGE_TO_VIDEO_SUPPORTED_PROVIDERS = ['kling', 'runway', 'fal'] as const;

/**
 * Models that accept an end frame (last frame) in addition to a start frame.
 * Note: matching strips the 'kling-' prefix to remain consistent with the
 * web iris helper.
 */
export const END_FRAME_SUPPORTED_MODELS = [
  'kling-2.1',
  'kling-1.6-pro',
  'kling-1.6-standard',
  'seedance-2.0',
  'seedance-2.0-fast',
] as const;

export function supportsImageToVideo(modelId: string | undefined, provider?: string): boolean {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  const providerOk = !provider || IMAGE_TO_VIDEO_SUPPORTED_PROVIDERS.includes(provider.toLowerCase() as typeof IMAGE_TO_VIDEO_SUPPORTED_PROVIDERS[number]);
  if (!providerOk) return false;
  return IMAGE_TO_VIDEO_SUPPORTED_MODELS.some((m) => id.includes(m));
}

export function supportsEndFrame(modelId: string | undefined): boolean {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return END_FRAME_SUPPORTED_MODELS.some((m) => id.includes(m.replace('kling-', '')));
}
