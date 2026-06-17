/**
 * Workflow validation — semantic checks the engine's structural `validateGraph`
 * doesn't cover.
 *
 * `GraphTraverser.validateGraph` only checks graph *shape* (entry/exit nodes
 * exist, no disconnected nodes, a trigger exists). It does NOT know about ports
 * or node-specific config, so a node with a required input left unconnected — or
 * a generator missing its provider/model — still passes. This adds those checks.
 *
 * ⚠️ This is a faithful port of the Parallax cloud server's workflow validator
 * (`core/server/.../workflows.service.ts#validate`). It MUST stay in lockstep
 * with it: same checks, and crucially the **same error-message wording**. The
 * editor (`useWorkflowEditor.handleValidate`) maps errors back to nodes with the
 * regex `/Node "([^"]+)"/`, so messages have to be phrased `Node "<label>" …`
 * for the offending node to light up. Diverging wording = silent UX breakage.
 *
 * Uses the `iris-nodes` catalog (single source of truth) for required input
 * ports, and `MAX_LOOP_ITERATIONS_TOTAL` from the engine for the loop cap.
 */

import { getNodeDefinition } from 'iris-nodes';
import type { PortDefinition } from 'iris-nodes';
import { MAX_LOOP_ITERATIONS_TOTAL } from 'iris-engine';
import type { StoredWorkflow } from './local-workflow-store.js';

/** Node types that always require both a provider and a model to be selected.
 *  Mirrors `WorkflowService.requiresProvider`. EDIT_* and GEN_VIDEO_SUBTITLE
 *  use hardcoded/default provider+model in the executor and are excluded. */
const PROVIDER_REQUIRED_TYPES = new Set<string>([
  // Generator nodes
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
  // Analyzer nodes
  'ANALYZE_IMAGE',
  'ANALYZE_VIDEO',
  'ANALYZE_AUDIO',
  'ANALYZE_TEXT',
  'ANALYZE_DOCUMENT',
]);

const isNonEmptyString = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0;

/** iris-desktop nests every configField (including provider/model) under
 *  config.settings; web nests everything except provider/model. Read from both
 *  places so the validator accepts either shape. Mirrors server `pickConfig`. */
function pickConfig(
  cfg: Record<string, unknown> | null | undefined,
  name: string,
): unknown {
  const top = cfg?.[name];
  if (top !== undefined) return top;
  const settings = cfg?.settings as Record<string, unknown> | undefined;
  return settings?.[name];
}

/**
 * Semantic (non-structural) validation errors for a stored workflow.
 *
 * Faithful port of the server's `validate()` extra checks (everything it runs
 * after `validateGraph`). The caller (`server.ts`) prepends the structural
 * `validateGraph` errors, exactly as the cloud server does.
 */
export function validateWorkflowSemantics(wf: StoredWorkflow): string[] {
  const errors: string[] = [];

  if (!wf.nodes.length) {
    return ['Workflow is empty — add at least one node.'];
  }

  const nodes = wf.nodes;
  const edges = wf.edges;

  // ── Multiple triggers — only one trigger allowed per workflow ──────────────
  const triggerNodes = nodes.filter(n => n.type.startsWith('TRIGGER_'));
  if (triggerNodes.length > 1) {
    errors.push(
      `Workflow can only have one trigger node. Found ${triggerNodes.length} triggers: ${triggerNodes
        .map(n => n.label || n.type)
        .join(', ')}`,
    );
  }

  // ── Unconnected nodes — every node must touch at least one edge ────────────
  const connectedNodeIds = new Set<string>();
  for (const edge of edges) {
    connectedNodeIds.add(edge.sourceNodeId);
    connectedNodeIds.add(edge.targetNodeId);
  }
  for (const node of nodes) {
    if (!connectedNodeIds.has(node.nodeId)) {
      errors.push(
        `Node "${node.label || node.type}" is not connected to any other node`,
      );
    }
  }

  // Map of "targetNodeId:targetHandle" → has an incoming edge.
  const connectedInputs = new Set<string>();
  for (const edge of edges) {
    connectedInputs.add(`${edge.targetNodeId}:${edge.targetHandle}`);
  }

  // ── Required inputs — connected via edge OR configured directly ────────────
  for (const node of nodes) {
    const def = getNodeDefinition(node.type);
    const inputs = (def?.inputs ?? []) as PortDefinition[];
    if (!inputs.length) continue;

    const nodeConfig = node.config as Record<string, unknown> | null;
    const configInputs =
      (nodeConfig?.inputs as Record<string, unknown>) || {};

    for (const input of inputs) {
      if (!input.required) continue;

      const hasEdgeConnection = connectedInputs.has(
        `${node.nodeId}:${input.name}`,
      );

      // Configured directly as { storageAssetId }, { value }, or { nodeId }.
      const inputConfig = configInputs[input.name] as
        | Record<string, unknown>
        | undefined;
      const hasConfiguredValue =
        !!inputConfig &&
        !!(
          inputConfig.storageAssetId ||
          inputConfig.value ||
          inputConfig.nodeId
        );

      if (!hasEdgeConnection && !hasConfiguredValue) {
        errors.push(
          `Node "${node.label || node.type}" requires "${input.label || input.name}" input to be connected or configured`,
        );
      }
    }
  }

  // ── Provider/model + node-specific required config ─────────────────────────
  for (const node of nodes) {
    const config = node.config as Record<string, unknown> | null;
    const label = node.label || node.type;

    if (PROVIDER_REQUIRED_TYPES.has(node.type)) {
      if (!isNonEmptyString(pickConfig(config, 'model'))) {
        errors.push(`Node "${label}" requires a model to be selected`);
      }
      if (!isNonEmptyString(pickConfig(config, 'provider'))) {
        errors.push(`Node "${label}" requires a provider to be selected`);
      }
    }

    if (node.type === 'OUTPUT_WEBHOOK') {
      const settings = config?.settings as Record<string, unknown> | undefined;
      const url = settings?.url || config?.url;
      if (!isNonEmptyString(url)) {
        errors.push(`Node "${label}" requires a webhook URL to be configured`);
      }
    }

    // UTIL_HTTP_REQUEST URL — accepts a config value OR an incoming edge on the
    // `url` input port (dynamic URL).
    if (node.type === 'UTIL_HTTP_REQUEST') {
      const settings = config?.settings as Record<string, unknown> | undefined;
      const url = settings?.url || config?.url;
      const hasUrlEdge = connectedInputs.has(`${node.nodeId}:url`);
      if (!isNonEmptyString(url) && !hasUrlEdge) {
        errors.push(
          `Node "${label}" requires "URL" — configure it or connect a value to the URL input`,
        );
      }
    }
  }

  // ── Loop iteration caps — per-loop and multiplicative across nesting ───────
  const loopNodes = nodes.filter(n => n.type === 'UTIL_LOOP');
  if (loopNodes.length > 0) {
    const readMaxIter = (
      cfg: Record<string, unknown> | null,
    ): number | null => {
      const settings = cfg?.settings as Record<string, unknown> | undefined;
      const raw = settings?.maxIterations ?? cfg?.maxIterations;
      if (raw === undefined || raw === null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    // Each loop's own maxIterations.
    for (const loop of loopNodes) {
      const cfg = loop.config as Record<string, unknown> | null;
      const maxIter = readMaxIter(cfg);
      if (maxIter !== null && maxIter > MAX_LOOP_ITERATIONS_TOTAL) {
        errors.push(
          `Loop "${loop.label || loop.type}" maxIterations (${maxIter}) exceeds the per-workflow cap of ${MAX_LOOP_ITERATIONS_TOTAL}`,
        );
      }
    }

    // Adjacency for nesting detection.
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      const list = adjacency.get(edge.sourceNodeId) ?? [];
      list.push(edge.targetNodeId);
      adjacency.set(edge.sourceNodeId, list);
    }

    const loopIds = new Set(loopNodes.map(l => l.nodeId));
    const loopMaxIter = new Map<string, number>();
    for (const loop of loopNodes) {
      const cfg = loop.config as Record<string, unknown> | null;
      const m = readMaxIter(cfg);
      loopMaxIter.set(
        loop.nodeId,
        m !== null && m > 0
          ? Math.min(m, MAX_LOOP_ITERATIONS_TOTAL)
          : MAX_LOOP_ITERATIONS_TOTAL,
      );
    }

    // Loops nested inside each loop (reachable descendants).
    const nestedChildren = new Map<string, Set<string>>();
    for (const loop of loopNodes) {
      const visited = new Set<string>();
      const stack = [...(adjacency.get(loop.nodeId) ?? [])];
      const childLoops = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        if (loopIds.has(id) && id !== loop.nodeId) childLoops.add(id);
        for (const next of adjacency.get(id) ?? []) stack.push(next);
      }
      nestedChildren.set(loop.nodeId, childLoops);
    }

    // Root loops = loops not nested inside any other loop.
    const allNestedChildren = new Set<string>();
    for (const children of nestedChildren.values()) {
      for (const c of children) allNestedChildren.add(c);
    }
    const rootLoops = loopNodes.filter(l => !allNestedChildren.has(l.nodeId));

    const computeMaxProduct = (loopId: string, seen: Set<string>): number => {
      if (seen.has(loopId)) return loopMaxIter.get(loopId) ?? 1;
      seen.add(loopId);
      const own = loopMaxIter.get(loopId) ?? 1;
      const children = nestedChildren.get(loopId);
      if (!children || children.size === 0) return own;
      let maxChild = 1;
      for (const c of children) {
        const childProduct = computeMaxProduct(c, new Set(seen));
        if (childProduct > maxChild) maxChild = childProduct;
      }
      return own * maxChild;
    };

    for (const root of rootLoops) {
      const total = computeMaxProduct(root.nodeId, new Set());
      if (total > MAX_LOOP_ITERATIONS_TOTAL) {
        errors.push(
          `Nested loops starting at "${root.label || root.type}" can execute up to ${total} iterations, which exceeds the cap of ${MAX_LOOP_ITERATIONS_TOTAL}. Reduce maxIterations on nested loops.`,
        );
      }
    }
  }

  return errors;
}
