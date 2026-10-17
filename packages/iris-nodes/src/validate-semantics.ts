// Semantic workflow checks (required inputs, provider/model, URLs, conditions,
// loop caps), moved here from iris-host-local's `validate.ts` so the editor can
// run them before a run, without a server round trip, on the same document the
// engine will run (04-workflow-editor.md 3.7).
//
// Messages keep the cloud server's wording (`Node "<label>" …`) because older
// editors map errors back to nodes by that pattern. New callers use `nodeId`.
//
// Two engine facts are injected instead of imported (iris-engine depends on
// this package, not the other way round): the expression checker of
// UTIL_FILTER / UTIL_ROUTER conditions and the loop iteration cap.

import { getNodeDefinition } from './catalog.js';
import type { NodeDefinitionLookup } from './connect.js';
import type { PortDefinition } from './types.js';
import type { DocNode, WorkflowDoc } from './workflow-doc.js';

/** Must equal iris-engine `MAX_LOOP_ITERATIONS_TOTAL` (hosts pass the engine's). */
export const DEFAULT_MAX_LOOP_ITERATIONS_TOTAL = 1000;

/** Node types that always need a provider and a model (cloud `requiresProvider`). */
export const PROVIDER_REQUIRED_NODE_TYPES: ReadonlySet<string> = new Set([
  'GEN_TEXT_TO_IMAGE',
  'GEN_IMAGE_TO_IMAGE',
  'GEN_TEXT_TO_VIDEO',
  'GEN_IMAGE_TO_VIDEO',
  'GEN_TEXT_TO_SPEECH',
  'GEN_SPEECH_TO_TEXT',
  'GEN_TEXT_TO_TEXT',
  'GEN_TEXT_TO_MUSIC',
  'GEN_INPAINT',
  'GEN_OUTPAINT',
  'GEN_STYLE_TRANSFER',
  'GEN_FACE_SWAP',
  'ANALYZE_IMAGE',
  'ANALYZE_VIDEO',
  'ANALYZE_AUDIO',
  'ANALYZE_TEXT',
  'ANALYZE_DOCUMENT',
]);

export type SemanticIssueCode =
  | 'empty'
  | 'multiple-triggers'
  | 'unconnected'
  | 'required-input'
  | 'model-required'
  | 'provider-required'
  | 'webhook-url-required'
  | 'http-url-required'
  | 'invalid-condition'
  | 'loop-cap'
  | 'nested-loop-cap';

export interface SemanticIssue {
  code: SemanticIssueCode;
  nodeId?: string;
  message: string;
}

export interface SemanticValidationOptions {
  /** Engine expression checker (`iris-engine` `validateExpression`). Conditions
   *  are not checked when omitted. */
  validateExpression?: (source: string) => string | null;
  /** Engine loop cap. Default {@link DEFAULT_MAX_LOOP_ITERATIONS_TOTAL}. */
  maxLoopIterationsTotal?: number;
  lookup?: NodeDefinitionLookup;
}

const isNonEmptyString = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0;

/** Setting read the way the executor reads it: `settings` first, then the top
 *  level (desktop nests provider/model under settings, web does not). */
function pick(node: DocNode, name: string): unknown {
  const top = node.config[name];
  if (top !== undefined && name !== 'settings') return top;
  return node.config.settings?.[name];
}

function settingFirst(node: DocNode, name: string): unknown {
  return node.config.settings?.[name] ?? node.config[name];
}

/**
 * Semantic problems of a v2 document. A direct input value counts for a
 * required input only when it has a value; a connection counts only as an
 * edge (v1 `{ source: 'node' }` links are converted by `migrateWorkflowDoc`
 * and never count on their own, W-02).
 */
export function validateWorkflowSemantics(
  doc: Pick<WorkflowDoc, 'nodes' | 'edges'>,
  options: SemanticValidationOptions = {},
): SemanticIssue[] {
  const lookup = options.lookup ?? getNodeDefinition;
  const cap = options.maxLoopIterationsTotal ?? DEFAULT_MAX_LOOP_ITERATIONS_TOTAL;
  const issues: SemanticIssue[] = [];
  const { nodes, edges } = doc;
  const label = (n: DocNode) => n.label || n.type;

  if (!nodes.length) {
    return [{ code: 'empty', message: 'Workflow is empty — add at least one node.' }];
  }

  const triggers = nodes.filter(n => n.type.startsWith('TRIGGER_'));
  if (triggers.length > 1) {
    issues.push({
      code: 'multiple-triggers',
      message: `Workflow can only have one trigger node. Found ${triggers.length} triggers: ${triggers.map(label).join(', ')}`,
    });
  }

  const connected = new Set<string>();
  const connectedInputs = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
    connectedInputs.add(`${e.target}:${e.targetHandle}`);
  }
  for (const n of nodes) {
    if (!connected.has(n.id)) {
      issues.push({ code: 'unconnected', nodeId: n.id, message: `Node "${label(n)}" is not connected to any other node` });
    }
  }

  for (const n of nodes) {
    const inputs = (lookup(n.type)?.inputs ?? []) as PortDefinition[];
    for (const input of inputs) {
      if (!input.required) continue;
      if (connectedInputs.has(`${n.id}:${input.name}`)) continue;
      const direct = n.config.inputs?.[input.name] as unknown as Record<string, unknown> | undefined;
      const hasValue = !!direct && !!(direct.value || direct.storageAssetId || direct.assetId);
      if (!hasValue) {
        issues.push({
          code: 'required-input',
          nodeId: n.id,
          message: `Node "${label(n)}" requires "${input.label || input.name}" input to be connected or configured`,
        });
      }
    }
  }

  for (const n of nodes) {
    const l = label(n);
    if (PROVIDER_REQUIRED_NODE_TYPES.has(n.type)) {
      if (!isNonEmptyString(pick(n, 'model'))) {
        issues.push({ code: 'model-required', nodeId: n.id, message: `Node "${l}" requires a model to be selected` });
      }
      if (!isNonEmptyString(pick(n, 'provider'))) {
        issues.push({ code: 'provider-required', nodeId: n.id, message: `Node "${l}" requires a provider to be selected` });
      }
    }
    if (n.type === 'OUTPUT_WEBHOOK' && !isNonEmptyString(n.config.settings?.url || n.config.url)) {
      issues.push({ code: 'webhook-url-required', nodeId: n.id, message: `Node "${l}" requires a webhook URL to be configured` });
    }
    if (n.type === 'UTIL_HTTP_REQUEST') {
      const url = n.config.settings?.url || n.config.url;
      if (!isNonEmptyString(url) && !connectedInputs.has(`${n.id}:url`)) {
        issues.push({
          code: 'http-url-required',
          nodeId: n.id,
          message: `Node "${l}" requires "URL" — configure it or connect a value to the URL input`,
        });
      }
    }
    const check = options.validateExpression;
    if (check && n.type === 'UTIL_FILTER') {
      const condition = settingFirst(n, 'condition');
      if (isNonEmptyString(condition)) {
        const problem = check(condition);
        if (problem) {
          issues.push({ code: 'invalid-condition', nodeId: n.id, message: `Node "${l}" has an invalid condition: ${problem}` });
        }
      }
    }
    if (check && n.type === 'UTIL_ROUTER') {
      const raw = settingFirst(n, 'routes');
      let routes: unknown = raw;
      if (typeof raw === 'string') {
        try {
          routes = JSON.parse(raw);
        } catch {
          routes = null;
        }
      }
      if (Array.isArray(routes)) {
        for (const entry of routes) {
          if (!entry || typeof entry !== 'object') continue;
          const route = entry as Record<string, unknown>;
          if (!isNonEmptyString(route.name) || route.name.trim() === 'default') continue;
          if (!isNonEmptyString(route.condition)) continue;
          const problem = check(route.condition);
          if (problem) {
            issues.push({
              code: 'invalid-condition',
              nodeId: n.id,
              message: `Node "${l}" route "${route.name}" has an invalid condition: ${problem}`,
            });
          }
        }
      }
    }
  }

  const loops = nodes.filter(n => n.type === 'UTIL_LOOP');
  if (loops.length > 0) {
    const readMax = (n: DocNode): number | null => {
      const raw = n.config.settings?.maxIterations ?? n.config.maxIterations;
      if (raw === undefined || raw === null) return null;
      const v = Number(raw);
      return Number.isFinite(v) ? v : null;
    };
    for (const loop of loops) {
      const m = readMax(loop);
      if (m !== null && m > cap) {
        issues.push({
          code: 'loop-cap',
          nodeId: loop.id,
          message: `Loop "${label(loop)}" maxIterations (${m}) exceeds the per-workflow cap of ${cap}`,
        });
      }
    }

    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      const list = adjacency.get(e.source) ?? [];
      list.push(e.target);
      adjacency.set(e.source, list);
    }
    const loopIds = new Set(loops.map(l => l.id));
    const loopMax = new Map<string, number>();
    for (const loop of loops) {
      const m = readMax(loop);
      loopMax.set(loop.id, m !== null && m > 0 ? Math.min(m, cap) : cap);
    }
    const nested = new Map<string, Set<string>>();
    for (const loop of loops) {
      const visited = new Set<string>();
      const stack = [...(adjacency.get(loop.id) ?? [])];
      const children = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        if (loopIds.has(id) && id !== loop.id) children.add(id);
        for (const next of adjacency.get(id) ?? []) stack.push(next);
      }
      nested.set(loop.id, children);
    }
    const allNested = new Set<string>();
    for (const c of nested.values()) for (const id of c) allNested.add(id);
    const product = (id: string, seen: Set<string>): number => {
      if (seen.has(id)) return loopMax.get(id) ?? 1;
      seen.add(id);
      const own = loopMax.get(id) ?? 1;
      const children = nested.get(id);
      if (!children || children.size === 0) return own;
      let maxChild = 1;
      for (const c of children) maxChild = Math.max(maxChild, product(c, new Set(seen)));
      return own * maxChild;
    };
    for (const root of loops.filter(l => !allNested.has(l.id))) {
      const total = product(root.id, new Set());
      if (total > cap) {
        issues.push({
          code: 'nested-loop-cap',
          nodeId: root.id,
          message: `Nested loops starting at "${label(root)}" can execute up to ${total} iterations, which exceeds the cap of ${cap}. Reduce maxIterations on nested loops.`,
        });
      }
    }
  }

  return issues;
}
