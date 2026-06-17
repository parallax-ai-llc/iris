/**
 * Token Costs Store
 * Manages token cost data for displaying costs in UI
 */
import { create } from 'zustand';
import { getTokenCosts, calculateModelTokenCost } from '@/shared/api/token.api';
import type { ModelPricingEntry } from '@/shared/api/types';

interface TokenCostsState {
  costs: Record<string, number>;
  descriptions: Record<string, string>;
  modelPricing: Record<string, ModelPricingEntry>;
  loading: boolean;
  error: string | null;
}

interface TokenCostsActions {
  fetchTokenCosts: () => Promise<void>;
  getModelTokenCost: (
    modelId: string,
    nodeType: string,
    params?: { durationSeconds?: number; textLength?: number }
  ) => number;
}

export const useTokenCostsStore = create<TokenCostsState & TokenCostsActions>((set, get) => ({
  costs: {},
  descriptions: {},
  modelPricing: {},
  loading: false,
  error: null,

  fetchTokenCosts: async () => {
    // Skip if already loading or already loaded
    if (get().loading || Object.keys(get().costs).length > 0) return;

    set({ loading: true, error: null });

    try {
      const response = await getTokenCosts();

      if (!response) {
        set({ loading: false, error: 'Failed to fetch token costs' });
        return;
      }

      set({
        costs: response.costs,
        descriptions: response.descriptions,
        modelPricing: response.modelPricing,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch token costs:', error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  getModelTokenCost: (modelId, nodeType, params) => {
    const { modelPricing, costs } = get();
    return calculateModelTokenCost(modelId, nodeType, modelPricing, costs, params);
  },
}));
