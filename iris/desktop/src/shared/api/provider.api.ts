/**
 * Provider API - Fetch base models from server
 * Uses /bases endpoint to get models with imageGeneration/videoGeneration capabilities
 */

import { apiClient } from './client';

/**
 * Base LLM Model interface (mirrors server BaseLLMModel)
 */
export interface BaseModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  alias?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  knowledgeCutoff?: string;
  pricing?: {
    input?: number;
    cachedInput?: number;
    output?: number;
  };
  modalities?: {
    text?: string[];
    image?: string[];
    audio?: string[];
  };
  chat: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  imageRequired?: boolean;
  supportedDurations?: number[];
  supportedAspectRatios?: string[];
  webSearch: boolean;
  isFreeUserAccessible: boolean;
  isFast: boolean;
  isExpert: boolean;
  greetingMessage?: string;
  language?: string;
  description?: string;
  profileImageThumbnail?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

interface BasesResponse {
  models: BaseModel[];
}

// Cache for base models
let cachedModels: BaseModel[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all base models from server
 * Results are cached for 5 minutes
 */
export async function getBaseModels(forceRefresh = false): Promise<BaseModel[]> {
  const now = Date.now();
  
  // Return cached if valid
  if (!forceRefresh && cachedModels && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedModels;
  }

  const response = await apiClient.get<BasesResponse>('/bases', {
    requireAuth: false, // bases endpoint is public
  });

  if (response.success && response.data) {
    // Deduplicate by model id (server may return duplicates for aliased models)
    const seen = new Set<string>();
    cachedModels = (response.data.models || []).filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    cacheTimestamp = now;
    return cachedModels;
  }

  // Return cached on error if available
  if (cachedModels) {
    return cachedModels;
  }

  return [];
}

/**
 * Get image generation models
 */
export async function getImageModels(): Promise<BaseModel[]> {
  const models = await getBaseModels();
  return models.filter(m => m.imageGeneration);
}

/**
 * Get video generation models
 */
export async function getVideoModels(): Promise<BaseModel[]> {
  const models = await getBaseModels();
  return models.filter(m => m.videoGeneration);
}

/**
 * Get chat models
 */
export async function getChatModels(): Promise<BaseModel[]> {
  const models = await getBaseModels();
  return models.filter(m => m.chat);
}

/**
 * Clear model cache (call after user login/logout)
 */
export function clearModelCache(): void {
  cachedModels = null;
  cacheTimestamp = 0;
}
