/**
 * Iris media pricing (desktop screen side).
 *
 * The amount shown before a generation/edit must equal the amount the server
 * deducts. The server computes it in
 * `core/server/src/modules/iris/assets/media-generation-pricing.ts`; this file
 * mirrors that table and formula, and
 * `core/server/tests/unit/modules/iris-media-generation-pricing.test.ts`
 * imports this file to lock both to the same numbers. iris/web keeps the same
 * copy in `lib/apis/iris/media-pricing.ts`.
 *
 * Pure module on purpose (no imports): the server test loads it directly.
 */

export interface PricingEntry {
  costPerUnit: number;
  unit: string;
}

/** `GET /api/iris/token-costs` → `{ modelPricing, costs }` */
export interface PricingTable {
  modelPricing: Record<string, PricingEntry>;
  costs: Record<string, number>;
}

const MARKUP_MULTIPLIER = 1.1;
const TOKENS_PER_DOLLAR = 100_000;

/**
 * Token cost of one call to `modelId` (catalog price + 10% markup, $1 = 100K
 * tokens). Models outside the catalog fall back to the flat node cost.
 * Same formula as core/server `calculateModelTokenCost`.
 */
export function calculateModelTokenCost(
  modelId: string,
  nodeType: string,
  modelPricing: Record<string, PricingEntry>,
  fallbackCosts: Record<string, number>,
  params?: { durationSeconds?: number; textLength?: number }
): number {
  const pricing = modelPricing[modelId];
  if (!pricing) return fallbackCosts[nodeType] ?? 0;

  let apiCost: number;
  switch (pricing.unit) {
    case 'per-second':
      apiCost = pricing.costPerUnit * (params?.durationSeconds ?? 5);
      break;
    case 'per-1k-chars':
      apiCost = pricing.costPerUnit * ((params?.textLength ?? 500) / 1000);
      break;
    case 'per-image':
    case 'per-request':
    default:
      apiCost = pricing.costPerUnit;
      break;
  }

  return Math.ceil(apiCost * MARKUP_MULTIPLIER * TOKENS_PER_DOLLAR);
}

// ==================== Image edit modes ====================

export interface PricedModel {
  modelId: string;
  nodeType: string;
}

/** Edit mode → the processing model the server actually calls (generation-registry.ts). */
export const IMAGE_EDIT_PRICING: Record<string, PricedModel> = {
  upscale: { modelId: 'recraft-crisp-upscale', nodeType: 'EDIT_IMAGE_UPSCALE' },
  bgRemove: { modelId: 'recraft-remove-background', nodeType: 'EDIT_IMAGE_BG_REMOVE' },
  inpaint: { modelId: 'stability-inpaint', nodeType: 'EDIT_IMAGE_INPAINT' },
  subject: { modelId: 'stability-inpaint', nodeType: 'EDIT_IMAGE_INPAINT' },
  outpaint: { modelId: 'stability-outpaint', nodeType: 'EDIT_IMAGE_OUTPAINT' },
  angle: { modelId: 'gemini-3-pro-image', nodeType: 'GEN_IMAGE_TO_IMAGE' },
  faceRestore: { modelId: 'codeformer', nodeType: 'EDIT_IMAGE_FACE_RESTORE' },
  colorize: { modelId: 'ddcolor', nodeType: 'EDIT_IMAGE_COLORIZE' },
  skyReplace: { modelId: 'stable-image-sky-replace', nodeType: 'EDIT_IMAGE_SKY_REPLACE' },
  relight: { modelId: 'fal-ai/iclight-v2', nodeType: 'EDIT_IMAGE_RELIGHT' },
  autoEnhance: { modelId: 'stable-image-auto-enhance', nodeType: 'EDIT_IMAGE_AUTO_ENHANCE' },
};

export interface ImageEditPricingOptions {
  /** 'crisp' (default) | 'creative' */
  upscaleType?: unknown;
  /** 'codeformer' (default) | 'gfpgan' */
  faceRestoreModel?: unknown;
}

export function resolveImageEditPricedModel(
  editMode: string | undefined,
  options: ImageEditPricingOptions = {}
): PricedModel | null {
  if (!editMode || !Object.prototype.hasOwnProperty.call(IMAGE_EDIT_PRICING, editMode)) {
    return null;
  }
  if (editMode === 'upscale' && options.upscaleType === 'creative') {
    return { modelId: 'recraft-creative-upscale', nodeType: 'EDIT_IMAGE_UPSCALE' };
  }
  if (editMode === 'faceRestore') {
    return {
      modelId: options.faceRestoreModel === 'gfpgan' ? 'gfpgan' : 'codeformer',
      nodeType: 'EDIT_IMAGE_FACE_RESTORE',
    };
  }
  return IMAGE_EDIT_PRICING[editMode];
}

/** One run of an image edit mode (one output image). 0 for modes the server does not price. */
export function calculateImageEditTokenCost(
  editMode: string,
  pricing: PricingTable,
  options: ImageEditPricingOptions = {}
): number {
  const priced = resolveImageEditPricedModel(editMode, options);
  if (!priced) return 0;
  return calculateModelTokenCost(priced.modelId, priced.nodeType, pricing.modelPricing, pricing.costs);
}

/**
 * Crop runs locally on the server (sharp) and is never charged, so the screen
 * shows no price for it.
 */
export const IMAGE_CROP_TOKEN_COST = 0;

// ==================== Plain generation ====================

/** Models the server dispatches when the request names none (assets.service.ts). */
export const DEFAULT_GENERATION_MODELS = {
  IMAGE: 'gpt-image-1',
  VIDEO: 'veo-3.1-generate-001',
} as const;

/** Post-generation upscale add-on calls Ideogram; 4x is two 2x passes. */
export const UPSCALE_ADDON_MODEL = 'ideogram-upscale';

export function calculateUpscaleAddOnTokens(scale: unknown, pricing: PricingTable): number {
  const base = calculateModelTokenCost(
    UPSCALE_ADDON_MODEL,
    'GEN_IMAGE_UPSCALE',
    pricing.modelPricing,
    pricing.costs
  );
  return scale === 4 ? base * 2 : base;
}

/** Post-generation background removal (remove.bg, outside the catalog) uses the flat node cost. */
export function calculateRemoveBackgroundAddOnTokens(pricing: PricingTable): number {
  return pricing.costs['GEN_BACKGROUND_REMOVE'] ?? 0;
}

/** Cinema Studio: a video reference discounts each generation by this ratio. */
export const CINEMA_VIDEO_REF_DISCOUNT = 0.6;

/** Discount is applied per generation and rounded up to whole tokens (as the server does). */
export function applyCinemaVideoReferenceDiscount(itemTokens: number, hasVideoReference: boolean): number {
  return hasVideoReference ? Math.ceil(itemTokens * CINEMA_VIDEO_REF_DISCOUNT) : itemTokens;
}

export interface MediaGenerationEstimateInput {
  /** Server edit mode that will run (inpaint, angle, …); undefined for plain generation. */
  editMode?: string;
  /** Model the server will call for plain generation. Empty → server default for the asset type. */
  modelId?: string;
  assetType: 'IMAGE' | 'VIDEO';
  durationSeconds?: number;
  itemCount: number;
  upscaleType?: unknown;
  faceRestoreModel?: unknown;
  upscale?: boolean;
  upscaleScale?: unknown;
  removeBackground?: boolean;
  cinemaVideoReference?: boolean;
}

export interface MediaGenerationEstimate {
  perItemTokens: number;
  totalTokens: number;
}

/** Mirrors core/server `priceMediaGeneration` (total = per item × items). */
export function estimateMediaGenerationTokens(
  input: MediaGenerationEstimateInput,
  pricing: PricingTable
): MediaGenerationEstimate {
  const itemCount = Math.max(1, Math.floor(input.itemCount || 1));
  const edit = resolveImageEditPricedModel(input.editMode, {
    upscaleType: input.upscaleType,
    faceRestoreModel: input.faceRestoreModel,
  });
  if (edit) {
    const perItemTokens = calculateModelTokenCost(edit.modelId, edit.nodeType, pricing.modelPricing, pricing.costs);
    return { perItemTokens, totalTokens: perItemTokens * itemCount };
  }

  const modelId = input.modelId || DEFAULT_GENERATION_MODELS[input.assetType];
  const nodeType = input.assetType === 'IMAGE' ? 'GEN_TEXT_TO_IMAGE' : 'GEN_TEXT_TO_VIDEO';
  const base = applyCinemaVideoReferenceDiscount(
    calculateModelTokenCost(modelId, nodeType, pricing.modelPricing, pricing.costs, {
      durationSeconds: input.durationSeconds,
    }),
    Boolean(input.cinemaVideoReference)
  );
  const isImage = input.assetType === 'IMAGE';
  const upscale = isImage && input.upscale ? calculateUpscaleAddOnTokens(input.upscaleScale, pricing) : 0;
  const removeBackground = isImage && input.removeBackground ? calculateRemoveBackgroundAddOnTokens(pricing) : 0;
  const perItemTokens = base + upscale + removeBackground;
  return { perItemTokens, totalTokens: perItemTokens * itemCount };
}

/** Upscale / background removal on an existing image without generating (no model selected). */
export function estimatePostProcessingOnlyTokens(
  input: { upscale?: boolean; upscaleScale?: unknown; removeBackground?: boolean },
  pricing: PricingTable
): number {
  return (
    (input.upscale ? calculateUpscaleAddOnTokens(input.upscaleScale, pricing) : 0) +
    (input.removeBackground ? calculateRemoveBackgroundAddOnTokens(pricing) : 0)
  );
}
