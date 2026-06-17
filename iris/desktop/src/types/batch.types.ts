/**
 * Iris Batch Processing Types
 */

export type BatchJobStatus = 'PENDING' | 'PROCESSING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type BatchRowStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING';
export type BatchFileType = 'XLSX' | 'CSV' | 'JSON';

export interface ColumnMapping {
  columnName: string;
  variableName: string;
  transform?: string;
}

export interface BatchJob {
  id: string;
  workflowId: string;
  workflowName: string;
  name: string;
  description?: string;
  status: BatchJobStatus;
  fileType: BatchFileType;
  originalFilename: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  columnMappings: ColumnMapping[];
  concurrency: number;
  stopOnError: boolean;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchJobListResponse {
  jobs: BatchJob[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BatchJobProgress {
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  percent: number;
}

export interface BatchJobError {
  rowNumber: number;
  error: string;
}

export interface BatchJobStatusResponse {
  id: string;
  status: BatchJobStatus;
  progress: BatchJobProgress;
  currentRow?: number;
  estimatedTimeRemaining?: number;
  errors: BatchJobError[];
}

export interface BatchRowResult {
  id: string;
  rowNumber: number;
  status: BatchRowStatus;
  inputData: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  executionId?: string;
  errorMessage?: string;
  retryCount: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface BatchRowResultsResponse {
  results: BatchRowResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateBatchJobInput {
  workflowId: string;
  name: string;
  description?: string;
  columnMappings: ColumnMapping[];
  concurrency?: number;
  stopOnError?: boolean;
  notifyOnComplete?: boolean;
  notifyOnError?: boolean;
}

export interface UpdateBatchJobInput {
  name?: string;
  description?: string;
  concurrency?: number;
  stopOnError?: boolean;
  notifyOnComplete?: boolean;
  notifyOnError?: boolean;
}

export interface BatchActionResponse {
  success: boolean;
  message: string;
  jobId: string;
  status: BatchJobStatus;
}

export interface ParsedExcelData {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetNames: string[];
}

export interface WorkflowVariable {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface BatchQueryParams {
  page?: number;
  limit?: number;
  status?: BatchJobStatus;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
