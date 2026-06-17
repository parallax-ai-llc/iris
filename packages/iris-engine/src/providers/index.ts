/**
 * Parallax Iris - Provider Adapter Registry
 */

import { BaseProviderAdapter, IProviderAdapter } from './base-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { XAIAdapter } from './xai-adapter.js';
import { PerplexityAdapter } from './perplexity-adapter.js';
import { DeepSeekAdapter } from './deepseek-adapter.js';
import { RunwayAdapter } from './runway-adapter.js';
import { StabilityAdapter } from './stability-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import { KlingAdapter } from './kling-adapter.js';
import { LumaAdapter } from './luma-adapter.js';
import { FalAdapter } from './fal-adapter.js';
import { ReplicateAdapter } from './replicate-adapter.js';
import { ElevenLabsAdapter } from './elevenlabs-adapter.js';
import { IdeogramAdapter } from './ideogram-adapter.js';
import { RecraftAdapter } from './recraft-adapter.js';
import { BflAdapter } from './bfl-adapter.js';
import { SunoAdapter } from './suno-adapter.js';
import { ProviderName, ProviderCredentials } from '../types.js';
import { ProviderNotFoundError } from '../errors.js';

// Export adapter classes
export { BaseProviderAdapter } from './base-adapter.js';
export type { IProviderAdapter } from './base-adapter.js';
export { OpenAIAdapter } from './openai-adapter.js';
export { AnthropicAdapter } from './anthropic-adapter.js';
export { XAIAdapter } from './xai-adapter.js';
export { PerplexityAdapter } from './perplexity-adapter.js';
export { DeepSeekAdapter } from './deepseek-adapter.js';
export { RunwayAdapter } from './runway-adapter.js';
export { StabilityAdapter } from './stability-adapter.js';
export { GoogleAdapter } from './google-adapter.js';
export { KlingAdapter } from './kling-adapter.js';
export { LumaAdapter } from './luma-adapter.js';
export { FalAdapter } from './fal-adapter.js';
export { ReplicateAdapter } from './replicate-adapter.js';
export { ElevenLabsAdapter } from './elevenlabs-adapter.js';
export { IdeogramAdapter } from './ideogram-adapter.js';
export { RecraftAdapter } from './recraft-adapter.js';
export { BflAdapter } from './bfl-adapter.js';
export { SunoAdapter } from './suno-adapter.js';

// Standalone provider functions (not class adapters) — these were previously
// dynamically imported by file path from the server; the engine surfaces them
// from the registry so hosts can reach them via the package root.
//
// The granular helpers (cache keys, id/timestamp parsers, test seams) are
// surfaced too: classic-node consumers can only import the package root (no
// subpath exports), so anything a host or test needs must live at the root.
export {
  perplexitySearch,
  buildCacheKey,
  __clearPerplexitySearchCache,
  __setPerplexityFetchImpl,
  __resetPerplexityFetchImpl,
} from './perplexity-search-adapter.js';
export { webScrape } from './web-scraper-adapter.js';
export {
  fetchYoutubeTranscript,
  extractVideoId,
  formatTimestamp,
} from './youtube-transcript-adapter.js';

// Export utilities
export * from './media-utils.js';
export * from './response-builder.js';

// ============================================================
// ADAPTER REGISTRY
// ============================================================

/** Factory function type for creating adapters */
type AdapterFactory = () => BaseProviderAdapter;

/** Provider name aliases (maps legacy/alternate names to canonical names) */
const providerAliases: Record<string, ProviderName> = {
  x: 'xai', // 'x' is commonly used in the codebase but adapter uses 'xai'
};

/**
 * Normalize provider name to canonical form
 * Maps aliases like 'x' to 'xai'
 */
export function normalizeProviderName(providerName: string): string {
  const normalized = providerName.toLowerCase();
  return providerAliases[normalized] || normalized;
}

/** Registry of all available adapters */
const adapterRegistry = new Map<ProviderName, AdapterFactory>();
adapterRegistry.set('openai', () => new OpenAIAdapter());
adapterRegistry.set('anthropic', () => new AnthropicAdapter());
adapterRegistry.set('xai', () => new XAIAdapter());
adapterRegistry.set('perplexity', () => new PerplexityAdapter());
adapterRegistry.set('deepseek', () => new DeepSeekAdapter());
adapterRegistry.set('google', () => new GoogleAdapter());
adapterRegistry.set('stability', () => new StabilityAdapter());
adapterRegistry.set('runway', () => new RunwayAdapter());
adapterRegistry.set('kling', () => new KlingAdapter());
adapterRegistry.set('luma', () => new LumaAdapter());
adapterRegistry.set('fal', () => new FalAdapter());
adapterRegistry.set('replicate', () => new ReplicateAdapter());
adapterRegistry.set('elevenlabs', () => new ElevenLabsAdapter());
adapterRegistry.set('ideogram', () => new IdeogramAdapter());
adapterRegistry.set('recraft', () => new RecraftAdapter());
adapterRegistry.set('bfl', () => new BflAdapter());
adapterRegistry.set('suno', () => new SunoAdapter());

/**
 * Get list of available provider names
 */
export function getAvailableProviders(): ProviderName[] {
  return Array.from(adapterRegistry.keys());
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(
  providerName: string
): providerName is ProviderName {
  const normalized = normalizeProviderName(providerName);
  return adapterRegistry.has(normalized as ProviderName);
}

/**
 * Create an adapter instance for a provider
 */
export function createAdapter(
  providerName: ProviderName | string
): BaseProviderAdapter {
  const normalized = normalizeProviderName(providerName) as ProviderName;
  const factory = adapterRegistry.get(normalized);

  if (!factory) {
    throw new ProviderNotFoundError(providerName);
  }

  return factory();
}

/**
 * Create and initialize an adapter with credentials
 */
export async function createAndInitializeAdapter(
  providerName: ProviderName,
  credentials: ProviderCredentials
): Promise<IProviderAdapter> {
  const adapter = createAdapter(providerName);
  await adapter.initialize(credentials);
  return adapter;
}

// ============================================================
// ADAPTER POOL (for reusing initialized adapters)
// ============================================================

/** Cache of initialized adapters per user */
const adapterCache: Map<
  string,
  Map<ProviderName, IProviderAdapter>
> = new Map();

/**
 * Get or create an initialized adapter for a user
 */
export async function getOrCreateAdapter(
  userId: string,
  providerName: ProviderName,
  credentials: ProviderCredentials
): Promise<IProviderAdapter> {
  // Get user's adapter cache
  let userAdapters = adapterCache.get(userId);
  if (!userAdapters) {
    userAdapters = new Map();
    adapterCache.set(userId, userAdapters);
  }

  // Check if adapter already exists
  let adapter = userAdapters.get(providerName);

  if (!adapter) {
    // Create and initialize new adapter
    adapter = await createAndInitializeAdapter(providerName, credentials);
    userAdapters.set(providerName, adapter);
  }

  return adapter;
}

/**
 * Clear cached adapters for a user
 */
export function clearUserAdapters(userId: string): void {
  adapterCache.delete(userId);
}

/**
 * Clear all cached adapters
 */
export function clearAllAdapters(): void {
  adapterCache.clear();
}

// ============================================================
// CAPABILITY LOOKUP
// ============================================================

import { AICapability, ModelInfo } from '../types.js';

/**
 * Get all models that support a specific capability
 */
export function getModelsForCapability(capability: AICapability): ModelInfo[] {
  const models: ModelInfo[] = [];

  for (const providerName of adapterRegistry.keys()) {
    const adapter = createAdapter(providerName);

    for (const model of adapter.models) {
      if (model.capabilities.includes(capability)) {
        models.push(model);
      }
    }
  }

  return models;
}

/**
 * Get all providers that support a specific capability
 */
export function getProvidersForCapability(
  capability: AICapability
): ProviderName[] {
  const providers: ProviderName[] = [];

  for (const providerName of adapterRegistry.keys()) {
    const adapter = createAdapter(providerName);

    if (adapter.supportsCapability(capability)) {
      providers.push(providerName);
    }
  }

  return providers;
}

/**
 * Get all available capabilities across all providers
 */
export function getAllCapabilities(): AICapability[] {
  const capabilities = new Set<AICapability>();

  for (const providerName of adapterRegistry.keys()) {
    const adapter = createAdapter(providerName);

    for (const cap of adapter.capabilities) {
      capabilities.add(cap);
    }
  }

  return Array.from(capabilities);
}

/**
 * Get all available models across all providers
 */
export function getAllModels(): ModelInfo[] {
  const models: ModelInfo[] = [];

  for (const providerName of adapterRegistry.keys()) {
    const adapter = createAdapter(providerName);
    models.push(...adapter.models);
  }

  return models;
}
