/**
 * Pure operations on the workflow document (v2, `iris-nodes` WorkflowDoc).
 *
 * The editor store keeps one `WorkflowDoc` as the only saved state and turns
 * every edit into one of these functions wrapped in a history command
 * (`docCommand`). Updates are immutable and share untouched nodes and edges,
 * so a command can keep its before/after documents at the cost of the parts
 * it changed. Connection rules come from `iris-nodes` (`canConnect`,
 * `diffDynamicOutputs`), the same functions the engine and hosts use.
 */
import {
  canConnect,
  diffDynamicOutputs,
  getNodeDefinition,
  migrateWorkflowDocWithReport,
  checkGraph,
  type ConnectResult,
  type ConnectionRequest,
  type DocEdge,
  type DocNode,
  type DocNodeConfig,
  type WorkflowDoc,
} from 'iris-nodes';
import type { Command } from '../history/history';

export type { WorkflowDoc, DocNode, DocEdge, DocNodeConfig };

export function emptyDoc(id = '', name = ''): WorkflowDoc {
  return { schemaVersion: 2, id, name, nodes: [], edges: [], revision: 0 };
}

export function emptyConfig(): DocNodeConfig {
  return { settings: {}, inputs: {}, outputs: {} };
}

function sizeOf(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Rough bytes a before/after pair holds beyond what both share. */
function changedBytes(before: WorkflowDoc, after: WorkflowDoc): number {
  const prevNodes = new Set(before.nodes);
  const prevEdges = new Set(before.edges);
  let n = 64;
  for (const node of after.nodes) if (!prevNodes.has(node)) n += sizeOf(node) * 2;
  for (const edge of after.edges) if (!prevEdges.has(edge)) n += 128;
  return n;
}

/**
 * A history command that swaps between two document snapshots. Valid because
 * history is linear: `undo` only runs when the document is the `after` of
 * this command (everything after it was undone first).
 */
export function docCommand(
  label: string,
  before: WorkflowDoc,
  after: WorkflowDoc,
  mergeKey?: string,
): Command<WorkflowDoc> {
  return {
    label,
    do: () => after,
    undo: () => before,
    bytes: changedBytes(before, after),
    mergeKey,
  };
}

// ── nodes ────────────────────────────────────────────────────────────────────

export function addNodes(doc: WorkflowDoc, nodes: DocNode[]): WorkflowDoc {
  if (nodes.length === 0) return doc;
  return { ...doc, nodes: [...doc.nodes, ...nodes] };
}

/** Remove nodes and every edge touching them. */
export function removeNodes(doc: WorkflowDoc, ids: Iterable<string>): WorkflowDoc {
  const drop = new Set(ids);
  if (drop.size === 0) return doc;
  return {
    ...doc,
    nodes: doc.nodes.filter(n => !drop.has(n.id)),
    edges: doc.edges.filter(e => !drop.has(e.source) && !drop.has(e.target)),
  };
}

export function updateNode(
  doc: WorkflowDoc,
  id: string,
  fn: (node: DocNode) => DocNode,
): WorkflowDoc {
  let changed = false;
  const nodes = doc.nodes.map(n => {
    if (n.id !== id) return n;
    const next = fn(n);
    if (next !== n) changed = true;
    return next;
  });
  return changed ? { ...doc, nodes } : doc;
}

export function moveNodes(
  doc: WorkflowDoc,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): WorkflowDoc {
  let changed = false;
  const nodes = doc.nodes.map(n => {
    const p = positions.get(n.id);
    if (!p || (p.x === n.position.x && p.y === n.position.y)) return n;
    changed = true;
    return { ...n, position: { x: p.x, y: p.y } };
  });
  return changed ? { ...doc, nodes } : doc;
}

export function renameNode(doc: WorkflowDoc, id: string, label: string): WorkflowDoc {
  return updateNode(doc, id, n => (n.label === label ? n : { ...n, label }));
}

/**
 * Replace a node's config. When the settings change a node's dynamic output
 * ports (router routes, decision options), edges follow in the same update:
 * a renamed port moves its edges to the new name, a removed port drops its
 * edges (W-08).
 */
export function setNodeConfig(doc: WorkflowDoc, id: string, config: DocNodeConfig): WorkflowDoc {
  const node = doc.nodes.find(n => n.id === id);
  if (!node || node.config === config) return doc;
  let next = updateNode(doc, id, n => ({ ...n, config }));
  const def = getNodeDefinition(node.type);
  if (!def) return next;
  const { renamed, removed } = diffDynamicOutputs(
    node.type,
    def.outputs,
    node.config.settings,
    config.settings,
  );
  if (renamed.length === 0 && removed.length === 0) return next;
  const renameMap = new Map(renamed.map(r => [r.from, r.to]));
  const removedSet = new Set(removed);
  next = {
    ...next,
    edges: next.edges
      .filter(e => !(e.source === id && removedSet.has(e.sourceHandle)))
      .map(e =>
        e.source === id && renameMap.has(e.sourceHandle)
          ? { ...e, sourceHandle: renameMap.get(e.sourceHandle)! }
          : e,
      ),
  };
  return next;
}

/** Merge into a node's settings (keys set to undefined are removed). */
export function patchSettings(
  doc: WorkflowDoc,
  id: string,
  patch: Record<string, unknown>,
): WorkflowDoc {
  const node = doc.nodes.find(n => n.id === id);
  if (!node) return doc;
  const settings: Record<string, unknown> = { ...node.config.settings };
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      if (k in settings) {
        delete settings[k];
        changed = true;
      }
    } else if (settings[k] !== v) {
      settings[k] = v;
      changed = true;
    }
  }
  return changed ? setNodeConfig(doc, id, { ...node.config, settings }) : doc;
}

// ── edges ────────────────────────────────────────────────────────────────────

export function removeEdges(doc: WorkflowDoc, ids: Iterable<string>): WorkflowDoc {
  const drop = new Set(ids);
  if (drop.size === 0) return doc;
  const edges = doc.edges.filter(e => !drop.has(e.id));
  return edges.length === doc.edges.length ? doc : { ...doc, edges };
}

let edgeSeq = 0;
export function newEdgeId(source: string, target: string): string {
  return `e-${source}-${target}-${Date.now().toString(36)}${(edgeSeq++).toString(36)}`;
}

/**
 * Add a connection by the shared rules. An edge already feeding the same
 * input handle is replaced in the same update (W-05). Returns the rule result
 * so callers can show why a connection was refused.
 */
export function connect(
  doc: WorkflowDoc,
  c: ConnectionRequest,
): { doc: WorkflowDoc; result: ConnectResult; edgeId?: string } {
  const result = canConnect(doc, c);
  if (!result.ok) return { doc, result };
  if (result.existing) return { doc, result, edgeId: result.existing };
  const edge: DocEdge = { id: newEdgeId(c.source, c.target), ...c };
  const edges = result.replaces ? doc.edges.filter(e => e.id !== result.replaces) : doc.edges;
  return { doc: { ...doc, edges: [...edges, edge] }, result, edgeId: edge.id };
}

/** Edges whose removal clears orphan connections (`checkGraph`). */
export function orphanEdges(doc: WorkflowDoc): string[] {
  const ids = new Set<string>();
  for (const issue of checkGraph(doc)) {
    if (!issue.edgeId) continue;
    if (issue.code === 'type-mismatch' || issue.code === 'cycle') continue;
    ids.add(issue.edgeId);
  }
  return [...ids];
}

// ── copy / paste ─────────────────────────────────────────────────────────────

export const FRAGMENT_KIND = 'iris-workflow-fragment';

export interface WorkflowFragment {
  kind: typeof FRAGMENT_KIND;
  schemaVersion: 2;
  nodes: DocNode[];
  edges: DocEdge[];
}

/** Settings that bind a node to a server-side secret; never copied. */
const SECRET_SETTING = /(secret|token|apikey|api_key|password)/i;

function stripSecrets(node: DocNode): DocNode {
  const settings: Record<string, unknown> = {};
  let stripped = false;
  for (const [k, v] of Object.entries(node.config.settings ?? {})) {
    if (SECRET_SETTING.test(k)) {
      stripped = true;
      continue;
    }
    settings[k] = v;
  }
  return stripped ? { ...node, config: { ...node.config, settings } } : node;
}

/** The selected nodes plus only the edges between them (3.5). */
export function copyFragment(doc: WorkflowDoc, ids: Iterable<string>): WorkflowFragment {
  const pick = new Set(ids);
  return {
    kind: FRAGMENT_KIND,
    schemaVersion: 2,
    nodes: doc.nodes.filter(n => pick.has(n.id)).map(stripSecrets),
    edges: doc.edges.filter(e => pick.has(e.source) && pick.has(e.target)),
  };
}

export interface PasteResult {
  doc: WorkflowDoc;
  /** New node ids, in fragment order. */
  nodeIds: string[];
  /** Node types left out (unknown to the catalog). */
  skippedTypes: string[];
  /** A trigger was left out because the workflow already has one. */
  skippedTrigger: boolean;
}

/**
 * Paste an untrusted fragment: read it through `migrateWorkflowDoc`, drop
 * unknown node types and extra triggers, give every node a new id, keep only
 * edges inside the fragment that pass `canConnect`, and place the nodes at
 * `at` (top-left) or offset from where they were copied.
 */
export function pasteFragment(
  doc: WorkflowDoc,
  raw: unknown,
  makeId: () => string,
  options: { at?: { x: number; y: number }; offset?: number } = {},
): PasteResult {
  const src = raw as { kind?: unknown } | null;
  const fragment = migrateWorkflowDocWithReport(
    src && typeof src === 'object' && src.kind === FRAGMENT_KIND ? src : { nodes: [], edges: [] },
  ).doc;
  const skippedTypes: string[] = [];
  let skippedTrigger = false;
  let hasTrigger = doc.nodes.some(n => n.type.startsWith('TRIGGER_'));
  const idMap = new Map<string, string>();
  const nodes: DocNode[] = [];
  const offset = options.offset ?? 32;
  const minX = Math.min(...fragment.nodes.map(n => n.position.x), Infinity);
  const minY = Math.min(...fragment.nodes.map(n => n.position.y), Infinity);
  for (const n of fragment.nodes) {
    if (!getNodeDefinition(n.type)) {
      skippedTypes.push(n.type);
      continue;
    }
    if (n.type.startsWith('TRIGGER_')) {
      if (hasTrigger) {
        skippedTrigger = true;
        continue;
      }
      hasTrigger = true;
    }
    const id = makeId();
    idMap.set(n.id, id);
    const position = options.at
      ? { x: options.at.x + (n.position.x - minX), y: options.at.y + (n.position.y - minY) }
      : { x: n.position.x + offset, y: n.position.y + offset };
    nodes.push({ ...stripSecrets(n), id, position });
  }
  let next = addNodes(doc, nodes);
  for (const e of fragment.edges) {
    const source = idMap.get(e.source);
    const target = idMap.get(e.target);
    if (!source || !target) continue; // edge to a node outside the fragment
    next = connect(next, { source, sourceHandle: e.sourceHandle, target, targetHandle: e.targetHandle }).doc;
  }
  return { doc: next, nodeIds: nodes.map(n => n.id), skippedTypes, skippedTrigger };
}
