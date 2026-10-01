/**
 * Iris API - Token cost operations
 */

import { apiClient } from './client';
import type { TokenCostsResponse } from './types';

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
 * Token cost for a specific model (catalog price; flat node cost for unknown
 * models). Lives in ./media-pricing so the server parity test can load it.
 */
export { calculateModelTokenCost } from './media-pricing';
