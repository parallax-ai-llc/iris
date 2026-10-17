// Workflow document v2 — the one saved shape of a workflow graph, shared by
// the editors, the engine, the local host and the desktop app.
//
// v1 (everything saved before this module) stored a connection twice: as an
// edge and as `config.inputs[handle] = { source: 'node', nodeId, outputName }`.
// The engine only read the edge, validation accepted either, so the two drifted
// apart (static/docs/iris/desktop-rs/04-workflow-editor.md W-01~W-05). In v2
// the edge list is the only record of a connection; `config.inputs` keeps only
// direct values used when a handle has no edge.
//
// `migrateWorkflowDoc` reads every known v1 shape (local host rows, cloud DTOs
// with positionX/positionY, editor saves) and v2 itself, and is idempotent.
// Everything here is pure data in, data out (no I/O, no globals).

/** Direct value for an input handle that has no edge. */
export interface DocInputConfig {
  source: 'user' | 'url' | 'storage' | 'asset';
  value?: string;
  /** Storage asset id (`source: 'storage'`). Name kept from v1 for the cloud. */
  storageAssetId?: string;
  /** Local asset id (`source: 'asset'`). */
  assetId?: string;
}

export interface DocOutputConfig {
  variableName: string;
  saveToStorage: boolean;
  quality?: 'low' | 'medium' | 'high';
  storagePath?: string;
}

export interface DocNodeConfig {
  provider?: string;
  model?: string;
  settings: Record<string, unknown>;
  inputs: Record<string, DocInputConfig>;
  outputs: Record<string, DocOutputConfig>;
  /** Other top-level keys some nodes and hosts read (kept untouched). */
  [key: string]: unknown;
}

export interface DocNode {
  /** Unique within the workflow; independent of the node definition. */
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  config: DocNodeConfig;
}

export interface DocEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface WorkflowDoc {
  schemaVersion: 2;
  id: string;
  name: string;
  nodes: DocNode[];
  /** The only record of node-to-node connections. */
  edges: DocEdge[];
  /** Bumped by every save of the local REST host (optimistic concurrency). */
  revision: number;
}

export const WORKFLOW_DOC_SCHEMA_VERSION = 2 as const;

/** What `migrateWorkflowDocWithReport` changed, for logs and notices. */
export type MigrationChange =
  | { kind: 'node-link-to-edge'; nodeId: string; handle: string; edgeId: string }
  | { kind: 'node-link-dropped'; nodeId: string; handle: string; reason: 'edge-exists' | 'source-missing' | 'would-cycle' }
  | { kind: 'duplicate-edge-dropped'; edgeId: string }
  | { kind: 'extra-input-edge-dropped'; edgeId: string; keptEdgeId: string }
  | { kind: 'edge-id-assigned'; edgeId: string }
  | { kind: 'node-dropped'; reason: 'no-id' | 'duplicate-id'; nodeId?: string };

export interface MigrationResult {
  doc: WorkflowDoc;
  /** Version the input was read as (1 for every pre-v2 shape). */
  fromVersion: 1 | 2;
  changes: MigrationChange[];
}

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function pathExists(edges: readonly DocEdge[], from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}

/** Deterministic id for an edge that arrived without one. */
export function edgeIdFor(e: Pick<DocEdge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>): string {
  return `e-${e.source}-${e.sourceHandle}-${e.target}-${e.targetHandle}`;
}

function readInput(raw: unknown): DocInputConfig | { link: { nodeId?: string; outputName?: string } } | null {
  if (!isRec(raw)) return null;
  const source = raw.source;
  if (source === 'node' || (source === undefined && str(raw.nodeId))) {
    return { link: { nodeId: str(raw.nodeId), outputName: str(raw.outputName) } };
  }
  const out: DocInputConfig = {
    source:
      source === 'url' || source === 'storage' || source === 'asset' || source === 'user'
        ? source
        : str(raw.storageAssetId)
          ? 'storage'
          : 'user',
  };
  if (typeof raw.value === 'string') out.value = raw.value;
  if (str(raw.storageAssetId)) out.storageAssetId = raw.storageAssetId as string;
  if (str(raw.assetId)) out.assetId = raw.assetId as string;
  return out;
}

function readConfig(raw: unknown): { config: DocNodeConfig; links: Array<{ handle: string; nodeId?: string; outputName?: string }> } {
  const src: Rec = isRec(raw) ? raw : {};
  const links: Array<{ handle: string; nodeId?: string; outputName?: string }> = [];
  const inputs: Record<string, DocInputConfig> = {};
  if (isRec(src.inputs)) {
    for (const [handle, value] of Object.entries(src.inputs)) {
      const read = readInput(value);
      if (!read) continue;
      if ('link' in read) links.push({ handle, ...read.link });
      else inputs[handle] = read;
    }
  }
  const outputs: Record<string, DocOutputConfig> = {};
  if (isRec(src.outputs)) {
    for (const [name, value] of Object.entries(src.outputs)) {
      if (!isRec(value)) continue;
      const o: DocOutputConfig = {
        variableName: typeof value.variableName === 'string' ? value.variableName : name,
        saveToStorage: value.saveToStorage === true,
      };
      if (value.quality === 'low' || value.quality === 'medium' || value.quality === 'high') o.quality = value.quality;
      if (typeof value.storagePath === 'string') o.storagePath = value.storagePath;
      outputs[name] = o;
    }
  }
  const config: DocNodeConfig = { settings: {}, inputs, outputs };
  for (const [key, value] of Object.entries(src)) {
    if (key === 'inputs' || key === 'outputs' || value === undefined) continue;
    if (key === 'settings') {
      config.settings = isRec(value) ? { ...value } : {};
      continue;
    }
    if ((key === 'provider' || key === 'model') && (value === null || value === '')) continue;
    config[key] = value;
  }
  return { config, links };
}

/**
 * Read any saved workflow shape and return a v2 document plus what changed.
 *
 * Accepted node shapes: `{ id | nodeId, type, label?, position?:{x,y} |
 * positionX/positionY, config }`. Accepted edge shapes: v2 `{ id, source,
 * sourceHandle, target, targetHandle }` or v1 `{ edgeId | id, sourceNodeId,
 * targetNodeId, sourceHandle | sourcePortId, targetHandle | targetPortId }`.
 * Endpoint ids may be either the node's `nodeId` or its host row `id`.
 *
 * Rules: a v1 `{ source: 'node' }` input becomes an edge unless one already
 * feeds that handle, its source node is missing, or the edge would close a
 * cycle (then it is dropped); edges with the same four endpoints
 * collapse to one; when several edges feed one input handle the last one is
 * kept (the engine always used the last). Orphan edges (missing node or port)
 * are kept so `checkGraph` can show them; migration never guesses.
 */
export function migrateWorkflowDocWithReport(raw: unknown): MigrationResult {
  const src: Rec = isRec(raw) ? raw : {};
  const fromVersion: 1 | 2 = src.schemaVersion === 2 ? 2 : 1;
  const changes: MigrationChange[] = [];

  // Nodes ------------------------------------------------------------------
  const nodes: DocNode[] = [];
  const pendingLinks: Array<{ target: string; handle: string; nodeId?: string; outputName?: string }> = [];
  const rowIdToNodeId = new Map<string, string>();
  const seen = new Set<string>();
  for (const rawNode of Array.isArray(src.nodes) ? src.nodes : []) {
    if (!isRec(rawNode)) continue;
    // v1 rows carry both a host id and the workflow-local nodeId; nodeId wins.
    const id = str(rawNode.nodeId) ?? str(rawNode.id);
    if (!id) {
      changes.push({ kind: 'node-dropped', reason: 'no-id' });
      continue;
    }
    if (seen.has(id)) {
      changes.push({ kind: 'node-dropped', reason: 'duplicate-id', nodeId: id });
      continue;
    }
    seen.add(id);
    if (str(rawNode.id) && rawNode.id !== id) rowIdToNodeId.set(rawNode.id as string, id);
    const type = str(rawNode.type) ?? (isRec(rawNode.data) ? str(rawNode.data.type) : undefined) ?? 'UNKNOWN';
    const pos = isRec(rawNode.position) ? rawNode.position : undefined;
    const { config, links } = readConfig(rawNode.config ?? (isRec(rawNode.data) ? rawNode.data.config : undefined));
    for (const link of links) pendingLinks.push({ target: id, ...link });
    nodes.push({
      id,
      type,
      label: str(rawNode.label) ?? type,
      position: {
        x: num(pos?.x) ?? num(rawNode.positionX) ?? 0,
        y: num(pos?.y) ?? num(rawNode.positionY) ?? 0,
      },
      config,
    });
  }
  const nodeIds = new Set(nodes.map(n => n.id));
  const endpoint = (v: unknown): string => {
    const s = str(v) ?? '';
    return nodeIds.has(s) ? s : (rowIdToNodeId.get(s) ?? s);
  };

  // Edges ------------------------------------------------------------------
  let edges: DocEdge[] = [];
  const byQuad = new Set<string>();
  const pushEdge = (e: DocEdge) => {
    const quad = `${e.source}\u0000${e.sourceHandle}\u0000${e.target}\u0000${e.targetHandle}`;
    if (byQuad.has(quad)) {
      changes.push({ kind: 'duplicate-edge-dropped', edgeId: e.id });
      return;
    }
    byQuad.add(quad);
    edges.push(e);
  };
  for (const rawEdge of Array.isArray(src.edges) ? src.edges : []) {
    if (!isRec(rawEdge)) continue;
    const e = {
      source: endpoint(rawEdge.source ?? rawEdge.sourceNodeId),
      sourceHandle: str(rawEdge.sourceHandle) ?? str(rawEdge.sourcePortId) ?? 'output',
      target: endpoint(rawEdge.target ?? rawEdge.targetNodeId),
      targetHandle: str(rawEdge.targetHandle) ?? str(rawEdge.targetPortId) ?? 'input',
    };
    let id = (fromVersion === 2 ? str(rawEdge.id) : undefined) ?? str(rawEdge.edgeId) ?? str(rawEdge.id);
    if (!id) {
      id = edgeIdFor(e);
      changes.push({ kind: 'edge-id-assigned', edgeId: id });
    }
    pushEdge({ id, ...e });
  }

  // One edge per input handle: keep the last (what the engine used).
  const lastIntoHandle = new Map<string, DocEdge>();
  for (const e of edges) lastIntoHandle.set(`${e.target}\u0000${e.targetHandle}`, e);
  edges = edges.filter(e => {
    const kept = lastIntoHandle.get(`${e.target}\u0000${e.targetHandle}`)!;
    if (kept === e) return true;
    changes.push({ kind: 'extra-input-edge-dropped', edgeId: e.id, keptEdgeId: kept.id });
    return false;
  });

  // v1 config-only node links become edges.
  const usedIds = new Set(edges.map(e => e.id));
  for (const link of pendingLinks) {
    if (lastIntoHandle.has(`${link.target}\u0000${link.handle}`)) {
      changes.push({ kind: 'node-link-dropped', nodeId: link.target, handle: link.handle, reason: 'edge-exists' });
      continue;
    }
    const source = link.nodeId ? endpoint(link.nodeId) : '';
    if (!source || !nodeIds.has(source) || source === link.target) {
      changes.push({ kind: 'node-link-dropped', nodeId: link.target, handle: link.handle, reason: 'source-missing' });
      continue;
    }
    // A link from a downstream node would make the graph unrunnable.
    if (pathExists(edges, link.target, source)) {
      changes.push({ kind: 'node-link-dropped', nodeId: link.target, handle: link.handle, reason: 'would-cycle' });
      continue;
    }
    const e = { source, sourceHandle: link.outputName ?? 'output', target: link.target, targetHandle: link.handle };
    let id = edgeIdFor(e);
    while (usedIds.has(id)) id = `${id}-1`;
    usedIds.add(id);
    edges.push({ id, ...e });
    lastIntoHandle.set(`${e.target}\u0000${e.targetHandle}`, edges[edges.length - 1]);
    changes.push({ kind: 'node-link-to-edge', nodeId: link.target, handle: link.handle, edgeId: id });
  }

  const doc: WorkflowDoc = {
    schemaVersion: 2,
    id: str(src.id) ?? '',
    name: typeof src.name === 'string' ? src.name : '',
    nodes,
    edges,
    revision: num(src.revision) ?? 0,
  };
  return { doc, fromVersion, changes };
}

/** `migrateWorkflowDocWithReport(raw).doc`. Idempotent on v2 documents. */
export function migrateWorkflowDoc(raw: unknown): WorkflowDoc {
  return migrateWorkflowDocWithReport(raw).doc;
}

/**
 * Canonical form for comparisons and hashing: nodes and edges sorted by id,
 * object keys sorted. Two documents that mean the same graph normalize to the
 * same JSON string.
 */
export function normalizeWorkflowDoc(doc: WorkflowDoc): WorkflowDoc {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (!isRec(v)) return v;
    const out: Rec = {};
    for (const k of Object.keys(v).sort()) {
      if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    }
    return out;
  };
  return sortKeys({
    ...doc,
    nodes: [...doc.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    edges: [...doc.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  }) as WorkflowDoc;
}

/** Stable JSON of the graph only (no id, name or revision) for content hashes. */
export function workflowDocGraphJson(doc: WorkflowDoc): string {
  const n = normalizeWorkflowDoc(doc);
  return JSON.stringify({ nodes: n.nodes, edges: n.edges });
}

// ── Host row adapters ────────────────────────────────────────────────────────
// The engine's `WorkflowStore` and the local host still speak in rows
// (`EngineWorkflowNodeRow` / `EngineWorkflowEdgeRow`, node ids = nodeId). These
// two functions are the only place that maps between rows and the document.

export interface WorkflowNodeRow {
  id: string;
  nodeId: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  inputPorts: unknown;
  outputPorts: unknown;
  position?: { x: number; y: number };
}

export interface WorkflowEdgeRow {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
}

/** Document → engine/local rows (row id = nodeId, as the local host stores). */
export function workflowDocToRows(doc: WorkflowDoc): { nodes: WorkflowNodeRow[]; edges: WorkflowEdgeRow[] } {
  return {
    nodes: doc.nodes.map(n => ({
      id: n.id,
      nodeId: n.id,
      type: n.type,
      label: n.label,
      config: n.config as Record<string, unknown>,
      inputPorts: [],
      outputPorts: [],
      position: { x: n.position.x, y: n.position.y },
    })),
    edges: doc.edges.map(e => ({
      edgeId: e.id,
      sourceNodeId: e.source,
      targetNodeId: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  };
}
