/**
 * Local batch execution — the open-source mirror of the cloud's
 * `batch.service.ts`. Runs a workflow once per data row, locally, on the
 * long-lived server (desktop daemon / `npx iris-flow`) so a batch keeps going
 * with the UI closed.
 *
 * Unlike the cloud (which parses an uploaded xlsx/csv/json server-side), the
 * client sends already-parsed `rows` + a `columnMapping` (column → variable),
 * keeping the host dep-light. Each job is one JSON file under `<dataDir>/batch/`.
 *
 * Concurrency / delay / retry / cancel semantics mirror the cloud service:
 *  - a fixed-size worker pool (clamped 1..MAX_CONCURRENCY),
 *  - an inter-row delay applied *after* each completion (rate-limit friendly),
 *  - per-row retry with exponential backoff (capped),
 *  - cooperative cancellation via an AbortController (in-flight rows finish; a
 *    paused job leaves pending rows pending for resume).
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { WorkflowEngine } from 'iris-engine';
import type { LocalWorkflowStore } from './local-workflow-store.js';
import { withFileLock, readJsonOrNull, writeJson, listJsonIds } from './fs-util.js';

export const MAX_CONCURRENCY = 10;
const ROW_TIMEOUT_MS = 30 * 60 * 1000; // 30 min per row
const POLL_INTERVAL_MS = 1500;
const MAX_BACKOFF_MS = 30 * 1000;

export type BatchJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type BatchRowStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING';

export interface BatchRow {
  rowNumber: number;
  variables: Record<string, unknown>;
  status: BatchRowStatus;
  executionId?: string | null;
  outputData?: Record<string, unknown> | null;
  errorMessage?: string | null;
  retryCount: number;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface BatchJob {
  id: string;
  workflowId: string;
  name: string;
  status: BatchJobStatus;
  concurrency: number;
  stopOnError: boolean;
  rowDelayMs: number;
  maxRetries: number;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  errorSummary: Array<{ row: number; error: string }>;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  rows: BatchRow[];
}

export interface CreateBatchInput {
  workflowId: string;
  name?: string;
  /** Parsed data rows (client-side file parse). */
  rows: Array<Record<string, unknown>>;
  /** column name → workflow variable name. Identity-mapped if omitted. */
  columnMapping?: Record<string, string>;
  concurrency?: number;
  stopOnError?: boolean;
  rowDelayMs?: number;
  maxRetries?: number;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

/** A job summary (no per-row detail) for list endpoints. */
export type BatchJobSummary = Omit<BatchJob, 'rows'>;

function summarize(job: BatchJob): BatchJobSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rows, ...rest } = job;
  return rest;
}

export class BatchManager {
  private batchDir: string;
  /** jobId → abort controller for an in-flight run. */
  private active = new Map<string, AbortController>();

  constructor(
    dataDir: string,
    private readonly engine: WorkflowEngine,
    private readonly store: LocalWorkflowStore,
    private readonly userId: string,
  ) {
    this.batchDir = path.join(dataDir, 'batch');
  }

  private jobFile(id: string): string {
    return path.join(this.batchDir, `${id}.json`);
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async createJob(input: CreateBatchInput): Promise<BatchJob> {
    const mapping = input.columnMapping ?? {};
    const remap = (raw: Record<string, unknown>): Record<string, unknown> => {
      if (Object.keys(mapping).length === 0) return raw;
      const out: Record<string, unknown> = {};
      for (const [col, varName] of Object.entries(mapping)) {
        out[varName] = raw[col];
      }
      return out;
    };

    const rows: BatchRow[] = input.rows.map((raw, i) => ({
      rowNumber: i + 1,
      variables: remap(raw),
      status: 'PENDING',
      retryCount: 0,
    }));

    const job: BatchJob = {
      id: randomUUID(),
      workflowId: input.workflowId,
      name: input.name ?? 'Batch job',
      status: 'PENDING',
      concurrency: clamp(input.concurrency ?? 1, 1, MAX_CONCURRENCY),
      stopOnError: input.stopOnError ?? false,
      rowDelayMs: Math.max(0, input.rowDelayMs ?? 0),
      maxRetries: Math.max(0, input.maxRetries ?? 0),
      totalRows: rows.length,
      processedRows: 0,
      successfulRows: 0,
      failedRows: 0,
      errorSummary: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      rows,
    };
    await writeJson(this.jobFile(job.id), job);
    return job;
  }

  async getJob(id: string): Promise<BatchJob | null> {
    return readJsonOrNull<BatchJob>(this.jobFile(id));
  }

  async listJobs(): Promise<BatchJobSummary[]> {
    const ids = await listJsonIds(this.batchDir);
    const all = await Promise.all(ids.map(id => this.getJob(id)));
    return all
      .filter((j): j is BatchJob => j !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(summarize);
  }

  async updateJob(
    id: string,
    patch: Partial<{
      name: string;
      concurrency: number;
      stopOnError: boolean;
      rowDelayMs: number;
      maxRetries: number;
    }>,
  ): Promise<BatchJobSummary | null> {
    const job = await this.mutateJob(id, j => {
      if (patch.name !== undefined) j.name = patch.name;
      if (patch.concurrency !== undefined) {
        j.concurrency = clamp(patch.concurrency, 1, MAX_CONCURRENCY);
      }
      if (patch.stopOnError !== undefined) j.stopOnError = patch.stopOnError;
      if (patch.rowDelayMs !== undefined) {
        j.rowDelayMs = Math.max(0, patch.rowDelayMs);
      }
      if (patch.maxRetries !== undefined) {
        j.maxRetries = Math.max(0, patch.maxRetries);
      }
    });
    return job ? summarize(job) : null;
  }

  async deleteJob(id: string): Promise<boolean> {
    this.active.get(id)?.abort();
    this.active.delete(id);
    try {
      await fs.unlink(this.jobFile(id));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw e;
    }
  }

  async jobStatus(id: string): Promise<{
    id: string;
    status: BatchJobStatus;
    totalRows: number;
    processedRows: number;
    successfulRows: number;
    failedRows: number;
    percent: number;
  } | null> {
    const job = await this.getJob(id);
    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      successfulRows: job.successfulRows,
      failedRows: job.failedRows,
      percent: job.totalRows
        ? Math.round((job.processedRows / job.totalRows) * 100)
        : 0,
    };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Start (or resume) processing of all PENDING rows. */
  async start(id: string): Promise<BatchJobSummary | null> {
    const job = await this.getJob(id);
    if (!job) return null;
    if (this.active.has(id)) return summarize(job); // already running
    await this.mutateJob(id, j => {
      j.status = 'PROCESSING';
      if (!j.startedAt) j.startedAt = new Date().toISOString();
    });
    void this.run(id);
    const updated = await this.getJob(id);
    return updated ? summarize(updated) : null;
  }

  /** Pause: stop launching new rows; in-flight rows finish, pending stay pending. */
  async pause(id: string): Promise<BatchJobSummary | null> {
    this.active.get(id)?.abort();
    this.active.delete(id);
    const job = await this.mutateJob(id, j => {
      if (j.status === 'PROCESSING') j.status = 'PAUSED';
    });
    return job ? summarize(job) : null;
  }

  /** Resume a paused job (re-process PENDING/RETRYING rows). */
  async resume(id: string): Promise<BatchJobSummary | null> {
    return this.start(id);
  }

  /** Cancel: abort and mark CANCELLED (pending rows are left as-is). */
  async cancel(id: string): Promise<BatchJobSummary | null> {
    this.active.get(id)?.abort();
    this.active.delete(id);
    const job = await this.mutateJob(id, j => {
      j.status = 'CANCELLED';
      j.completedAt = new Date().toISOString();
    });
    return job ? summarize(job) : null;
  }

  /** Re-queue FAILED rows as PENDING and start again. Rolls back each retried
   *  row's counter contribution so the rerun re-counts it (no double-counting). */
  async retryFailed(id: string): Promise<BatchJobSummary | null> {
    const job = await this.mutateJob(id, j => {
      const retriedRows = new Set<number>();
      for (const row of j.rows) {
        if (row.status === 'FAILED') {
          row.status = 'PENDING';
          row.retryCount = 0;
          row.errorMessage = null;
          retriedRows.add(row.rowNumber);
          j.failedRows = Math.max(0, j.failedRows - 1);
          j.processedRows = Math.max(0, j.processedRows - 1);
        }
      }
      // Drop the stale error-summary entries for the rows being retried.
      j.errorSummary = j.errorSummary.filter(e => !retriedRows.has(e.row));
    });
    if (!job) return null;
    return this.start(id);
  }

  // ── Run loop ─────────────────────────────────────────────────────────────────

  private async run(id: string): Promise<void> {
    const job = await this.getJob(id);
    if (!job) return;

    const controller = new AbortController();
    this.active.set(id, controller);
    const signal = controller.signal;

    const pending = job.rows.filter(
      r => r.status === 'PENDING' || r.status === 'RETRYING',
    );
    const total = pending.length;
    let completed = 0;
    let stopRequested = false;

    const queue = [...pending];
    const concurrency = clamp(job.concurrency, 1, MAX_CONCURRENCY);

    const worker = async (): Promise<void> => {
      while (!signal.aborted && !stopRequested) {
        const row = queue.shift();
        if (!row) return;
        const ok = await this.processRow(job, row.rowNumber, signal);
        completed++;
        if (!ok && job.stopOnError) {
          stopRequested = true;
        }
        // Inter-row delay (skip after the final row, or if aborted/stopping).
        if (
          job.rowDelayMs > 0 &&
          completed < total &&
          !signal.aborted &&
          !stopRequested
        ) {
          await this.delay(job.rowDelayMs, signal);
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, total || 1) }, () => worker()),
      );
    } finally {
      this.active.delete(id);
      await this.finalize(id, signal.aborted || stopRequested);
    }
  }

  /** Execute one row, poll to completion, persist the result. Returns success. */
  private async processRow(
    job: BatchJob,
    rowNumber: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (signal.aborted) return false;
    const maxRetries = job.maxRetries;
    let attempt = 0;

    while (true) {
      await this.mutateJob(job.id, j => {
        const row = j.rows.find(r => r.rowNumber === rowNumber);
        if (row) {
          row.status = attempt > 0 ? 'RETRYING' : 'PROCESSING';
          row.startedAt = new Date().toISOString();
        }
      });

      const current = await this.getJob(job.id);
      const variables =
        current?.rows.find(r => r.rowNumber === rowNumber)?.variables ?? {};

      let status = 'FAILED';
      let executionId: string | null = null;
      let errorMessage: string | null = null;
      let outputData: Record<string, unknown> | null = null;

      try {
        const execution = await this.engine.execute(job.workflowId, this.userId, {
          inputs: variables,
          trigger: { type: 'api', data: { batchJobId: job.id, rowNumber } },
          batchJobId: job.id,
          batchRowNumber: rowNumber,
        });
        executionId = execution.id;
        const result = await this.pollExecution(execution.id, signal);
        status = result.status;
        errorMessage = result.errorMessage;
        outputData = result.outputData;
      } catch (e) {
        status = 'FAILED';
        errorMessage = e instanceof Error ? e.message : 'Execution failed';
      }

      const success = status === 'COMPLETED';

      if (!success && attempt < maxRetries && !signal.aborted) {
        attempt++;
        const backoff = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        await this.delay(backoff, signal);
        continue; // retry
      }

      await this.mutateJob(job.id, j => {
        const row = j.rows.find(r => r.rowNumber === rowNumber);
        if (row) {
          row.status = success ? 'COMPLETED' : 'FAILED';
          row.executionId = executionId;
          row.outputData = outputData;
          row.errorMessage = errorMessage;
          row.retryCount = attempt;
          row.completedAt = new Date().toISOString();
        }
        j.processedRows += 1;
        if (success) j.successfulRows += 1;
        else {
          j.failedRows += 1;
          if (errorMessage) {
            j.errorSummary.push({ row: rowNumber, error: errorMessage });
          }
        }
      });

      return success;
    }
  }

  /** Poll an execution until it reaches a terminal state (or abort/timeout). */
  private async pollExecution(
    executionId: string,
    signal: AbortSignal,
  ): Promise<{
    status: string;
    errorMessage: string | null;
    outputData: Record<string, unknown> | null;
  }> {
    const deadline = Date.now() + ROW_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (signal.aborted) {
        return { status: 'CANCELLED', errorMessage: 'Cancelled', outputData: null };
      }
      const exec = await this.store.getExecution(executionId);
      if (exec && ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(exec.status)) {
        return {
          status: exec.status,
          errorMessage: exec.errorMessage ?? null,
          outputData: { outputAssets: exec.outputAssets },
        };
      }
      await this.delay(POLL_INTERVAL_MS, signal);
    }
    return { status: 'TIMEOUT', errorMessage: 'Row timed out', outputData: null };
  }

  /** Settle the job's terminal status once the run loop drains. */
  private async finalize(id: string, interrupted: boolean): Promise<void> {
    await this.mutateJob(id, j => {
      if (j.status === 'CANCELLED') return; // explicit cancel wins
      const anyPending = j.rows.some(
        r => r.status === 'PENDING' || r.status === 'RETRYING',
      );
      if (interrupted && anyPending) {
        // stop-on-error or pause left rows behind.
        j.status = j.status === 'PAUSED' ? 'PAUSED' : 'FAILED';
        return;
      }
      j.status = j.failedRows > 0 ? 'FAILED' : 'COMPLETED';
      j.completedAt = new Date().toISOString();
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  /** Abortable delay — resolves early (doesn't reject) when the signal fires. */
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      if (signal.aborted) return resolve();
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(t);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private mutateJob(
    id: string,
    mutate: (job: BatchJob) => void,
  ): Promise<BatchJob | null> {
    const file = this.jobFile(id);
    return withFileLock(file, async () => {
      const job = await readJsonOrNull<BatchJob>(file);
      if (!job) return null;
      mutate(job);
      await writeJson(file, job);
      return job;
    });
  }
}
