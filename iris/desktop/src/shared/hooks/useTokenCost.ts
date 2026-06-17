/**
 * Hook for fetching and calculating token costs
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getTokenCosts, calculateModelTokenCost } from '@/shared/api/token.api';
import type { TokenCostsResponse } from '@/shared/api/types';

// Cache token costs globally to avoid refetching
let cachedTokenCosts: TokenCostsResponse | null = null;
let fetchPromise: Promise<TokenCostsResponse | null> | null = null;

/**
 * Hook to get token cost for a specific operation type
 */
export function useTokenCost(operationType: string): {
  cost: number;
  isLoading: boolean;
  description: string | null;
} {
  const [tokenCosts, setTokenCosts] = useState<TokenCostsResponse | null>(cachedTokenCosts);
  const [isLoading, setIsLoading] = useState(!cachedTokenCosts);

  useEffect(() => {
    if (cachedTokenCosts) {
      setTokenCosts(cachedTokenCosts);
      setIsLoading(false);
      return;
    }

    // Avoid duplicate fetches
    if (!fetchPromise) {
      fetchPromise = getTokenCosts()
        .then((costs) => {
          cachedTokenCosts = costs;
          return costs;
        })
        .catch((err) => {
          // Reset fetchPromise so subsequent calls can retry
          fetchPromise = null;
          console.error('Failed to fetch token costs:', err);
          return null;
        });
    }

    fetchPromise.then((costs) => {
      setTokenCosts(costs);
      setIsLoading(false);
    });
  }, []);

  const cost = useMemo(() => {
    if (!tokenCosts?.costs) return 0;
    return tokenCosts.costs[operationType] ?? 0;
  }, [tokenCosts, operationType]);

  const description = useMemo(() => {
    if (!tokenCosts?.descriptions) return null;
    return tokenCosts.descriptions[operationType] ?? null;
  }, [tokenCosts, operationType]);

  return { cost, isLoading, description };
}

/**
 * Hook to get token cost for a specific model and operation type
 * More accurate than useTokenCost as it uses model-specific pricing
 */
export function useModelTokenCost(
  modelId: string,
  operationType: string,
  params?: { durationSeconds?: number; textLength?: number }
): {
  cost: number;
  isLoading: boolean;
  getModelCost: (modelId: string) => number;
} {
  const [tokenCosts, setTokenCosts] = useState<TokenCostsResponse | null>(cachedTokenCosts);
  const [isLoading, setIsLoading] = useState(!cachedTokenCosts);

  useEffect(() => {
    if (cachedTokenCosts) {
      setTokenCosts(cachedTokenCosts);
      setIsLoading(false);
      return;
    }

    // Avoid duplicate fetches
    if (!fetchPromise) {
      fetchPromise = getTokenCosts()
        .then((costs) => {
          cachedTokenCosts = costs;
          return costs;
        })
        .catch((err) => {
          // Reset fetchPromise so subsequent calls can retry
          fetchPromise = null;
          console.error('Failed to fetch token costs:', err);
          return null;
        });
    }

    fetchPromise.then((costs) => {
      setTokenCosts(costs);
      setIsLoading(false);
    });
  }, []);

  const cost = useMemo(() => {
    if (!tokenCosts) return 0;
    return calculateModelTokenCost(
      modelId,
      operationType,
      tokenCosts.modelPricing || {},
      tokenCosts.costs || {},
      params
    );
  }, [tokenCosts, modelId, operationType, params]);

  const getModelCost = useCallback((newModelId: string) => {
    if (!tokenCosts) return 0;
    return calculateModelTokenCost(
      newModelId,
      operationType,
      tokenCosts.modelPricing || {},
      tokenCosts.costs || {},
      params
    );
  }, [tokenCosts, operationType, params]);

  return { cost, isLoading, getModelCost };
}

/**
 * Format token cost for display as credits (1 credit = 1000 tokens).
 *
 * Accepts a raw token count and returns a credit string. Server-side accounting
 * remains in tokens; only the user-facing label changes.
 */
export function formatTokenCost(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens === 0) return "0";
  const credits = tokens / 1000;
  const abs = Math.abs(credits);
  const sign = credits < 0 ? "-" : "";
  if (abs < 0.1) return `${sign}${trim(abs.toFixed(2))}`;
  if (abs < 1) return `${sign}${trim(abs.toFixed(1))}`;
  if (abs < 10) return `${sign}${trim(abs.toFixed(1))}`;
  if (abs < 1000) return `${sign}${Math.round(abs).toLocaleString()}`;
  if (abs < 1_000_000) {
    const k = abs / 1000;
    return `${sign}${k < 10 ? trim(k.toFixed(1)) : Math.round(k).toString()}K`;
  }
  const m = abs / 1_000_000;
  return `${sign}${m < 10 ? trim(m.toFixed(1)) : Math.round(m).toString()}M`;
}

function trim(s: string): string {
  return s.replace(/\.?0+$/, "") || "0";
}

/**
 * Alias for {@link formatTokenCost} using the user-facing "credit" terminology.
 */
export const formatCredits = formatTokenCost;

/**
 * Token cost badge component props
 */
export interface TokenCostBadgeProps {
  cost: number;
  isLoading?: boolean;
  className?: string;
}
