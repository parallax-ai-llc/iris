/**
 * ExecutionRecordStore — where run records (status, node results, logs) live.
 *
 * `LocalWorkflowStore` used to read and rewrite `<dataDir>/executions/<id>.json`
 * itself. That file-per-run layout rewrites the whole record on every node
 * step (04-workflow-editor.md R-07), so the record store is now a port: the
 * JSON-file implementation below keeps today's layout for `npx iris-flow`, and
 * the desktop app can inject another (e.g. SQLite owned by its Rust core)
 * without touching the engine or the REST routes.
 */

import path from 'node:path';
import type { WorkflowLogEntry } from 'iris-engine';
import {
  listJsonIds,
  readJsonOrNull,
  withFileLock,
  writeJson,
} from './fs-util.js';
import type { StoredExecution } from './local-workflow-store.js';

export interface ExecutionRecordStore {
  /** Store a new record (status PENDING). */
  create(execution: StoredExecution): Promise<void>;
  get(id: string): Promise<StoredExecution | null>;
  /** Read-modify-write one record; concurrent updates of a record are serialized. */
  update(id: string, mutate: (execution: StoredExecution) => void): Promise<void>;
  /** All records (any order). */
  list(): Promise<StoredExecution[]>;
  /** Append a log line (best-effort for callers). */
  appendLog(id: string, entry: WorkflowLogEntry & { timestamp: string }): Promise<void>;
}

/** One JSON file per run under `<dataDir>/executions/` (atomic writes). */
export class JsonFileExecutionRecords implements ExecutionRecordStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'executions');
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  async create(execution: StoredExecution): Promise<void> {
    await writeJson(this.file(execution.id), execution);
  }

  get(id: string): Promise<StoredExecution | null> {
    return readJsonOrNull<StoredExecution>(this.file(id));
  }

  async update(id: string, mutate: (execution: StoredExecution) => void): Promise<void> {
    const file = this.file(id);
    await withFileLock(file, async () => {
      const exec = await readJsonOrNull<StoredExecution>(file);
      if (!exec) return;
      mutate(exec);
      await writeJson(file, exec);
    });
  }

  async list(): Promise<StoredExecution[]> {
    const ids = await listJsonIds(this.dir);
    const all = await Promise.all(ids.map(id => this.get(id).catch(() => null)));
    return all.filter((e): e is StoredExecution => e !== null);
  }

  async appendLog(id: string, entry: WorkflowLogEntry & { timestamp: string }): Promise<void> {
    await this.update(id, exec => {
      exec.logs.push(entry);
    });
  }
}

/** Error text stored on runs that were still open when the engine stopped. */
export const INTERRUPTED_MESSAGE =
  'INTERRUPTED: the engine stopped before this run finished';

/**
 * Close runs left RUNNING / PENDING by an engine that died (R-04): the run and
 * its open node results become FAILED with `INTERRUPTED`. Call once at start,
 * before new runs are accepted. Returns the ids it closed.
 */
export async function recoverInterruptedExecutions(
  records: ExecutionRecordStore,
  now: () => Date = () => new Date(),
): Promise<string[]> {
  const closed: string[] = [];
  for (const exec of await records.list()) {
    if (exec.status !== 'RUNNING' && exec.status !== 'PENDING') continue;
    await records.update(exec.id, record => {
      if (record.status !== 'RUNNING' && record.status !== 'PENDING') return;
      const at = now().toISOString();
      record.status = 'FAILED';
      record.completedAt = at;
      record.errorMessage = INTERRUPTED_MESSAGE;
      for (const result of Object.values(record.nodeResults)) {
        if (result.status === 'RUNNING' || result.status === 'PENDING') {
          result.status = 'FAILED';
          result.errorMessage = INTERRUPTED_MESSAGE;
          result.completedAt = at;
        }
      }
      record.logs.push({
        level: 'WARN',
        eventType: 'EXECUTION_INTERRUPTED',
        message: INTERRUPTED_MESSAGE,
        timestamp: at,
      });
    });
    closed.push(exec.id);
  }
  return closed;
}
