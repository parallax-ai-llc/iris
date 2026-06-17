/**
 * Iris error definitions.
 *
 * Moved here from `core/server/src/modules/iris/core/iris.errors.ts` so the
 * engine is server-independent. `IrisError` extends the (also relocated)
 * `AppError`, so engine-thrown Iris errors remain `instanceof AppError` in the
 * server and map to the right HTTP status. The server re-exports everything here
 * from its old `iris.errors` path.
 */

import { AppError } from './app-error.js';

// ============================================================
// ERROR CODES
// ============================================================

export const IRIS_ERROR_CODES = {
  // Workflow errors
  WORKFLOW_NOT_FOUND: 'IRIS_WORKFLOW_NOT_FOUND',
  WORKFLOW_INVALID: 'IRIS_WORKFLOW_INVALID',
  WORKFLOW_CYCLE_DETECTED: 'IRIS_WORKFLOW_CYCLE_DETECTED',
  WORKFLOW_NO_ENTRY_NODE: 'IRIS_WORKFLOW_NO_ENTRY_NODE',

  // Node errors
  NODE_NOT_FOUND: 'IRIS_NODE_NOT_FOUND',
  NODE_INVALID_CONFIG: 'IRIS_NODE_INVALID_CONFIG',
  NODE_MISSING_INPUT: 'IRIS_NODE_MISSING_INPUT',
  NODE_TYPE_MISMATCH: 'IRIS_NODE_TYPE_MISMATCH',

  // Execution errors
  EXECUTION_NOT_FOUND: 'IRIS_EXECUTION_NOT_FOUND',
  EXECUTION_FAILED: 'IRIS_EXECUTION_FAILED',
  EXECUTION_TIMEOUT: 'IRIS_EXECUTION_TIMEOUT',
  EXECUTION_CANCELLED: 'IRIS_EXECUTION_CANCELLED',
  EXECUTION_ALREADY_RUNNING: 'IRIS_EXECUTION_ALREADY_RUNNING',

  // Provider errors
  PROVIDER_NOT_FOUND: 'IRIS_PROVIDER_NOT_FOUND',
  PROVIDER_NOT_CONFIGURED: 'IRIS_PROVIDER_NOT_CONFIGURED',
  PROVIDER_API_ERROR: 'IRIS_PROVIDER_API_ERROR',
  PROVIDER_RATE_LIMITED: 'IRIS_PROVIDER_RATE_LIMITED',
  PROVIDER_INVALID_CREDENTIALS: 'IRIS_PROVIDER_INVALID_CREDENTIALS',

  // Model errors
  MODEL_NOT_FOUND: 'IRIS_MODEL_NOT_FOUND',
  MODEL_NOT_SUPPORTED: 'IRIS_MODEL_NOT_SUPPORTED',
  MODEL_CAPABILITY_MISMATCH: 'IRIS_MODEL_CAPABILITY_MISMATCH',

  // Storage errors
  STORAGE_BUCKET_NOT_FOUND: 'IRIS_STORAGE_BUCKET_NOT_FOUND',
  STORAGE_ASSET_NOT_FOUND: 'IRIS_STORAGE_ASSET_NOT_FOUND',
  STORAGE_UPLOAD_FAILED: 'IRIS_STORAGE_UPLOAD_FAILED',
  STORAGE_QUOTA_EXCEEDED: 'IRIS_STORAGE_QUOTA_EXCEEDED',

  // Batch errors
  BATCH_JOB_NOT_FOUND: 'IRIS_BATCH_JOB_NOT_FOUND',
  BATCH_FILE_INVALID: 'IRIS_BATCH_FILE_INVALID',
  BATCH_MAPPING_INVALID: 'IRIS_BATCH_MAPPING_INVALID',
  BATCH_ROW_FAILED: 'IRIS_BATCH_ROW_FAILED',

  // Editor errors
  EDITOR_SESSION_NOT_FOUND: 'IRIS_EDITOR_SESSION_NOT_FOUND',
  EDITOR_SESSION_EXPIRED: 'IRIS_EDITOR_SESSION_EXPIRED',
  EDITOR_OPERATION_FAILED: 'IRIS_EDITOR_OPERATION_FAILED',

  // General errors
  VALIDATION_ERROR: 'IRIS_VALIDATION_ERROR',
  UNAUTHORIZED: 'IRIS_UNAUTHORIZED',
  FORBIDDEN: 'IRIS_FORBIDDEN',
  INTERNAL_ERROR: 'IRIS_INTERNAL_ERROR',
} as const;

export type IrisErrorCode =
  (typeof IRIS_ERROR_CODES)[keyof typeof IRIS_ERROR_CODES];

// ============================================================
// ERROR CLASSES
// ============================================================

export class IrisError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    code: IrisErrorCode,
    details?: unknown
  ) {
    super(message, statusCode, code, details);
    this.name = 'IrisError';
  }
}

// Alias for validation errors
export class ValidationError extends IrisError {
  constructor(message: string, details?: unknown) {
    super(message, 400, IRIS_ERROR_CODES.VALIDATION_ERROR, details);
  }
}

// Alias for compatibility
export { ValidationError as IrisValidationError };

// Workflow Errors
export class WorkflowNotFoundError extends IrisError {
  constructor(workflowId: string) {
    super(
      `Workflow not found: ${workflowId}`,
      404,
      IRIS_ERROR_CODES.WORKFLOW_NOT_FOUND
    );
  }
}

export class WorkflowInvalidError extends IrisError {
  constructor(message: string, details?: unknown) {
    super(message, 400, IRIS_ERROR_CODES.WORKFLOW_INVALID, details);
  }
}

export class WorkflowCycleError extends IrisError {
  constructor() {
    super(
      'Workflow contains a cycle - cannot determine execution order',
      400,
      IRIS_ERROR_CODES.WORKFLOW_CYCLE_DETECTED
    );
  }
}

// Node Errors
export class NodeNotFoundError extends IrisError {
  constructor(nodeId: string) {
    super(`Node not found: ${nodeId}`, 404, IRIS_ERROR_CODES.NODE_NOT_FOUND);
  }
}

export class NodeInvalidConfigError extends IrisError {
  constructor(nodeId: string, message: string) {
    super(
      `Node ${nodeId}: ${message}`,
      400,
      IRIS_ERROR_CODES.NODE_INVALID_CONFIG
    );
  }
}

export class NodeMissingInputError extends IrisError {
  constructor(nodeId: string, inputName: string) {
    super(
      `Node ${nodeId} is missing required input: ${inputName}`,
      400,
      IRIS_ERROR_CODES.NODE_MISSING_INPUT
    );
  }
}

// Execution Errors
export class ExecutionNotFoundError extends IrisError {
  constructor(executionId: string) {
    super(
      `Execution not found: ${executionId}`,
      404,
      IRIS_ERROR_CODES.EXECUTION_NOT_FOUND
    );
  }
}

export class ExecutionFailedError extends IrisError {
  constructor(message: string, nodeId?: string) {
    super(message, 500, IRIS_ERROR_CODES.EXECUTION_FAILED, { nodeId });
  }
}

export class ExecutionTimeoutError extends IrisError {
  constructor(executionId: string) {
    super(
      `Execution timed out: ${executionId}`,
      408,
      IRIS_ERROR_CODES.EXECUTION_TIMEOUT
    );
  }
}

export class ExecutionCancelledError extends IrisError {
  constructor(executionId: string) {
    super(
      `Execution cancelled: ${executionId}`,
      400,
      IRIS_ERROR_CODES.EXECUTION_CANCELLED
    );
  }
}

// Provider Errors
export class ProviderNotFoundError extends IrisError {
  constructor(providerName: string) {
    super(
      `Provider not found: ${providerName}`,
      404,
      IRIS_ERROR_CODES.PROVIDER_NOT_FOUND
    );
  }
}

export class ProviderNotConfiguredError extends IrisError {
  constructor(providerName: string) {
    super(
      `Provider not configured: ${providerName}. Please add your API credentials.`,
      400,
      IRIS_ERROR_CODES.PROVIDER_NOT_CONFIGURED
    );
  }
}

export class ProviderApiError extends IrisError {
  constructor(providerName: string, message: string, details?: unknown) {
    super(
      `${providerName} API error: ${message}`,
      502,
      IRIS_ERROR_CODES.PROVIDER_API_ERROR,
      details
    );
  }
}

export class ProviderRateLimitedError extends IrisError {
  public retryAfter?: number;

  constructor(providerName: string, retryAfter?: number) {
    super(
      `${providerName} rate limit exceeded${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      429,
      IRIS_ERROR_CODES.PROVIDER_RATE_LIMITED
    );
    this.retryAfter = retryAfter;
  }
}

export class ProviderInvalidCredentialsError extends IrisError {
  constructor(providerName: string) {
    super(
      `Invalid credentials for ${providerName}`,
      401,
      IRIS_ERROR_CODES.PROVIDER_INVALID_CREDENTIALS
    );
  }
}

// Model Errors
export class ModelNotFoundError extends IrisError {
  constructor(modelId: string, providerName?: string) {
    super(
      providerName
        ? `Model ${modelId} not found for ${providerName}`
        : `Model not found: ${modelId}`,
      404,
      IRIS_ERROR_CODES.MODEL_NOT_FOUND
    );
  }
}

export class ModelNotSupportedError extends IrisError {
  constructor(modelId: string, capability: string) {
    super(
      `Model ${modelId} does not support ${capability}`,
      400,
      IRIS_ERROR_CODES.MODEL_NOT_SUPPORTED
    );
  }
}

// Storage Errors
export class StorageBucketNotFoundError extends IrisError {
  constructor(bucketId: string) {
    super(
      `Storage bucket not found: ${bucketId}`,
      404,
      IRIS_ERROR_CODES.STORAGE_BUCKET_NOT_FOUND
    );
  }
}

export class StorageAssetNotFoundError extends IrisError {
  constructor(assetId: string) {
    super(
      `Asset not found: ${assetId}`,
      404,
      IRIS_ERROR_CODES.STORAGE_ASSET_NOT_FOUND
    );
  }
}

export class StorageUploadFailedError extends IrisError {
  constructor(message: string) {
    super(
      `Upload failed: ${message}`,
      500,
      IRIS_ERROR_CODES.STORAGE_UPLOAD_FAILED
    );
  }
}

export class StorageQuotaExceededError extends IrisError {
  constructor() {
    super(
      'Storage quota exceeded. Please upgrade your plan or delete unused files.',
      413,
      IRIS_ERROR_CODES.STORAGE_QUOTA_EXCEEDED
    );
  }
}

// Batch Errors
export class BatchJobNotFoundError extends IrisError {
  constructor(jobId: string) {
    super(
      `Batch job not found: ${jobId}`,
      404,
      IRIS_ERROR_CODES.BATCH_JOB_NOT_FOUND
    );
  }
}

export class BatchFileInvalidError extends IrisError {
  constructor(message: string) {
    super(
      `Invalid batch file: ${message}`,
      400,
      IRIS_ERROR_CODES.BATCH_FILE_INVALID
    );
  }
}

export class BatchMappingInvalidError extends IrisError {
  constructor(message: string) {
    super(
      `Invalid column mapping: ${message}`,
      400,
      IRIS_ERROR_CODES.BATCH_MAPPING_INVALID
    );
  }
}

// Editor Errors
export class EditorSessionNotFoundError extends IrisError {
  constructor(sessionId: string) {
    super(
      `Editor session not found: ${sessionId}`,
      404,
      IRIS_ERROR_CODES.EDITOR_SESSION_NOT_FOUND
    );
  }
}

export class EditorSessionExpiredError extends IrisError {
  constructor(sessionId: string) {
    super(
      `Editor session expired: ${sessionId}`,
      410,
      IRIS_ERROR_CODES.EDITOR_SESSION_EXPIRED
    );
  }
}

export class EditorOperationFailedError extends IrisError {
  constructor(message: string) {
    super(
      `Edit operation failed: ${message}`,
      500,
      IRIS_ERROR_CODES.EDITOR_OPERATION_FAILED
    );
  }
}

// General Errors - keeping consistent with ValidationError defined earlier
export class IrisUnauthorizedError extends IrisError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, IRIS_ERROR_CODES.UNAUTHORIZED);
  }
}

export class IrisForbiddenError extends IrisError {
  constructor(message = 'Access forbidden') {
    super(message, 403, IRIS_ERROR_CODES.FORBIDDEN);
  }
}

export class IrisInternalError extends IrisError {
  constructor(message: string) {
    super(message, 500, IRIS_ERROR_CODES.INTERNAL_ERROR);
  }
}
