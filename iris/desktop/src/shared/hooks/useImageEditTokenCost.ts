/**
 * Credits (in tokens) shown before running a server image edit mode.
 *
 * Priced by the processing model the server actually calls for that mode
 * (shared/api/media-pricing.ts ↔ core/server media-generation-pricing.ts), so
 * the shown amount equals the deducted amount.
 */

import { useEffect, useMemo } from 'react';
import { useTokenCostsStore } from '@/shared/stores/token-costs';
import {
  calculateImageEditTokenCost,
  type ImageEditPricingOptions,
} from '@/shared/api/media-pricing';

export function useImageEditTokenCost(
  editMode: string,
  options: ImageEditPricingOptions = {}
): { cost: number; isLoading: boolean } {
  const fetchTokenCosts = useTokenCostsStore((s) => s.fetchTokenCosts);
  const modelPricing = useTokenCostsStore((s) => s.modelPricing);
  const costs = useTokenCostsStore((s) => s.costs);
  const isLoading = useTokenCostsStore((s) => s.loading);

  useEffect(() => {
    fetchTokenCosts();
  }, [fetchTokenCosts]);

  const { upscaleType, faceRestoreModel } = options;
  const cost = useMemo(
    () => calculateImageEditTokenCost(editMode, { modelPricing, costs }, { upscaleType, faceRestoreModel }),
    [editMode, modelPricing, costs, upscaleType, faceRestoreModel]
  );
  return { cost, isLoading };
}
