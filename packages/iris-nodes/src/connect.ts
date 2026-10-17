// Connection rules — one implementation for the editor canvas, the input
// source panel, AI apply, the local host's validation and the engine.
// (Before: three diverging rule sets, 04-workflow-editor.md W-06/W-07/W-10.)

import { getNodeDefinition } from './catalog.js';
import { getDynamicOutputPorts } from './dynamic-ports.js';
import type { NodeDefinition, PortDefinition, PortType } from './types.js';
import type { DocEdge, DocNode, WorkflowDoc } from './workflow-doc.js';

/** Look-up used by the rules. Defaults to the full iris-nodes catalog; hosts
 *  can pass their own (tests, or a catalog snapshot pinned to a release). */
export type NodeDefinitionLookup = (type: string) => NodeDefinition | undefined;

export interface ResolvedPorts {
  inputs: PortDefinition[];
  /** Static outputs plus the ones grown from settings (router routes, decision options). */
  outputs: PortDefinition[];
}

/** Ports of a node as the editor draws them: static inputs, static + dynamic
 *  outputs. `null` when the node type is unknown to the catalog. */
export function resolvePorts(
  node: Pick<DocNode, 'type' | 'config'>,
  lookup: NodeDefinitionLookup = getNodeDefinition,
): ResolvedPorts | null {
  const def = lookup(node.type);
  if (!def) return null;
  const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
  return {
    inputs: def.inputs,
    outputs: getDynamicOutputPorts(node.type, def.outputs, settings),
  };
}

/** Which input port types accept an output port type. */
export const PORT_TYPE_COMPATIBILITY: Readonly<Record<PortType, readonly PortType[]>> = {
  any: ['text', 'image', 'video', 'audio', 'document', 'json', 'any', 'trigger'],
  trigger: ['trigger'],
  text: ['text', 'any', 'json'],
  image: ['image', 'any'],
  video: ['video', 'any'],
  audio: ['audio', 'any'],
  document: ['document', 'any'],
  json: ['json', 'any', 'text'],
};

/** Output type `from` may feed input type `to` (an `any` input takes every
 *  output type; same table the canvas used before). */
export function isPortTypeCompatible(from: PortType, to: PortType): boolean {
  if (to === 'any') return true;
  return (PORT_TYPE_COMPATIBILITY[from] ?? []).includes(to);
}

export interface ConnectionRequest {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export type ConnectReason =
  | 'self'
  | 'unknown-node'
  | 'unknown-port'
  | 'type-mismatch'
  | 'cycle'
  | 'trigger-input';

export type ConnectResult =
  | {
      ok: true;
      /** Edge already feeding the same input handle; the new edge replaces it. */
      replaces?: string;
      /** The exact same edge already exists (connecting again is a no-op). */
      existing?: string;
    }
  | { ok: false; reason: ConnectReason };

type GraphLike = Pick<WorkflowDoc, 'nodes' | 'edges'>;

/** True when `to` is reachable from `from` along edges. */
function reaches(edges: readonly DocEdge[], from: string, to: string): boolean {
  const out = new Map<string, string[]>();
  for (const e of edges) {
    const list = out.get(e.source);
    if (list) list.push(e.target);
    else out.set(e.source, [e.target]);
  }
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of out.get(id) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Can `c` be added to `doc`? Unknown node types and ports are rejected (they
 * used to pass silently). An input handle takes one edge: when another edge
 * already feeds it, the result names it in `replaces` and the caller removes
 * it in the same command.
 */
export function canConnect(
  doc: GraphLike,
  c: ConnectionRequest,
  lookup: NodeDefinitionLookup = getNodeDefinition,
): ConnectResult {
  if (!c.source || !c.target) return { ok: false, reason: 'unknown-node' };
  if (c.source === c.target) return { ok: false, reason: 'self' };
  const source = doc.nodes.find(n => n.id === c.source);
  const target = doc.nodes.find(n => n.id === c.target);
  if (!source || !target) return { ok: false, reason: 'unknown-node' };
  if (target.type.startsWith('TRIGGER_')) return { ok: false, reason: 'trigger-input' };

  const sourcePorts = resolvePorts(source, lookup);
  const targetPorts = resolvePorts(target, lookup);
  if (!sourcePorts || !targetPorts) return { ok: false, reason: 'unknown-port' };
  const out = sourcePorts.outputs.find(p => p.name === c.sourceHandle && !p.hideHandle);
  const inp = targetPorts.inputs.find(p => p.name === c.targetHandle && !p.hideHandle);
  if (!out || !inp) return { ok: false, reason: 'unknown-port' };
  if (!isPortTypeCompatible(out.type, inp.type)) return { ok: false, reason: 'type-mismatch' };

  const same = doc.edges.find(
    e =>
      e.source === c.source &&
      e.sourceHandle === c.sourceHandle &&
      e.target === c.target &&
      e.targetHandle === c.targetHandle,
  );
  if (same) return { ok: true, existing: same.id };

  // Replacing an edge into the same handle cannot create a cycle by itself,
  // so check reachability on the graph without it.
  const replaced = doc.edges.find(e => e.target === c.target && e.targetHandle === c.targetHandle);
  const rest = replaced ? doc.edges.filter(e => e !== replaced) : doc.edges;
  if (reaches(rest, c.target, c.source)) return { ok: false, reason: 'cycle' };
  return replaced ? { ok: true, replaces: replaced.id } : { ok: true };
}

export type GraphIssueCode =
  | 'orphan-edge'
  | 'unknown-node-type'
  | 'unknown-port'
  | 'multiple-inputs'
  | 'cycle'
  | 'type-mismatch'
  | 'self-loop'
  | 'trigger-input';

export interface GraphIssue {
  code: GraphIssueCode;
  nodeId?: string;
  edgeId?: string;
  /** Port name the issue is about, when there is one. */
  port?: string;
  message: string;
}

/**
 * Structural problems of a graph, identified by node and edge id (never by
 * label). Never modifies the document; the editor shows the issues and offers
 * a "clean up orphan connections" command.
 */
export function checkGraph(
  doc: GraphLike,
  lookup: NodeDefinitionLookup = getNodeDefinition,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const byId = new Map(doc.nodes.map(n => [n.id, n]));
  const ports = new Map<string, ResolvedPorts | null>();
  for (const n of doc.nodes) {
    const p = resolvePorts(n, lookup);
    ports.set(n.id, p);
    if (!p) {
      issues.push({
        code: 'unknown-node-type',
        nodeId: n.id,
        message: `Node "${n.label || n.id}" has an unknown type "${n.type}"`,
      });
    }
  }

  const intoHandle = new Map<string, DocEdge[]>();
  for (const e of doc.edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) {
      issues.push({
        code: 'orphan-edge',
        edgeId: e.id,
        nodeId: s ? s.id : t?.id,
        message: `Connection ${e.id} points at a node that does not exist (${!s ? e.source : e.target})`,
      });
      continue;
    }
    if (e.source === e.target) {
      issues.push({ code: 'self-loop', edgeId: e.id, nodeId: e.source, message: `Node "${s.label || s.id}" is connected to itself` });
      continue;
    }
    if (t.type.startsWith('TRIGGER_')) {
      issues.push({
        code: 'trigger-input',
        edgeId: e.id,
        nodeId: t.id,
        message: `Trigger node "${t.label || t.id}" cannot take an input`,
      });
    }
    const key = `${e.target}\u0000${e.targetHandle}`;
    const list = intoHandle.get(key);
    if (list) list.push(e);
    else intoHandle.set(key, [e]);

    const sp = ports.get(e.source);
    const tp = ports.get(e.target);
    if (!sp || !tp) continue; // already reported as unknown type
    const out = sp.outputs.find(p => p.name === e.sourceHandle);
    const inp = tp.inputs.find(p => p.name === e.targetHandle);
    if (!out) {
      issues.push({
        code: 'unknown-port',
        edgeId: e.id,
        nodeId: s.id,
        port: e.sourceHandle,
        message: `Node "${s.label || s.id}" has no output "${e.sourceHandle}"`,
      });
    }
    if (!inp) {
      issues.push({
        code: 'unknown-port',
        edgeId: e.id,
        nodeId: t.id,
        port: e.targetHandle,
        message: `Node "${t.label || t.id}" has no input "${e.targetHandle}"`,
      });
    }
    if (out && inp && !isPortTypeCompatible(out.type, inp.type)) {
      issues.push({
        code: 'type-mismatch',
        edgeId: e.id,
        nodeId: t.id,
        port: e.targetHandle,
        message: `Node "${t.label || t.id}" input "${e.targetHandle}" (${inp.type}) cannot take "${e.sourceHandle}" (${out.type}) from "${s.label || s.id}"`,
      });
    }
  }

  for (const list of intoHandle.values()) {
    if (list.length < 2) continue;
    const t = byId.get(list[0].target)!;
    for (const e of list.slice(0, -1)) {
      issues.push({
        code: 'multiple-inputs',
        edgeId: e.id,
        nodeId: t.id,
        port: e.targetHandle,
        message: `Node "${t.label || t.id}" input "${e.targetHandle}" has more than one connection`,
      });
    }
  }

  // Cycles: Kahn on unique node dependencies; whatever is left is on a cycle.
  const deps = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const n of doc.nodes) {
    deps.set(n.id, new Set());
    dependents.set(n.id, new Set());
  }
  for (const e of doc.edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target) continue;
    deps.get(e.target)!.add(e.source);
    dependents.get(e.source)!.add(e.target);
  }
  const remaining = new Map([...deps].map(([id, d]) => [id, d.size]));
  const queue = [...remaining].filter(([, d]) => d === 0).map(([id]) => id);
  while (queue.length) {
    const id = queue.pop()!;
    remaining.delete(id);
    for (const next of dependents.get(id) ?? []) {
      const d = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  for (const id of remaining.keys()) {
    const n = byId.get(id)!;
    issues.push({ code: 'cycle', nodeId: id, message: `Node "${n.label || n.id}" is part of a cycle` });
  }

  return issues;
}

/**
 * Edges whose removal clears the orphan-type issues (`orphan-edge`,
 * `unknown-port`, `multiple-inputs`, `self-loop`, `trigger-input`). The
 * editor's "clean up connections" command removes exactly these.
 */
export function orphanEdgeIds(issues: readonly GraphIssue[]): string[] {
  const ids = new Set<string>();
  for (const i of issues) {
    if (!i.edgeId) continue;
    if (i.code === 'type-mismatch' || i.code === 'cycle') continue;
    ids.add(i.edgeId);
  }
  return [...ids];
}

export interface PortRename {
  from: string;
  to: string;
}

/**
 * How a settings change moves a node's dynamic output ports. Ports are
 * matched by position among the dynamic ports: same position, new name =
 * rename; positions past the new end = removed. Used to re-point or drop the
 * edges of a router route or decision option in the same command as the
 * settings change (W-08).
 */
export function diffDynamicOutputs(
  type: string,
  staticOutputs: PortDefinition[],
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): { renamed: PortRename[]; removed: string[] } {
  const staticNames = new Set(staticOutputs.map(p => p.name));
  const dyn = (settings: Record<string, unknown> | undefined) =>
    getDynamicOutputPorts(type, staticOutputs, settings)
      .map(p => p.name)
      .filter(n => !staticNames.has(n));
  const b = dyn(before);
  const a = dyn(after);
  const afterSet = new Set(a);
  const renamed: PortRename[] = [];
  const removed: string[] = [];
  b.forEach((name, i) => {
    if (afterSet.has(name)) return;
    const replacement = a[i];
    if (replacement !== undefined && !b.includes(replacement)) renamed.push({ from: name, to: replacement });
    else removed.push(name);
  });
  // Static ports that disappear (AI_DECISION choice mode hides true/false).
  const staticNow = new Set(getDynamicOutputPorts(type, staticOutputs, after).map(p => p.name));
  const staticBefore = getDynamicOutputPorts(type, staticOutputs, before).map(p => p.name);
  for (const name of staticBefore) {
    if (staticNames.has(name) && !staticNow.has(name)) removed.push(name);
  }
  return { renamed, removed };
}
