// Engine-owned domain types.
//
// These are the data shapes the execution engine reasons about. They are
// deliberately DECOUPLED from any persistence layer (no `@prisma/client` row
// types) so the engine can run against a database, a JSON file, or memory.
//
// NOTE (migration): the richer runtime types — `AIRequest`, `AIResponse`,
// `ProviderName`, `ProviderCredentials`, `WorkflowGraph`, `GraphNode` — currently
// live in `core/server/src/modules/iris/core/iris.types.ts`. Phase 1 of the
// extraction moves those here verbatim and the server re-imports them from this
// package. The shapes below are the minimal, persistence-agnostic core that the
// host ports are defined against.

import type { NodeCategory } from 'iris-nodes';

/** Canonical node type string (e.g. `GEN_TEXT_TO_IMAGE`). The authoritative
 *  catalog lives in the `iris-nodes` package. */
export type NodeType = string;

export type { NodeCategory };

/** Opaque tenant identifier. In the Parallax cloud this is the user id; in the
 *  open-source local host it is a single constant ("local"). The engine never
 *  interprets it — it only forwards it to the host ports. */
export type TenantId = string;

export type ExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/** A node as the engine consumes it — independent of how it was stored. */
export interface WorkflowNode {
  id: string;
  type: NodeType;
  /** Free-form per-node configuration (model, prompt, options, …). */
  config: Record<string, unknown>;
  /** Optional editor coordinates; ignored by execution. */
  position?: { x: number; y: number };
}

/** A directed connection from one node's output port to another's input port. */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
}

/** The persistence-agnostic graph the engine executes. */
export interface WorkflowGraphInput {
  id: string;
  name?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Workflow-level default variables, merged into the initial execution state. */
  variables?: Record<string, unknown>;
}

/** Coarse media kind used by the `MediaStorage` port when persisting bytes.
 *  (The richer `AssetReference.type` / `IrisAssetType` lives in `./types`.) */
export type AssetKind = 'image' | 'video' | 'audio' | 'text' | 'document' | 'file';

/** Resource usage reported to the host's `UsageMeter`. A deliberately small
 *  summary; the full per-call `UsageInfo` lives in `./types`. */
export interface UsageRecord {
  provider?: string;
  model?: string;
  tokens?: number;
  costUsd?: number;
}

/** Per-run context threaded through the engine and into every host port call.
 *  Carries identity (tenant/execution/workflow) and cross-cutting facilities. */
export interface ExecutionContext {
  tenantId: TenantId;
  workflowId: string;
  executionId: string;
  /** Cancellation signal — the host aborts a run by aborting this. */
  signal?: AbortSignal;
  /** Arbitrary host-supplied data (locale, feature flags, …). */
  meta?: Record<string, unknown>;
}
