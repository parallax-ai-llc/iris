/**
 * Node Executor Configuration
 *
 * Constants and configuration mappings for node execution.
 *
 * The API-key lookup is the **SecretProvider / BYOK seam**. The engine reads
 * keys straight from `process.env` (cloud host = server env, local host = the
 * user's own `.env`). The richer per-execution `SecretProvider` port in
 * `./ports` will eventually subsume `getApiKeyForProvider`; until node-executor
 * is fully port-driven, this env-backed default keeps every host working.
 */

/**
 * Default provider and model for nodes that support server-side defaults
 * Analyzer nodes use these defaults so users don't have to configure them
 */
export const DEFAULT_NODE_CONFIGS: Record<
  string,
  { provider: string; model: string }
> = {
  ANALYZE_IMAGE: { provider: 'openai', model: 'gpt-4o' },
  ANALYZE_VIDEO: { provider: 'openai', model: 'gpt-4o' },
  ANALYZE_AUDIO: { provider: 'openai', model: 'gpt-4o-audio-preview' },
  ANALYZE_TEXT: { provider: 'openai', model: 'gpt-4o-mini' },
  ANALYZE_DOCUMENT: { provider: 'openai', model: 'gpt-4o' },
};

/**
 * Mapping of provider names to their environment variable keys
 * Used to look up API keys for each provider
 */
export const API_KEY_ENV_MAPPING: Record<string, string> = {
  // LLM Providers
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
  x: 'XAI_API_KEY', // 'x' is an alias for 'xai'
  perplexity: 'PERPLEXITY_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  // Image Generation Providers
  stability: 'STABILITY_API_KEY',
  fal: 'PIKA_API_KEY', // Fal.ai/Pika uses same API key
  replicate: 'REPLICATE_API_KEY',
  ideogram: 'IDEOGRAM_API_KEY',
  recraft: 'RECRAFT_API_KEY',
  // Video Generation Providers
  runway: 'RUNWAY_API_KEY',
  luma: 'LUMA_API_KEY',
  pika: 'PIKA_API_KEY',
  // Audio Providers
  elevenlabs: 'ELEVENLABS_API_KEY',
  suno: 'SUNO_API_KEY', // Music generation
  // Note: Kling is routed through Replicate (no direct API)
};

/**
 * Get API key for a provider from environment variables.
 *
 * Reads `process.env` directly via {@link API_KEY_ENV_MAPPING} so the engine
 * stays free of any host's config layer. `fal` is intentionally mapped to
 * `PIKA_API_KEY` (Fal.ai/Pika share one key).
 *
 * @param provider - Provider name (case-insensitive)
 * @returns API key string or undefined if not found
 */
export function getApiKeyForProvider(provider: string): string | undefined {
  const envKey = API_KEY_ENV_MAPPING[provider.toLowerCase()];
  if (!envKey) return undefined;
  return process.env[envKey];
}

/**
 * Kling model name mapping to Replicate-compatible model IDs
 * Kling models are available via Replicate without needing direct Kling API keys
 */
export const KLING_MODEL_MAP: Record<string, string> = {
  'kling-v1.6': 'kling-1.6-pro',
  'kling-v1.6-standard': 'kling-1.6-standard',
  'kling-v1.6-pro': 'kling-1.6-pro',
  'kling-v1-standard': 'kling-1.5-standard',
  'kling-v1-pro': 'kling-1.6-pro',
  'kling-v2': 'kling-2.0',
  'kling-v2.0': 'kling-2.0',
  'kling-2.0': 'kling-2.0',
  'kling-2.5': 'kling-2.5',
};

/**
 * Kling 1.x models that only support image-to-video (not text-to-video)
 */
export const KLING_1X_MODELS = [
  'kling-v1.6',
  'kling-v1.6-standard',
  'kling-v1.6-pro',
  'kling-v1-standard',
  'kling-v1-pro',
  'kling-1.6-pro',
  'kling-1.6-standard',
  'kling-1.5-standard',
];

/**
 * Check if a Kling model is a 1.x version (only supports image-to-video)
 * @param modelId - Model ID to check
 * @returns true if model is Kling 1.x
 */
export function isKling1xModel(modelId: string): boolean {
  return KLING_1X_MODELS.some(
    m =>
      modelId.toLowerCase().includes(m.replace('kling-', '')) || modelId === m
  );
}

/**
 * Map Kling model ID to Replicate-compatible model ID
 * @param modelId - Original Kling model ID
 * @returns Replicate-compatible model ID
 */
export function mapKlingModelToReplicate(modelId: string): string {
  return KLING_MODEL_MAP[modelId] || modelId;
}

/**
 * Validate Kling model for text-to-video capability
 * Throws an error if the model doesn't support text-to-video
 *
 * @param modelId - Model ID to validate
 * @param isTextToVideo - Whether the request is for text-to-video
 * @throws Error if Kling 1.x model is used for text-to-video
 */
export function validateKlingModelForTextToVideo(
  modelId: string,
  isTextToVideo: boolean
): void {
  if (isTextToVideo && isKling1xModel(modelId)) {
    throw new Error(
      `Model "${modelId}" does not support text-to-video generation. ` +
        `Kling 1.x models (1.5, 1.6) only support image-to-video. ` +
        `Please use Kling 2.0 or higher for text-to-video, or provide a reference image.`
    );
  }
}
