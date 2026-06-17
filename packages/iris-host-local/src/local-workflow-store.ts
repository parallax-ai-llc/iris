/**
 * LocalWorkflowStore — the open-source local implementation of the engine's
 * `WorkflowStore` port (the persistence seam `WorkflowEngine` runs against).
 *
 * Where the Parallax cloud backs this with Prisma/Postgres
 * (`PrismaWorkflowStore`), the local host backs it with one JSON file per
 * workflow and per execution on disk:
 *
 *   <dataDir>/workflows/<workflowId>.json    graph + metadata + run counters
 *   <dataDir>/executions/<executionId>.json  status + per-node results + logs
 *
 * 🔑 Unlike the cloud store, the local store has **no database id** — so it does
 * NOT carry a `nodeId ↔ dbId` map. It uses the workflow-local `nodeId` directly
 * as the row key (`EngineWorkflowNodeRow.id === nodeId`), which the graph
 * traverser is happy with (it resolves edge endpoints against `.id`, and edges
 * are authored against the same `nodeId`s). This makes it simpler than the
 * cloud store, not more complex.
 *
 * Beyond the `WorkflowStore` interface, this class also exposes the plain CRUD
 * helpers the local Fastify REST API needs (list/get/create/update/delete/clone
 * workflows, read executions/logs) — there is no separate Prisma layer to host
 * those on locally.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type {
  WorkflowStore,
  CreateExecutionInput,
  EngineExecution,
  EngineExecutionResult,
  EngineWorkflowData,
  EngineWorkflowNodeRow,
  EngineWorkflowEdgeRow,
  FinalizeExecutionDetail,
  NodeProgress,
  NodeResult,
  WorkflowLogEntry,
  WorkflowRunOutcome,
  IrisExecutionStatus,
  IrisNodeResultStatus,
} from 'iris-engine';
import {
  withFileLock,
  readJsonOrNull,
  writeJson,
  listJsonIds,
} from './fs-util.js';

/** A workflow as persisted on disk. The graph rows already match the engine's
 *  `EngineWorkflow*Row` shapes (with `id === nodeId`), so `loadWorkflow` is a
 *  near pass-through. */
export interface StoredWorkflow {
  id: string;
  name: string;
  userId: string;
  status: string;
  nodes: EngineWorkflowNodeRow[];
  edges: EngineWorkflowEdgeRow[];
  outputBucket?: Record<string, unknown> | null;
  outputPath?: string | null;
  totalExecutions: number;
  successfulRuns: number;
  failedRuns: number;
  lastExecutedAt?: string | null;
  /** Schedule (cron) trigger — driven by the local scheduler. All optional so
   *  pre-schedule workflow files load unchanged. */
  scheduleEnabled?: boolean;
  scheduleCron?: string | null;
  scheduleTimezone?: string | null;
  scheduleNextRun?: string | null;
  scheduleLastRun?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A single node's result inside a stored execution. */
export interface StoredNodeResult {
  nodeId: string;
  status: IrisNodeResultStatus;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  assets?: unknown;
  duration?: number;
  tokensUsed?: number;
  apiCost?: number;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string;
}

/** An execution as persisted on disk (status + node results + logs in one file). */
export interface StoredExecution {
  id: string;
  workflowId: string;
  userId: string;
  status: IrisExecutionStatus;
  triggerType: string;
  triggerData: unknown;
  inputData: Record<string, unknown>;
  batchJobId?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  outputAssets: unknown;
  totalTokensUsed: number;
  estimatedCost: number;
  errorMessage: string | null;
  errorNodeId?: string | null;
  nodeResults: Record<string, StoredNodeResult>;
  logs: (WorkflowLogEntry & { timestamp: string })[];
  createdAt: string;
}

export class LocalWorkflowStore implements WorkflowStore {
  private workflowsDir: string;
  private executionsDir: string;

  constructor(dataDir: string) {
    this.workflowsDir = path.join(dataDir, 'workflows');
    this.executionsDir = path.join(dataDir, 'executions');
  }

  private workflowFile(id: string): string {
    return path.join(this.workflowsDir, `${id}.json`);
  }

  private executionFile(id: string): string {
    return path.join(this.executionsDir, `${id}.json`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // WorkflowStore interface (called by the engine)
  // ──────────────────────────────────────────────────────────────────────────

  async loadWorkflow(workflowId: string): Promise<EngineWorkflowData | null> {
    const wf = await this.getWorkflow(workflowId);
    if (!wf) return null;
    return {
      id: wf.id,
      name: wf.name,
      userId: wf.userId,
      // id === nodeId locally; the engine only uses `.id` for edge resolution.
      nodes: wf.nodes.map(n => ({ ...n, id: n.id || n.nodeId })),
      edges: wf.edges,
      outputBucket: wf.outputBucket ?? null,
      outputPath: wf.outputPath ?? null,
    };
  }

  async createExecution(input: CreateExecutionInput): Promise<EngineExecution> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const execution: StoredExecution = {
      id,
      workflowId: input.workflowId,
      userId: input.userId,
      status: 'PENDING',
      triggerType: input.triggerType,
      triggerData: input.triggerData ?? {},
      inputData: input.inputData ?? {},
      batchJobId: input.batchJobId,
      startedAt: null,
      completedAt: null,
      outputAssets: [],
      totalTokensUsed: 0,
      estimatedCost: 0,
      errorMessage: null,
      errorNodeId: null,
      nodeResults: {},
      logs: [],
      createdAt: now,
    };
    await writeJson(this.executionFile(id), execution);
    return { id, workflowId: input.workflowId, status: 'PENDING' };
  }

  async getExecutionResult(
    executionId: string,
  ): Promise<EngineExecutionResult | null> {
    const exec = await this.readExecution(executionId);
    if (!exec) return null;
    return {
      status: exec.status,
      outputAssets: exec.outputAssets,
      errorMessage: exec.errorMessage,
    };
  }

  async updateExecutionStatus(
    executionId: string,
    status: IrisExecutionStatus,
  ): Promise<void> {
    await this.mutateExecution(executionId, exec => {
      exec.status = status;
      const now = new Date().toISOString();
      if (status === 'RUNNING') {
        exec.startedAt = now;
      } else if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(status)) {
        exec.completedAt = now;
      }
    });
  }

  async finalizeExecution(
    executionId: string,
    detail: FinalizeExecutionDetail,
  ): Promise<void> {
    await this.mutateExecution(executionId, exec => {
      exec.status = detail.status;
      exec.completedAt = new Date().toISOString();
      exec.outputAssets = detail.outputAssets;
      exec.totalTokensUsed = detail.totalTokensUsed;
      exec.estimatedCost = detail.estimatedCost;
      exec.errorMessage = detail.errorMessage ?? null;
      exec.errorNodeId = detail.errorNodeId ?? null;
    });
  }

  async startNodeResult(
    executionId: string,
    nodeId: string,
    inputData: Record<string, unknown>,
  ): Promise<void> {
    await this.mutateExecution(executionId, exec => {
      exec.nodeResults[nodeId] = {
        nodeId,
        status: 'RUNNING',
        inputData,
        startedAt: new Date().toISOString(),
      };
    });
  }

  async ensureNodeResult(executionId: string, nodeId: string): Promise<void> {
    await this.mutateExecution(executionId, exec => {
      if (exec.nodeResults[nodeId]) return;
      exec.nodeResults[nodeId] = {
        nodeId,
        status: 'RUNNING',
        inputData: {},
        startedAt: new Date().toISOString(),
      };
    });
  }

  async saveNodeResult(
    executionId: string,
    nodeId: string,
    result: NodeResult,
  ): Promise<void> {
    await this.mutateExecution(executionId, exec => {
      const existing = exec.nodeResults[nodeId];
      exec.nodeResults[nodeId] = {
        ...existing,
        nodeId,
        status:
          result.status === 'completed'
            ? 'COMPLETED'
            : result.status === 'failed'
              ? 'FAILED'
              : 'SKIPPED',
        outputData: result.outputs,
        assets: result.assets,
        duration: result.duration,
        tokensUsed: result.usage?.totalTokens ?? 0,
        apiCost: result.usage?.estimatedCost ?? 0,
        errorMessage: result.error?.message ?? null,
        completedAt: new Date().toISOString(),
      };
    });
  }

  async updateNodeProgress(
    executionId: string,
    nodeId: string,
    progress: NodeProgress,
  ): Promise<void> {
    await this.mutateExecution(executionId, exec => {
      const existing = exec.nodeResults[nodeId] ?? { nodeId, status: 'RUNNING' };
      const status =
        progress.status === 'completed'
          ? 'COMPLETED'
          : progress.status === 'failed'
            ? 'FAILED'
            : 'RUNNING';
      const next: StoredNodeResult = { ...existing, nodeId, status };
      if (progress.outputData !== undefined) next.outputData = progress.outputData;
      if (progress.assets !== undefined) next.assets = progress.assets;
      if (progress.duration !== undefined) next.duration = progress.duration;
      if (progress.errorMessage !== undefined) {
        next.errorMessage = progress.errorMessage;
      }
      exec.nodeResults[nodeId] = next;
    });
  }

  async appendLog(executionId: string, entry: WorkflowLogEntry): Promise<void> {
    try {
      await this.mutateExecution(executionId, exec => {
        exec.logs.push({ ...entry, timestamp: new Date().toISOString() });
      });
    } catch {
      // best-effort, mirroring the cloud store
    }
  }

  async incrementWorkflowStats(
    workflowId: string,
    outcome: WorkflowRunOutcome,
  ): Promise<void> {
    await this.mutateWorkflow(workflowId, wf => {
      wf.totalExecutions += 1;
      if (outcome === 'completed') wf.successfulRuns += 1;
      if (outcome === 'failed') wf.failedRuns += 1;
      wf.lastExecutedAt = new Date().toISOString();
    });
  }

  async setWorkflowStatus(
    workflowId: string,
    status: 'PAUSED',
  ): Promise<void> {
    await this.mutateWorkflow(workflowId, wf => {
      wf.status = status;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRUD helpers (called by the local REST API)
  // ──────────────────────────────────────────────────────────────────────────

  async getWorkflow(id: string): Promise<StoredWorkflow | null> {
    return readJsonOrNull<StoredWorkflow>(this.workflowFile(id));
  }

  async listWorkflows(): Promise<StoredWorkflow[]> {
    const ids = await listJsonIds(this.workflowsDir);
    const all = await Promise.all(ids.map(id => this.getWorkflow(id)));
    return all
      .filter((w): w is StoredWorkflow => w !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createWorkflow(
    input: { name?: string; userId: string } & Partial<
      Pick<StoredWorkflow, 'nodes' | 'edges' | 'outputBucket' | 'outputPath'>
    >,
  ): Promise<StoredWorkflow> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const wf: StoredWorkflow = {
      id,
      name: input.name ?? 'Untitled workflow',
      userId: input.userId,
      status: 'DRAFT',
      nodes: input.nodes ?? [],
      edges: input.edges ?? [],
      outputBucket: input.outputBucket ?? null,
      outputPath: input.outputPath ?? null,
      totalExecutions: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastExecutedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeJson(this.workflowFile(id), wf);
    return wf;
  }

  async updateWorkflow(
    id: string,
    patch: Partial<
      Pick<
        StoredWorkflow,
        'name' | 'status' | 'nodes' | 'edges' | 'outputBucket' | 'outputPath'
      >
    >,
  ): Promise<StoredWorkflow | null> {
    return this.mutateWorkflow(id, wf => {
      if (patch.name !== undefined) wf.name = patch.name;
      if (patch.status !== undefined) wf.status = patch.status;
      if (patch.nodes !== undefined) wf.nodes = patch.nodes;
      if (patch.edges !== undefined) wf.edges = patch.edges;
      if (patch.outputBucket !== undefined) wf.outputBucket = patch.outputBucket;
      if (patch.outputPath !== undefined) wf.outputPath = patch.outputPath;
    });
  }

  /** Update schedule (cron) settings. `touch=false` skips bumping `updatedAt`
   *  so the scheduler's per-run bookkeeping doesn't constantly reorder the list
   *  (which is sorted by `updatedAt`). */
  async updateSchedule(
    id: string,
    patch: Partial<{
      enabled: boolean;
      cron: string | null;
      timezone: string | null;
      nextRun: string | null;
      lastRun: string | null;
    }>,
    touch = true,
  ): Promise<StoredWorkflow | null> {
    return this.mutateWorkflow(
      id,
      wf => {
        if (patch.enabled !== undefined) wf.scheduleEnabled = patch.enabled;
        if (patch.cron !== undefined) wf.scheduleCron = patch.cron;
        if (patch.timezone !== undefined) wf.scheduleTimezone = patch.timezone;
        if (patch.nextRun !== undefined) wf.scheduleNextRun = patch.nextRun;
        if (patch.lastRun !== undefined) wf.scheduleLastRun = patch.lastRun;
      },
      touch,
    );
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.workflowFile(id));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async cloneWorkflow(id: string): Promise<StoredWorkflow | null> {
    const src = await this.getWorkflow(id);
    if (!src) return null;
    return this.createWorkflow({
      name: `${src.name} (copy)`,
      userId: src.userId,
      nodes: src.nodes,
      edges: src.edges,
      outputBucket: src.outputBucket,
      outputPath: src.outputPath,
    });
  }

  /** Replace the workflow's node set (editor bulk-save). */
  async setNodes(
    id: string,
    nodes: EngineWorkflowNodeRow[],
  ): Promise<StoredWorkflow | null> {
    return this.mutateWorkflow(id, wf => {
      wf.nodes = nodes.map(n => ({ ...n, id: n.id || n.nodeId }));
    });
  }

  async deleteNodes(
    id: string,
    nodeIds: string[],
  ): Promise<StoredWorkflow | null> {
    const drop = new Set(nodeIds);
    return this.mutateWorkflow(id, wf => {
      wf.nodes = wf.nodes.filter(n => !drop.has(n.nodeId));
      wf.edges = wf.edges.filter(
        e => !drop.has(e.sourceNodeId) && !drop.has(e.targetNodeId),
      );
    });
  }

  async setEdges(
    id: string,
    edges: EngineWorkflowEdgeRow[],
  ): Promise<StoredWorkflow | null> {
    return this.mutateWorkflow(id, wf => {
      wf.edges = edges;
    });
  }

  async deleteEdges(
    id: string,
    edgeIds: string[],
  ): Promise<StoredWorkflow | null> {
    const drop = new Set(edgeIds);
    return this.mutateWorkflow(id, wf => {
      wf.edges = wf.edges.filter(e => !drop.has(e.edgeId));
    });
  }

  async getExecution(id: string): Promise<StoredExecution | null> {
    return this.readExecution(id);
  }

  async listExecutions(workflowId?: string): Promise<StoredExecution[]> {
    const ids = await listJsonIds(this.executionsDir);
    const all = await Promise.all(ids.map(id => this.readExecution(id)));
    return all
      .filter((e): e is StoredExecution => e !== null)
      .filter(e => !workflowId || e.workflowId === workflowId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // internals
  // ──────────────────────────────────────────────────────────────────────────

  private readExecution(id: string): Promise<StoredExecution | null> {
    return readJsonOrNull<StoredExecution>(this.executionFile(id));
  }

  /** Read-modify-write a workflow file under a per-file lock. `touchUpdatedAt`
   *  controls whether `updatedAt` is refreshed (the scheduler skips it). */
  private async mutateWorkflow(
    id: string,
    mutate: (wf: StoredWorkflow) => void,
    touchUpdatedAt = true,
  ): Promise<StoredWorkflow | null> {
    const file = this.workflowFile(id);
    return withFileLock(file, async () => {
      const wf = await readJsonOrNull<StoredWorkflow>(file);
      if (!wf) return null;
      mutate(wf);
      if (touchUpdatedAt) wf.updatedAt = new Date().toISOString();
      await writeJson(file, wf);
      return wf;
    });
  }

  /** Read-modify-write an execution file under a per-file lock. */
  private async mutateExecution(
    id: string,
    mutate: (exec: StoredExecution) => void,
  ): Promise<void> {
    const file = this.executionFile(id);
    await withFileLock(file, async () => {
      const exec = await readJsonOrNull<StoredExecution>(file);
      if (!exec) return;
      mutate(exec);
      await writeJson(file, exec);
    });
  }
}
