/**
 * WorkflowStore — the persistence seam the workflow orchestrator runs against
 * once it moves into the engine.
 *
 * Where `node-host.ts` decouples the *node executor* from the server, this
 * interface decouples the *WorkflowEngine* (orchestration + persistence) from
 * Prisma. It is expressed entirely in **engine-native types** — no
 * `@prisma/client`, no `Prisma.InputJsonValue` casts, no Prisma row types leak
 * across the port. Each host supplies its own implementation:
 *
 *   Parallax cloud   →  Prisma + Postgres (`PrismaWorkflowStore`)
 *   iris-host-local  →  JSON-file store on disk
 *   iris/desktop     →  Electron main-process store
 *
 * 🔑 The store **owns the `nodeId ↔ dbId` mapping**. Every method that touches a
 * node-result row takes the workflow-local `nodeId` (the stable id authored in
 * the editor); the store resolves it to whatever internal row id its backing
 * persistence uses. The engine therefore never sees a database id — it reasons
 * purely in `nodeId`s. (`EngineWorkflowNodeRow.id` exists only so the graph
 * traverser can resolve edge endpoints; it is opaque to the engine.)
 *
 * The `ports.ts` sketch defined an idealized `WorkflowStore`; this is the real
 * one, shaped to the *actual* call sites in `workflow-engine.ts` (mirroring how
 * `node-host.ts` realized the idealized node-side ports).
 */

import type {
  AssetReference,
  IrisExecutionStatus,
  IrisNodeType,
  IrisTriggerType,
  NodeResult,
} from './types.js';

/** A workflow node as the engine needs it to build the execution graph and run
 *  nodes. `id` is a host-internal node identifier used **only** for graph-edge
 *  resolution (it matches `EngineWorkflowEdgeRow.sourceNodeId`/`targetNodeId`);
 *  the engine never persists against it — node-result writes use `nodeId`. */
export interface EngineWorkflowNodeRow {
  /** Host-internal id, opaque to the engine. Matches edge endpoint ids. */
  id: string;
  /** Stable workflow-local node id (authored in the editor). */
  nodeId: string;
  type: IrisNodeType;
  label: string;
  config: Record<string, unknown>;
  inputPorts: unknown;
  outputPorts: unknown;
  providerId?: string | null;
}

/** A workflow edge. Endpoint ids reference `EngineWorkflowNodeRow.id`. */
export interface EngineWorkflowEdgeRow {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
}

/** A loaded workflow's graph + metadata (replaces the Prisma `IrisWorkflow` row
 *  with its `nodes`/`edges`/`outputBucket` includes). */
export interface EngineWorkflowData {
  /** Host-internal workflow id. */
  id: string;
  name: string;
  userId: string;
  nodes: EngineWorkflowNodeRow[];
  edges: EngineWorkflowEdgeRow[];
  /** Output destination, if configured (truthiness-checked by the engine). */
  outputBucket?: Record<string, unknown> | null;
  /** Output path template (consumed by `saveOutputAssets`). */
  outputPath?: string | null;
}

/** Lightweight handle to an execution record. Replaces the Prisma
 *  `IrisExecution` row that `execute()` used to leak to its callers — they only
 *  read `.id` (and occasionally `.status`). */
export interface EngineExecution {
  id: string;
  workflowId: string;
  status: IrisExecutionStatus;
}

/** Terminal-state snapshot of an execution, read by the sub-workflow poller. */
export interface EngineExecutionResult {
  status: IrisExecutionStatus;
  /** Final output assets persisted on completion (engine treats as opaque). */
  outputAssets: unknown;
  errorMessage: string | null;
}

export interface CreateExecutionInput {
  workflowId: string;
  userId: string;
  triggerType: IrisTriggerType;
  triggerData: unknown;
  inputData: Record<string, unknown>;
  batchJobId?: string;
}

export interface FinalizeExecutionDetail {
  status: IrisExecutionStatus;
  outputAssets: AssetReference[];
  totalTokensUsed: number;
  estimatedCost: number;
  errorMessage?: string;
  errorNodeId?: string;
}

/** Incremental node-result progress (used by the loop fan-out to advance body
 *  nodes per iteration; non-terminal iterations stay `running`). */
export interface NodeProgress {
  status: 'running' | 'completed' | 'failed';
  outputData?: Record<string, unknown>;
  assets?: AssetReference[];
  duration?: number;
  errorMessage?: string;
}

/** A structured execution log line (backs the `irisExecutionLog` rows). */
export interface WorkflowLogEntry {
  nodeId?: string;
  level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  eventType: string;
  message: string;
  data?: Record<string, unknown>;
  duration?: number;
}

/** How a finished run should be counted in the workflow's aggregate stats. */
export type WorkflowRunOutcome = 'completed' | 'failed' | 'other';

/**
 * Persistence of workflows, executions, node results, and logs. Replaces the
 * WorkflowEngine's direct Prisma access. All node-addressed methods take the
 * workflow-local `nodeId`; the store owns the `nodeId → row id` mapping.
 */
export interface WorkflowStore {
  /** Load a workflow's graph + metadata, or null if it doesn't exist. */
  loadWorkflow(workflowId: string): Promise<EngineWorkflowData | null>;

  /** Create an execution record (status PENDING) and return its handle. */
  createExecution(input: CreateExecutionInput): Promise<EngineExecution>;

  /** Read an execution's terminal-state snapshot (sub-workflow polling). */
  getExecutionResult(executionId: string): Promise<EngineExecutionResult | null>;

  /** Transition an execution's status (the store stamps started/completed at). */
  updateExecutionStatus(
    executionId: string,
    status: IrisExecutionStatus,
  ): Promise<void>;

  /** Write the final execution row (status, assets, tokens, cost, error). */
  finalizeExecution(
    executionId: string,
    detail: FinalizeExecutionDetail,
  ): Promise<void>;

  /** Create a RUNNING node-result row for `nodeId`. */
  startNodeResult(
    executionId: string,
    nodeId: string,
    inputData: Record<string, unknown>,
  ): Promise<void>;

  /** Ensure a RUNNING node-result row exists for `nodeId` (no-op if present). */
  ensureNodeResult(executionId: string, nodeId: string): Promise<void>;

  /** Persist the (terminal) result of a single node. */
  saveNodeResult(
    executionId: string,
    nodeId: string,
    result: NodeResult,
  ): Promise<void>;

  /** Update a node-result row mid-flight (loop iteration progress). */
  updateNodeProgress(
    executionId: string,
    nodeId: string,
    progress: NodeProgress,
  ): Promise<void>;

  /** Append a structured log line for the execution (best-effort). */
  appendLog(executionId: string, entry: WorkflowLogEntry): Promise<void>;

  /** Bump a workflow's aggregate run counters. */
  incrementWorkflowStats(
    workflowId: string,
    outcome: WorkflowRunOutcome,
  ): Promise<void>;

  /** Set a workflow's lifecycle status (used to PAUSE on insufficient tokens). */
  setWorkflowStatus(workflowId: string, status: 'PAUSED'): Promise<void>;
}
