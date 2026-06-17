/**
 * Iris API — Batch operations (LOCAL).
 *
 * Batch jobs run on the embedded local engine / detached daemon (see
 * iris-host-local `batch.ts`), not the cloud. The daemon takes already-parsed
 * rows, so file parsing happens client-side here. Function signatures are kept
 * identical to the previous cloud client so the batch store/components are
 * unchanged; this module maps the daemon's shapes onto `batch.types`.
 */

import ExcelJS from 'exceljs';
import { irisLocalFetch, listLocalWorkflows } from './iris-local';
import {
  BatchJob,
  BatchJobListResponse,
  BatchJobStatusResponse,
  BatchRowResultsResponse,
  BatchRowResult,
  BatchActionResponse,
  BatchJobStatus,
  BatchRowStatus,
  CreateBatchJobInput,
  UpdateBatchJobInput,
  BatchQueryParams,
} from '@/types/batch.types';

// ── Daemon shapes (mirrors iris-host-local/src/batch.ts) ─────────────────────

interface DaemonBatchRow {
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

interface DaemonBatchJob {
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
  rows?: DaemonBatchRow[];
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

function mapJob(job: DaemonBatchJob, workflowName = ''): BatchJob {
  return {
    id: job.id,
    workflowId: job.workflowId,
    workflowName,
    name: job.name,
    status: job.status,
    fileType: 'XLSX',
    originalFilename: '',
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    successfulRows: job.successfulRows,
    failedRows: job.failedRows,
    columnMappings: [],
    concurrency: job.concurrency,
    stopOnError: job.stopOnError,
    notifyOnComplete: false,
    notifyOnError: false,
    startedAt: job.startedAt ?? undefined,
    completedAt: job.completedAt ?? undefined,
    createdAt: job.createdAt,
    updatedAt: job.createdAt,
  };
}

function mapRow(row: DaemonBatchRow): BatchRowResult {
  return {
    id: String(row.rowNumber),
    rowNumber: row.rowNumber,
    status: row.status,
    inputData: row.variables,
    outputData: row.outputData ?? undefined,
    executionId: row.executionId ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    retryCount: row.retryCount,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.startedAt ?? '',
  };
}

function actionResult(job: DaemonBatchJob): BatchActionResponse {
  return { success: true, message: '', jobId: job.id, status: job.status };
}

/** id → workflow name, for decorating jobs (the daemon stores only the id). */
async function workflowNameMap(): Promise<Map<string, string>> {
  try {
    const workflows = await listLocalWorkflows();
    return new Map(workflows.map(w => [w.id, w.name]));
  } catch {
    return new Map();
  }
}

// ── Client-side file parsing (xlsx / csv / json) ─────────────────────────────

async function parseRows(file: File): Promise<Array<Record<string, unknown>>> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith('.json')) {
    const parsed = JSON.parse(new TextDecoder().decode(buffer));
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  if (name.endsWith('.csv')) {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];
    const headers = lines[0]
      .split(',')
      .map(h => h.trim().replace(/^["']|["']$/g, ''));
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => (row[h] = values[i] ?? ''));
      return row;
    });
  }

  // xlsx
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) return [];
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim();
  });
  const rows: Array<Record<string, unknown>> = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const xRow = sheet.getRow(r);
    const row: Record<string, unknown> = {};
    let hasData = false;
    headers.forEach((h, i) => {
      const value = xRow.getCell(i + 1).value;
      row[h] = value ?? '';
      if (value !== null && value !== undefined && value !== '') hasData = true;
    });
    if (hasData) rows.push(row);
  }
  return rows;
}

// ── Public API (same signatures as the old cloud client) ─────────────────────

export async function getBatchJobs(
  params?: BatchQueryParams,
): Promise<BatchJobListResponse | null> {
  const [{ jobs }, names] = await Promise.all([
    irisLocalFetch<{ jobs: DaemonBatchJob[] }>('/api/iris/batch'),
    workflowNameMap(),
  ]);

  let mapped = jobs.map(j => mapJob(j, names.get(j.workflowId) ?? ''));

  // Client-side search + status filter (the daemon returns all jobs).
  const search = params?.search?.trim().toLowerCase();
  if (search) {
    mapped = mapped.filter(
      j =>
        j.name.toLowerCase().includes(search) ||
        j.workflowName.toLowerCase().includes(search),
    );
  }
  if (params?.status) {
    mapped = mapped.filter(j => j.status === params.status);
  }

  const limit = params?.limit ?? 12;
  const page = params?.page ?? 1;
  const total = mapped.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageJobs = mapped.slice((page - 1) * limit, page * limit);

  return { jobs: pageJobs, total, page, limit, totalPages };
}

export async function getBatchJob(id: string): Promise<BatchJob | null> {
  try {
    const { job } = await irisLocalFetch<{ job: DaemonBatchJob }>(
      `/api/iris/batch/${id}`,
    );
    const names = await workflowNameMap();
    return mapJob(job, names.get(job.workflowId) ?? '');
  } catch {
    return null;
  }
}

export async function createBatchJob(
  data: CreateBatchJobInput,
  file: File,
): Promise<BatchJob | null> {
  const rows = await parseRows(file);
  const columnMapping: Record<string, string> = {};
  for (const m of data.columnMappings) {
    columnMapping[m.columnName] = m.variableName;
  }

  const { job } = await irisLocalFetch<{ job: DaemonBatchJob }>(
    '/api/iris/batch',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: data.workflowId,
        name: data.name,
        rows,
        columnMapping,
        concurrency: data.concurrency,
        stopOnError: data.stopOnError,
      }),
    },
  );
  return mapJob(job);
}

export async function updateBatchJob(
  id: string,
  data: UpdateBatchJobInput,
): Promise<BatchJob | null> {
  try {
    const { job } = await irisLocalFetch<{ job: DaemonBatchJob }>(
      `/api/iris/batch/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          concurrency: data.concurrency,
          stopOnError: data.stopOnError,
        }),
      },
    );
    return mapJob(job);
  } catch {
    return null;
  }
}

export async function deleteBatchJob(id: string): Promise<boolean> {
  try {
    await irisLocalFetch(`/api/iris/batch/${id}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

export async function getBatchJobStatus(
  id: string,
): Promise<BatchJobStatusResponse | null> {
  try {
    const s = await irisLocalFetch<{
      id: string;
      status: BatchJobStatus;
      totalRows: number;
      processedRows: number;
      successfulRows: number;
      failedRows: number;
      percent: number;
    }>(`/api/iris/batch/${id}/status`);
    return {
      id: s.id,
      status: s.status,
      progress: {
        totalRows: s.totalRows,
        processedRows: s.processedRows,
        successfulRows: s.successfulRows,
        failedRows: s.failedRows,
        percent: s.percent,
      },
      errors: [],
    };
  } catch {
    return null;
  }
}

export async function getBatchJobRows(
  id: string,
  params?: { page?: number; limit?: number },
): Promise<BatchRowResultsResponse | null> {
  try {
    const { rows } = await irisLocalFetch<{ rows: DaemonBatchRow[] }>(
      `/api/iris/batch/${id}/rows`,
    );
    const limit = params?.limit ?? 20;
    const page = params?.page ?? 1;
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const slice = rows.slice((page - 1) * limit, page * limit).map(mapRow);
    return { results: slice, total, page, limit, totalPages };
  } catch {
    return null;
  }
}

async function action(
  id: string,
  verb: 'start' | 'pause' | 'resume' | 'cancel' | 'retry',
): Promise<BatchActionResponse | null> {
  try {
    const { job } = await irisLocalFetch<{ job: DaemonBatchJob }>(
      `/api/iris/batch/${id}/${verb}`,
      { method: 'POST' },
    );
    return actionResult(job);
  } catch {
    return null;
  }
}

export const startBatchJob = (id: string) => action(id, 'start');
export const pauseBatchJob = (id: string) => action(id, 'pause');
export const resumeBatchJob = (id: string) => action(id, 'resume');
export const cancelBatchJob = (id: string) => action(id, 'cancel');
export const retryBatchJob = (id: string) => action(id, 'retry');

/** Build the results export client-side (the daemon has no download endpoint). */
export async function downloadBatchResults(
  id: string,
  format: 'xlsx' | 'csv',
): Promise<Blob | null> {
  try {
    const { rows } = await irisLocalFetch<{ rows: DaemonBatchRow[] }>(
      `/api/iris/batch/${id}/rows`,
    );
    const inputKeys = Array.from(
      new Set(rows.flatMap(r => Object.keys(r.variables ?? {}))),
    );
    const headers = ['rowNumber', 'status', ...inputKeys, 'error'];
    const records = rows.map(r => [
      r.rowNumber,
      r.status,
      ...inputKeys.map(k => r.variables?.[k] ?? ''),
      r.errorMessage ?? '',
    ]);

    if (format === 'csv') {
      const esc = (v: unknown) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers, ...records]
        .map(row => row.map(esc).join(','))
        .join('\n');
      return new Blob([csv], { type: 'text/csv' });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Results');
    sheet.addRow(headers);
    for (const rec of records) sheet.addRow(rec);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  } catch {
    return null;
  }
}

export const batchApi = {
  getBatchJobs,
  getBatchJob,
  createBatchJob,
  updateBatchJob,
  deleteBatchJob,
  getBatchJobStatus,
  getBatchJobRows,
  startBatchJob,
  pauseBatchJob,
  resumeBatchJob,
  cancelBatchJob,
  retryBatchJob,
  downloadBatchResults,
};
