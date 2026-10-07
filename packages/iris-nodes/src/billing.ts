/**
 * Node billing rules — the one place that decides WHAT a workflow node is
 * billed on (which model price, how many seconds, how many characters, which
 * multiplier). Every side that talks about a node's cost uses it:
 *
 *   - the editor's run-cost estimate (before the run),
 *   - the engine's balance check (right before the node runs),
 *   - the engine's charge (right after the node succeeds).
 *
 * Prices themselves are NOT here. They come from the host as two tables:
 * a model price table (`modelPricing`, keyed by model id) and flat per-node
 * costs (`flatCosts`, used when a model has no catalog price). A host that
 * does not meter (local / self-host) simply never calls these.
 *
 * Pure data + pure functions only: no I/O, no host imports.
 */

import type { NodeDefinition } from './types.js';
import * as trigger from './nodes/trigger.js';
import * as generator from './nodes/generator.js';
import * as analyzer from './nodes/analyzer.js';
import * as editor from './nodes/editor.js';
import * as utility from './nodes/utility.js';
import * as web from './nodes/web.js';
import * as output from './nodes/output.js';

const DEFINITIONS: Record<string, NodeDefinition> = {
  ...trigger,
  ...generator,
  ...analyzer,
  ...editor,
  ...utility,
  ...web,
  ...output,
};

// ─── Price arithmetic ──────────────────────────────────────────────────────

/**
 * Provider cost is marked up by 40% (x1.4). This is the one markup every
 * credit charge uses: core/server and core/llm import it, and apps that cannot
 * import iris-nodes are pinned to it by drift tests.
 */
export const BILLING_MARKUP_MULTIPLIER = 1.4;
/** $1 of (marked-up) provider cost = 100,000 tokens (= 100 credits). */
export const BILLING_TOKENS_PER_USD = 100_000;
/** Seconds billed for a per-second model when the length is not known. */
export const BILLING_DEFAULT_SECONDS = 5;
/** Characters billed for a per-1k-chars model when the text is not known. */
export const BILLING_DEFAULT_TEXT_LENGTH = 500;

/** One entry of the host's model price table. */
export interface BillingModelPrice {
  costPerUnit: number;
  /** 'per-image' | 'per-request' | 'per-second' | 'per-1k-chars' */
  unit: string;
}

/**
 * Chat-model token rates in USD per 1M tokens — the agent-models catalog's
 * `inputCostPer1M` / `outputCostPer1M`, the same numbers chat is billed on.
 * `cacheRead` / `cacheWrite` price prompt-cache tokens (Anthropic); without
 * them cache tokens are priced as regular input.
 */
export interface BillingChatPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface NodeBillingPrices {
  modelPricing: Record<string, BillingModelPrice | undefined>;
  flatCosts: Record<string, number | undefined>;
  /**
   * Chat-model rates keyed by model id, for nodes billed on their LLM token
   * usage. Only a host that charges supplies it; the editor's estimate does
   * not need it (usage-based nodes are flagged, not totalled).
   */
  chatPricing?: Record<string, BillingChatPrice | undefined>;
  /** Rates for a chat model `chatPricing` does not list (core/llm default). */
  defaultChatPrice?: BillingChatPrice;
}

/** Provider-reported LLM token usage of one node run. */
export interface LlmTokenUsage {
  /** Input tokens billed at the regular input rate (excludes cache tokens). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** What a single run of a node is billed on. */
export interface NodeBillingParams {
  /** Model whose catalog price applies. */
  modelId?: string;
  /** Used when `modelId` has no catalog price (the tool's fixed model). */
  fallbackModelId?: string;
  durationSeconds?: number;
  textLength?: number;
  /** Mode multiplier (pro / 4K = 2). Applies to catalog prices only. */
  multiplier?: number;
  /** Usage-based nodes: the actual provider cost in USD. Wins when > 0. */
  usdCost?: number;
  /**
   * Usage-based LLM nodes: the provider-reported token usage. Priced at the
   * chat rates of `modelId`; wins over `usdCost` when the model has a rate.
   */
  llmUsage?: LlmTokenUsage;
}

/** Marked-up USD → tokens. */
export function usdToBillingTokens(usd: number): number {
  return Math.ceil(usd * BILLING_MARKUP_MULTIPLIER * BILLING_TOKENS_PER_USD);
}

/**
 * Chat rates of a model: exact id first, then the longest id the model string
 * contains or is contained in (same lookup as core/llm `findModelPricing`, so
 * a dated provider id resolves to its catalog entry).
 */
export function findBillingChatPrice(
  table: Record<string, BillingChatPrice | undefined> | undefined,
  modelId: string | undefined
): BillingChatPrice | undefined {
  if (!table || !modelId) return undefined;
  const exact = table[modelId];
  if (exact) return exact;
  let bestKey = '';
  for (const key of Object.keys(table)) {
    if (!table[key]) continue;
    if (!modelId.includes(key) && !key.includes(modelId)) continue;
    if (key.length > bestKey.length) bestKey = key;
  }
  return bestKey ? table[bestKey] : undefined;
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/** USD cost of an LLM usage at the given per-1M-token rates. */
export function llmUsageUsd(
  usage: LlmTokenUsage,
  price: BillingChatPrice
): number {
  return (
    (nonNegative(usage.inputTokens) * price.input +
      nonNegative(usage.cacheReadTokens) * (price.cacheRead ?? price.input) +
      nonNegative(usage.cacheWriteTokens) * (price.cacheWrite ?? price.input) +
      nonNegative(usage.outputTokens) * price.output) /
    1_000_000
  );
}

function priceFor(
  prices: NodeBillingPrices,
  params: NodeBillingParams
): BillingModelPrice | undefined {
  const candidates = [params.modelId, params.fallbackModelId];
  for (const id of candidates) {
    if (!id) continue;
    const entry = prices.modelPricing[id];
    if (entry && Number.isFinite(entry.costPerUnit)) return entry;
  }
  return undefined;
}

/**
 * Tokens one run of a node costs.
 *
 * - `llmUsage` (usage-based LLM node): the tokens at the model's catalog chat
 *   rates, marked up. A model the catalog does not list falls back to the
 *   provider cost the engine reported (`usdCost`), then to the default chat
 *   rates.
 * - `usdCost > 0` (usage-based node): the marked-up actual cost.
 * - A model with a catalog price: unit price × seconds / chars, marked up,
 *   then × `multiplier`.
 * - Otherwise: the node's flat cost (no multiplier).
 */
export function computeNodeBillingTokens(
  nodeType: string,
  params: NodeBillingParams,
  prices: NodeBillingPrices
): number {
  if (params.llmUsage) {
    const catalogRate = findBillingChatPrice(
      prices.chatPricing,
      params.modelId
    );
    const rate =
      catalogRate ??
      (params.usdCost !== undefined && params.usdCost > 0
        ? undefined
        : prices.defaultChatPrice);
    const usd = rate ? llmUsageUsd(params.llmUsage, rate) : 0;
    if (usd > 0) return usdToBillingTokens(usd);
  }

  if (params.usdCost !== undefined && params.usdCost > 0) {
    return usdToBillingTokens(params.usdCost);
  }

  const price = priceFor(prices, params);
  if (!price) return prices.flatCosts[nodeType] ?? 0;

  let apiCost: number;
  switch (price.unit) {
    case 'per-image':
    case 'per-request':
      apiCost = price.costPerUnit;
      break;
    case 'per-second':
      apiCost =
        price.costPerUnit * (params.durationSeconds ?? BILLING_DEFAULT_SECONDS);
      break;
    case 'per-1k-chars':
      apiCost =
        price.costPerUnit *
        ((params.textLength ?? BILLING_DEFAULT_TEXT_LENGTH) / 1000);
      break;
    default:
      return prices.flatCosts[nodeType] ?? 0;
  }

  return usdToBillingTokens(apiCost) * (params.multiplier ?? 1);
}

// ─── What each node is billed on ───────────────────────────────────────────

/**
 * Default model per node type when the node config has none. The engine runs
 * these nodes with this model, so billing uses it too.
 */
export const IRIS_DEFAULT_NODE_MODELS: Record<
  string,
  { provider: string; model: string }
> = {
  ANALYZE_IMAGE: { provider: 'openai', model: 'gpt-4o' },
  ANALYZE_VIDEO: { provider: 'openai', model: 'gpt-4o' },
  ANALYZE_AUDIO: { provider: 'openai', model: 'gpt-4o-audio-preview' },
  ANALYZE_TEXT: { provider: 'openai', model: 'gpt-4o-mini' },
  ANALYZE_DOCUMENT: { provider: 'openai', model: 'gpt-4o' },
};

/** Default transcription model of GEN_VIDEO_SUBTITLE. */
export const VIDEO_SUBTITLE_DEFAULT_MODEL = 'gpt-4o-mini-transcribe';
/** Default model of GEN_TEXT_TO_TEXT in agent mode. */
export const AGENT_MODE_DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Catalog model ids the video editing tools are priced on. The direct tools
 * (iris.parallax.kr video upscale / inpaint / motion control) charge these
 * prices, so the workflow nodes use the same ones.
 */
export const VIDEO_EDIT_BILLING_MODELS = {
  EDIT_VIDEO_UPSCALE: 'topazlabs-video-upscale',
  EDIT_VIDEO_INPAINT: 'veo2-video-inpaint',
} as const;

/** Motion Control version → catalog model id (price) and Replicate model. */
export const MOTION_CONTROL_BILLING_MODELS = {
  'v2.6': {
    catalogId: 'kling-motion-control',
    replicateModel: 'kwaivgi/kling-v2.6-motion-control',
  },
  v3: {
    catalogId: 'kling-v3-motion-control',
    replicateModel: 'kwaivgi/kling-v3-motion-control',
  },
} as const;

export function resolveMotionControlBillingModel(version: unknown) {
  return MOTION_CONTROL_BILLING_MODELS[version === 'v3' ? 'v3' : 'v2.6'];
}

/** AI image editor nodes: billed per image on the configured model. */
export const AI_IMAGE_EDITOR_NODE_TYPES = [
  'EDIT_IMAGE_INPAINT',
  'EDIT_IMAGE_OUTPAINT',
  'EDIT_IMAGE_STYLE',
  'EDIT_IMAGE_FACE_SWAP',
  'EDIT_IMAGE_BG_REMOVE',
  'EDIT_IMAGE_UPSCALE',
  'EDIT_IMAGE_SKY_REPLACE',
  'EDIT_IMAGE_RELIGHT',
  'EDIT_IMAGE_AUTO_ENHANCE',
] as const;

/** AI video editor nodes: billed per second of the input video. */
export const AI_VIDEO_EDITOR_NODE_TYPES = [
  'EDIT_VIDEO_UPSCALE',
  'EDIT_VIDEO_INPAINT',
  'EDIT_MOTION_CONTROL',
] as const;

/** AI audio editor nodes: billed per run of the provider model. */
export const AI_AUDIO_EDITOR_NODE_TYPES = ['EDIT_AUDIO_SEPARATE'] as const;

export function isAIEditorNodeType(nodeType: string): boolean {
  return (
    (AI_IMAGE_EDITOR_NODE_TYPES as readonly string[]).includes(nodeType) ||
    (AI_VIDEO_EDITOR_NODE_TYPES as readonly string[]).includes(nodeType) ||
    (AI_AUDIO_EDITOR_NODE_TYPES as readonly string[]).includes(nodeType)
  );
}

/**
 * Image editor nodes whose engine call does not depend on the configured
 * model: the Stability adapter always calls replace-background-and-relight
 * (sky replace) / conservative upscale (auto enhance), and relight always
 * calls fal IC-Light V2. They are billed on that endpoint's catalog price.
 */
export const IMAGE_EDIT_FIXED_BILLING_MODELS = {
  EDIT_IMAGE_SKY_REPLACE: 'stable-image-sky-replace',
  EDIT_IMAGE_AUTO_ENHANCE: 'stable-image-auto-enhance',
  EDIT_IMAGE_RELIGHT: 'fal-ai/iclight-v2',
} as const;

/**
 * LLM nodes billed on their provider-reported token usage at the model's
 * catalog chat rates (like chat and agent mode). The balance check before the
 * run uses the text-generation flat cost, the same minimum agent mode uses.
 */
export const LLM_USAGE_NODE_TYPES = [
  'DOC_LONG_CONTEXT',
  'AI_STRUCTURED_EXTRACT',
  'AI_CATEGORIZE',
] as const;

/** Replicate model GEN_LIP_SYNC runs per quality (a full slug overrides). */
export const LIP_SYNC_MODELS = {
  fast: 'cjwbw/sadtalker',
  balanced: 'sync/lipsync-2',
  high: 'sync/lipsync-2',
} as const;

/** The Replicate model GEN_LIP_SYNC calls for a config model + quality. */
export function resolveLipSyncModel(
  configModel: unknown,
  quality: unknown
): string {
  if (typeof configModel === 'string' && configModel.includes('/')) {
    return configModel; // user provided a full Replicate slug
  }
  return quality === 'fast' || quality === 'high'
    ? LIP_SYNC_MODELS[quality]
    : LIP_SYNC_MODELS.balanced;
}

/** Replicate model EDIT_AUDIO_SEPARATE runs for every demucs-* option. */
export const AUDIO_SEPARATE_BILLING_MODEL = 'ryan5453/demucs';

export type NodeBillingKind =
  /** Never charged. */
  | 'free'
  /** Charged from the catalog price (or flat cost) on the params below. */
  | 'metered'
  /** Charged from the provider's actual usage, known only after the run. */
  | 'usage';

export interface NodeBillingPlan {
  kind: NodeBillingKind;
  /** Node type whose flat cost applies when the model has no catalog price. */
  billedNodeType: string;
  modelId?: string;
  fallbackModelId?: string;
  multiplier: number;
  /**
   * Where the billed seconds come from:
   * - `config`: the length the node asks the provider for (`durationSeconds`).
   * - `input`: the length of the input media on `durationInputs` (known at
   *   run time only; the estimate uses BILLING_DEFAULT_SECONDS).
   * - `none`: not billed per second.
   */
  durationSource: 'config' | 'input' | 'none';
  durationSeconds?: number;
  durationInputs?: string[];
  /** Billed characters come from the node's prompt text (per-1k-chars). */
  textFromPrompt: boolean;
}

type Config = Record<string, unknown> | null | undefined;

/** Same lookup as the engine: top-level field first, then `settings`. */
export function pickNodeConfigField(config: Config, name: string): unknown {
  if (!config) return undefined;
  const top = config[name];
  if (top !== undefined) return top;
  const settings = config.settings as Record<string, unknown> | undefined;
  return settings?.[name];
}

function settingsFirst(config: Config, name: string): unknown {
  if (!config) return undefined;
  const settings = config.settings as Record<string, unknown> | undefined;
  return settings?.[name] !== undefined ? settings[name] : config[name];
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** A positive number from a number or numeric string, else undefined. */
export function toPositiveSeconds(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The video length a node asks the provider for: its `duration` setting, or
 * the node definition's default when unset. The engine sends exactly this to
 * the provider, so the estimate, the check and the charge all use it.
 * Undefined for nodes without a `duration` field.
 */
export function resolveRequestedDurationSeconds(
  nodeType: string,
  config: Config
): number | undefined {
  const field = DEFINITIONS[nodeType]?.configFields?.find(
    f => f.name === 'duration' && f.type === 'duration'
  );
  if (!field) return undefined;
  const parameters = (config?.parameters ?? undefined) as
    | Record<string, unknown>
    | undefined;
  return (
    toPositiveSeconds(pickNodeConfigField(config, 'duration')) ??
    toPositiveSeconds(parameters?.duration) ??
    toPositiveSeconds(field.defaultValue)
  );
}

function mediaInputPorts(def: NodeDefinition | undefined): string[] {
  return (def?.inputs ?? [])
    .filter(p => p.type === 'audio' || p.type === 'video')
    .map(p => p.name);
}

const FREE = (nodeType: string): NodeBillingPlan => ({
  kind: 'free',
  billedNodeType: nodeType,
  multiplier: 1,
  durationSource: 'none',
  textFromPrompt: false,
});

/**
 * What a node is billed on, from its type and saved config alone (no run-time
 * inputs). The engine fills in the run-time parts (input media length, the
 * resolved prompt length, actual usage) the plan points at.
 */
export function resolveNodeBillingPlan(
  nodeType: string,
  config: Config
): NodeBillingPlan {
  const def = DEFINITIONS[nodeType];
  const category = def?.category?.toLowerCase();

  // WEB nodes report a USD cost (e.g. a search on a cache miss).
  if (category === 'web') {
    return { ...FREE(nodeType), kind: 'usage' };
  }

  // LLM nodes: actual token usage at the model's chat rates, billed as text
  // generation (its flat cost is the pre-run minimum). The engine reads the
  // model from `settings` first.
  if ((LLM_USAGE_NODE_TYPES as readonly string[]).includes(nodeType)) {
    return {
      kind: 'usage',
      billedNodeType: 'GEN_TEXT_TO_TEXT',
      modelId: asNonEmptyString(settingsFirst(config, 'model')),
      multiplier: 1,
      durationSource: 'none',
      textFromPrompt: false,
    };
  }

  // Lip sync: the Replicate model the quality maps to, on the length of the
  // input media (sync/lipsync-2 is priced per second of output, which follows
  // the audio). A full slug the catalog does not list is billed at the
  // default model's price. The engine reads both fields from `settings` first.
  if (nodeType === 'GEN_LIP_SYNC') {
    return {
      kind: 'metered',
      billedNodeType: nodeType,
      modelId: resolveLipSyncModel(
        settingsFirst(config, 'model'),
        settingsFirst(config, 'quality')
      ),
      fallbackModelId: LIP_SYNC_MODELS.balanced,
      multiplier: 1,
      durationSource: 'input',
      durationInputs: ['audio', 'video'],
      textFromPrompt: false,
    };
  }

  if (nodeType === 'EDIT_AUDIO_SEPARATE') {
    return {
      kind: 'metered',
      billedNodeType: nodeType,
      modelId: AUDIO_SEPARATE_BILLING_MODEL,
      multiplier: 1,
      durationSource: 'none',
      textFromPrompt: false,
    };
  }

  if (nodeType in IMAGE_EDIT_FIXED_BILLING_MODELS) {
    return {
      kind: 'metered',
      billedNodeType: nodeType,
      modelId:
        IMAGE_EDIT_FIXED_BILLING_MODELS[
          nodeType as keyof typeof IMAGE_EDIT_FIXED_BILLING_MODELS
        ],
      multiplier: 1,
      durationSource: 'none',
      textFromPrompt: false,
    };
  }

  // Subtitles = one transcription of the input video, billed as STT on its
  // real length.
  if (nodeType === 'GEN_VIDEO_SUBTITLE') {
    return {
      kind: 'metered',
      billedNodeType: 'GEN_SPEECH_TO_TEXT',
      modelId:
        asNonEmptyString(pickNodeConfigField(config, 'model')) ??
        VIDEO_SUBTITLE_DEFAULT_MODEL,
      multiplier: 1,
      durationSource: 'input',
      durationInputs: ['video'],
      textFromPrompt: false,
    };
  }

  if (category === 'generator' || category === 'analyzer') {
    if (nodeType === 'GEN_TEXT_TO_TEXT') {
      const mode = settingsFirst(config, 'mode');
      if (mode === 'agent') {
        return {
          kind: 'usage',
          billedNodeType: nodeType,
          modelId:
            asNonEmptyString(pickNodeConfigField(config, 'model')) ??
            AGENT_MODE_DEFAULT_MODEL,
          multiplier: 1,
          durationSource: 'none',
          textFromPrompt: false,
        };
      }
    }
  }

  const isMeteredUtility = category === 'utility' && Boolean(def?.aiCapability);

  if (category === 'generator' || category === 'analyzer' || isMeteredUtility) {
    const requested = resolveRequestedDurationSeconds(nodeType, config);
    const hasDurationField = def?.configFields?.some(
      f => f.name === 'duration' && f.type === 'duration'
    );
    const mediaPorts = mediaInputPorts(def);
    return {
      kind: 'metered',
      billedNodeType: nodeType,
      modelId:
        asNonEmptyString(pickNodeConfigField(config, 'model')) ??
        IRIS_DEFAULT_NODE_MODELS[nodeType]?.model,
      multiplier: 1,
      durationSource: hasDurationField
        ? 'config'
        : mediaPorts.length > 0
          ? 'input'
          : 'none',
      durationSeconds: requested,
      durationInputs: hasDurationField ? undefined : mediaPorts,
      textFromPrompt: true,
    };
  }

  if ((AI_IMAGE_EDITOR_NODE_TYPES as readonly string[]).includes(nodeType)) {
    return {
      kind: 'metered',
      billedNodeType: nodeType,
      modelId: asNonEmptyString(pickNodeConfigField(config, 'model')),
      multiplier: 1,
      durationSource: 'none',
      textFromPrompt: true,
    };
  }

  if (nodeType === 'EDIT_MOTION_CONTROL') {
    // The engine reads these two from `settings` only.
    const settings = (config?.settings ?? {}) as Record<string, unknown>;
    return {
      kind: 'metered',
      billedNodeType: nodeType,
      modelId: resolveMotionControlBillingModel(settings.model).catalogId,
      multiplier: settings.mode === 'pro' ? 2 : 1,
      durationSource: 'input',
      durationInputs: ['referenceVideo'],
      textFromPrompt: false,
    };
  }

  if (nodeType === 'EDIT_VIDEO_UPSCALE' || nodeType === 'EDIT_VIDEO_INPAINT') {
    const is4k =
      nodeType === 'EDIT_VIDEO_UPSCALE' &&
      String(pickNodeConfigField(config, 'targetResolution')).toLowerCase() ===
        '4k';
    return {
      kind: 'metered',
      billedNodeType: nodeType,
      modelId: asNonEmptyString(pickNodeConfigField(config, 'model')),
      fallbackModelId: VIDEO_EDIT_BILLING_MODELS[nodeType],
      multiplier: is4k ? 2 : 1,
      durationSource: 'input',
      durationInputs: ['video'],
      textFromPrompt: false,
    };
  }

  return FREE(nodeType);
}

/** Billing params for a plan, given whatever run-time facts are known. */
export function nodeBillingParams(
  plan: NodeBillingPlan,
  runtime: {
    /** Length of the billed input media (seconds), if known. */
    inputDurationSeconds?: number;
    /** Length of the prompt text the node sends, if known. */
    textLength?: number;
    /** Actual provider cost in USD (usage-based nodes), if known. */
    usdCost?: number;
    /** Provider-reported LLM token usage (usage-based nodes), if known. */
    llmUsage?: LlmTokenUsage;
  } = {}
): NodeBillingParams {
  const durationSeconds =
    plan.durationSource === 'config'
      ? plan.durationSeconds
      : plan.durationSource === 'input'
        ? toPositiveSeconds(runtime.inputDurationSeconds)
        : undefined;
  return {
    modelId: plan.modelId,
    fallbackModelId: plan.fallbackModelId,
    durationSeconds,
    textLength: plan.textFromPrompt ? runtime.textLength : undefined,
    multiplier: plan.multiplier,
    usdCost: plan.kind === 'usage' ? runtime.usdCost : undefined,
    llmUsage: plan.kind === 'usage' ? runtime.llmUsage : undefined,
  };
}
