/**
 * Iris Execution Types
 */

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
export type NodeResultStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CACHED';

export interface NodeResult {
  id: string;
  nodeId: string;
  status: NodeResultStatus;
  inputData: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  assets?: Array<{
    type: string;
    url: string;
    name?: string;
  }>;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  tokensUsed: number;
  apiCost: number;
  errorMessage?: string;
}

export interface ExecutionProgress {
  completedNodes: number;
  totalNodes: number;
  currentNodeId?: string;
  percent: number;
}

export interface ExecutionError {
  nodeId: string;
  message: string;
  code: string;
}

export interface ExecutionStatusResponse {
  id: string;
  status: ExecutionStatus;
  progress: ExecutionProgress;
  assets: Array<{
    type: string;
    url: string;
    name?: string;
  }>;
  error?: ExecutionError;
}

export interface ExecutionDetail {
  id: string;
  workflowId: string;
  workflow: {
    id: string;
    name: string;
  };
  userId: string;
  status: ExecutionStatus;
  triggerType: string;
  triggerData: Record<string, unknown>;
  inputData: Record<string, unknown>;
  outputAssets?: Array<{
    type: string;
    url: string;
    name?: string;
  }>;
  nodeResults: NodeResult[];
  startedAt?: string;
  completedAt?: string;
  totalTokensUsed: number;
  estimatedCost: number;
  errorMessage?: string;
  errorNodeId?: string;
  createdAt: string;
}

export interface NodeResultsResponse {
  results: NodeResult[];
}
