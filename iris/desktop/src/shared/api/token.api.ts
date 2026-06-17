/**
 * Iris API - Token cost operations
 */

import { apiClient } from './client';
import type { ModelPricingEntry, TokenCostsResponse } from './types';

/**
 * Get all node token costs
 */
export async function getTokenCosts(): Promise<TokenCostsResponse | null> {
  try {
    const response = await apiClient.get<TokenCostsResponse>('/api/iris/token-costs', { requireAuth: false });

    if (!response.success || !response.data) {
      console.error('Failed to fetch token costs:', response.error);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch token costs:', error);
    return null;
  }
}

/**
 * Calculate estimated tokens for a workflow based on node types
 */
export function calculateWorkflowTokens(nodeTypes: string[], costs: Record<string, number>): number {
  return nodeTypes.reduce((sum, type) => sum + (costs[type] ?? 0), 0);
}

/**
 * Calculate token cost for a specific model.
 * Falls back to the flat category cost for unknown models.
 */
const MARKUP_MULTIPLIER = 1.10;
const TOKENS_PER_DOLLAR = 100_000;

export function calculateModelTokenCost(
  modelId: string,
  nodeType: string,
  modelPricing: Record<string, ModelPricingEntry>,
  fallbackCosts: Record<string, number>,
  params?: { durationSeconds?: number; textLength?: number }
): number {
  const pricing = modelPricing[modelId];
  if (!pricing) return fallbackCosts[nodeType] ?? 0;

  let apiCost: number;
  switch (pricing.unit) {
    case 'per-image':
    case 'per-request':
      apiCost = pricing.costPerUnit;
      break;
    case 'per-second':
      apiCost = pricing.costPerUnit * (params?.durationSeconds ?? 5);
      break;
    case 'per-1k-chars':
      apiCost = pricing.costPerUnit * ((params?.textLength ?? 500) / 1000);
      break;
  }

  return Math.ceil(apiCost * MARKUP_MULTIPLIER * TOKENS_PER_DOLLAR);
}
