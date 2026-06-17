// Subset of iris/web's media.constants used by the editor (vendored verbatim).

export const END_FRAME_SUPPORTED_MODELS = [
  'kling-2.1',
  'kling-1.6-pro',
  'kling-1.6-standard',
  'seedance-2.0',
  'seedance-2.0-fast',
] as const;

export type EndFrameSupportedModel =
  (typeof END_FRAME_SUPPORTED_MODELS)[number];

export const HIDDEN_IMAGE_GENERATION_PROVIDERS = ['perplexity'] as const;
