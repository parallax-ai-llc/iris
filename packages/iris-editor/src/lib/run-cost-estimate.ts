/**
 * Run-cost estimate for a workflow, in tokens (UI shows credits = tokens/1000).
 *
 * Each node is priced with the iris-nodes billing plan — the same plan and
 * the same price function the engine uses for its balance check and its
 * charge — over the host's price tables (`GET /api/iris/token-costs`:
 * `modelPricing` + flat `costs`). What the editor cannot know before the run
 * is reported as flags instead of being guessed silently:
 *
 *   - `perItemTokens`: nodes inside a loop body run (and are charged) once per
 *     loop item; the item count is only known at run time.
 *   - `inputDependent`: the price depends on the input media length or the
 *     input text length; the estimate uses the engine's defaults (5 s / 500
 *     chars) for unknown lengths.
 *   - `usageBased`: the node is charged on the provider's actual usage (agent
 *     mode, web search); not included in the totals.
 *
 * Pure: no React, no editor aliases (tests import it directly).
 */

import {
  computeNodeBillingTokens,
  isAIEditorNodeType,
  nodeBillingParams,
  pickNodeConfigField,
  resolveNodeBillingPlan,
  type NodeBillingPrices,
} from 'iris-nodes';

export interface RunCostNodeInput {
  id: string;
  type: string;
  config?: Record<string, unknown> | null;
}

export interface RunCostEdgeInput {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface NodeRunCost {
  nodeId: string;
  nodeType: string;
  /** Tokens one run of this node is charged (0 for usage-based nodes). */
  tokens: number;
  /** Inside a loop body: charged once per loop item. */
  perItem: boolean;
  inputDependent: boolean;
  usageBased: boolean;
}

export interface RunCostEstimate {
  /** Tokens for the nodes that run once. */
  onceTokens: number;
  /** Tokens per loop item (nodes inside loop bodies). */
  perItemTokens: number;
  inputDependent: boolean;
  usageBased: boolean;
  nodes: NodeRunCost[];
}

export const EMPTY_RUN_COST_ESTIMATE: RunCostEstimate = {
  onceTokens: 0,
  perItemTokens: 0,
  inputDependent: false,
  usageBased: false,
  nodes: [],
};

const LOOP_NODE_TYPE = 'UTIL_LOOP';
const LOOP_ITEM_PORTS = ['item', 'index'];
const PROMPT_PORTS = ['prompt', 'text', 'input'];

/**
 * Nodes that run once per loop item. Same rule as the engine's
 * `GraphTraverser.getLoopBody`: everything reachable downstream from a loop's
 * `item` / `index` outputs.
 */
export function findLoopBodyNodeIds(
  nodes: RunCostNodeInput[],
  edges: RunCostEdgeInput[]
): Set<string> {
  const outgoing = new Map<string, RunCostEdgeInput[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  const body = new Set<string>();
  for (const loop of nodes.filter(n => n.type === LOOP_NODE_TYPE)) {
    const queue = (outgoing.get(loop.id) ?? [])
      .filter(e => LOOP_ITEM_PORTS.includes(e.sourceHandle ?? ''))
      .map(e => e.target);
    const seen = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id) || id === loop.id) continue;
      seen.add(id);
      body.add(id);
      for (const e of outgoing.get(id) ?? []) queue.push(e.target);
    }
  }
  return body;
}

function extractStaticValue(input: unknown): string | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    const value = (input as { value?: unknown }).value;
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

/**
 * The prompt text a node will send when nothing is connected to its prompt
 * ports: the static value from the config panel (same order as the engine).
 */
function staticPromptText(
  nodeType: string,
  config: Record<string, unknown> | null | undefined
): string | undefined {
  if (!config) return undefined;
  if (isAIEditorNodeType(nodeType)) {
    const prompt = pickNodeConfigField(config, 'prompt');
    return typeof prompt === 'string' && prompt ? prompt : undefined;
  }
  const configInputs = (config.inputs ?? {}) as Record<string, unknown>;
  const settingsInputs = ((config.settings as Record<string, unknown>)
    ?.inputs ?? {}) as Record<string, unknown>;
  for (const source of [configInputs, settingsInputs]) {
    for (const port of PROMPT_PORTS) {
      const value = extractStaticValue(source[port]);
      if (value) return value;
    }
  }
  for (const key of ['prompt', 'text']) {
    const value = config[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

/** Estimate one node run. */
export function estimateNodeRunCost(
  node: RunCostNodeInput,
  incomingPorts: Set<string>,
  prices: NodeBillingPrices
): Omit<NodeRunCost, 'perItem'> {
  const plan = resolveNodeBillingPlan(node.type, node.config ?? undefined);
  const base = {
    nodeId: node.id,
    nodeType: node.type,
    tokens: 0,
    inputDependent: false,
    usageBased: false,
  };
  if (plan.kind === 'free') return base;
  if (plan.kind === 'usage') return { ...base, usageBased: true };

  // Unknown lengths are left undefined so the price function applies the
  // same defaults the engine's check falls back to.
  let textLength: number | undefined;
  let textKnown = !plan.textFromPrompt;
  if (plan.textFromPrompt) {
    const promptConnected = PROMPT_PORTS.some(p => incomingPorts.has(p));
    const text = promptConnected
      ? undefined
      : staticPromptText(node.type, node.config);
    if (text !== undefined && !/\{\{\w+\}\}/.test(text)) {
      textLength = text.length;
      textKnown = true;
    }
  }

  const params = nodeBillingParams(plan, { textLength });
  const tokens = computeNodeBillingTokens(plan.billedNodeType, params, prices);

  const price =
    (params.modelId && prices.modelPricing[params.modelId]) ||
    (params.fallbackModelId && prices.modelPricing[params.fallbackModelId]) ||
    undefined;
  const inputDependent =
    (price?.unit === 'per-second' && plan.durationSource === 'input') ||
    (price?.unit === 'per-1k-chars' && !textKnown);

  return { ...base, tokens, inputDependent };
}

/** Estimate a whole run. */
export function estimateWorkflowRunCost(
  nodes: RunCostNodeInput[],
  edges: RunCostEdgeInput[],
  prices: NodeBillingPrices | null | undefined
): RunCostEstimate {
  if (!prices || nodes.length === 0) return EMPTY_RUN_COST_ESTIMATE;

  const loopBody = findLoopBodyNodeIds(nodes, edges);
  const incoming = new Map<string, Set<string>>();
  for (const edge of edges) {
    const ports = incoming.get(edge.target) ?? new Set<string>();
    ports.add(edge.targetHandle ?? '');
    incoming.set(edge.target, ports);
  }

  const result: RunCostEstimate = {
    onceTokens: 0,
    perItemTokens: 0,
    inputDependent: false,
    usageBased: false,
    nodes: [],
  };
  for (const node of nodes) {
    const cost = {
      ...estimateNodeRunCost(node, incoming.get(node.id) ?? new Set(), prices),
      perItem: loopBody.has(node.id),
    };
    result.nodes.push(cost);
    if (cost.perItem) result.perItemTokens += cost.tokens;
    else result.onceTokens += cost.tokens;
    result.inputDependent ||= cost.inputDependent;
    result.usageBased ||= cost.usageBased;
  }
  return result;
}
