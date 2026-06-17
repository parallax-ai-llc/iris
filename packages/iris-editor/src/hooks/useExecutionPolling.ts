'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useIrisEditorStore, NodeProgress, NodeStatus } from '@editor/store/iris-editor';
import { irisApiClient } from '@editor/lib/apis/iris-api-client';
import {
  ExecutionStatusResponse,
  NodeResultsResponse,
  NodeResult,
  ExecutionStatus,
  NodeResultStatus,
} from '../types/execution.types';

interface UseExecutionPollingOptions {
  /** Polling interval in milliseconds (default: 2000ms) */
  interval?: number;
  /** Whether to fetch detailed node results (default: true) */
  fetchNodeResults?: boolean;
  /** Callback when execution completes */
  onComplete?: (status: ExecutionStatus) => void;
  /** Callback when execution fails */
  onError?: (error: { nodeId: string; message: string }) => void;
}

/**
 * Map backend node status to frontend NodeStatus
 */
function mapNodeStatus(backendStatus: NodeResultStatus | string): NodeStatus {
  switch (backendStatus) {
    case 'RUNNING':
      return 'running';
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'error';
    case 'PENDING':
      return 'waiting';
    case 'SKIPPED':
    case 'CACHED':
      return 'success';
    default:
      return 'idle';
  }
}

/**
 * Map backend node result to frontend NodeProgress
 */
function mapNodeResultToProgress(result: NodeResult): NodeProgress {
  return {
    status: mapNodeStatus(result.status),
    error: result.errorMessage,
    output: result.outputData,
    startedAt: result.startedAt ? new Date(result.startedAt).getTime() : undefined,
    completedAt: result.completedAt ? new Date(result.completedAt).getTime() : undefined,
  };
}

/**
 * Hook for polling execution status and updating node progress
 */
export function useExecutionPolling(options: UseExecutionPollingOptions = {}) {
  const {
    interval = 2000, // Increased to reduce API load
    fetchNodeResults: shouldFetchNodeResults = true,
    onComplete,
    onError,
  } = options;

  const {
    isExecuting,
    executionId,
    setExecuting,
    updateNodeProgress,
    clearExecutionProgress,
    nodes,
  } = useIrisEditorStore();

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const nodesRef = useRef(nodes);
  const executionIdRef = useRef<string | null>(null);

  // Keep refs updated
  nodesRef.current = nodes;
  executionIdRef.current = executionId;

  /**
   * Fetch execution status from API
   */
  const fetchExecutionStatus = useCallback(async (execId: string): Promise<ExecutionStatusResponse | null> => {
    try {
      const result = await irisApiClient.getExecutionStatus(execId);
      if (!result) {
        console.error('Failed to fetch execution status');
        return null;
      }
      return result as unknown as ExecutionStatusResponse;
    } catch (error: any) {
      // Handle rate limit errors silently - will retry on next poll
      if (error?.message?.includes('Rate limit') || error?.statusCode === 429) {
        console.warn('Rate limit hit, will retry on next poll');
        return null;
      }
      console.error('Error fetching execution status:', error);
      return null;
    }
  }, []);

  /**
   * Fetch node results from API
   */
  const fetchNodeResultsData = useCallback(async (execId: string): Promise<NodeResult[]> => {
    try {
      const result = await irisApiClient.getNodeResults(execId);
      if (!result) {
        console.error('Failed to fetch node results');
        return [];
      }
      return result.results || [];
    } catch (error: any) {
      // Handle rate limit errors silently - will retry on next poll
      if (error?.message?.includes('Rate limit') || error?.statusCode === 429) {
        console.warn('Rate limit hit, will retry on next poll');
        return [];
      }
      console.error('Error fetching node results:', error);
      return [];
    }
  }, []);

  /**
   * Update store with execution status and node results
   */
  const updateExecutionState = useCallback(async (execId: string) => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      // Fetch execution status
      const status = await fetchExecutionStatus(execId);
      if (!status) {
        isPollingRef.current = false;
        return;
      }

      // Update current node as running
      if (status.progress.currentNodeId) {
        updateNodeProgress(status.progress.currentNodeId, {
          status: 'running',
          progress: undefined,
        });
      }

      // Fetch and update node results
      if (shouldFetchNodeResults) {
        const nodeResults = await fetchNodeResultsData(execId);

        for (const result of nodeResults) {
          const progress = mapNodeResultToProgress(result);
          updateNodeProgress(result.nodeId, progress);
        }
      }

      // Handle execution completion or failure
      const terminalStatuses: ExecutionStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'];
      if (terminalStatuses.includes(status.status)) {
        // Stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        // Update executing state
        setExecuting(false);

        // Callbacks
        if (status.status === 'COMPLETED') {
          onComplete?.(status.status);
        } else if (status.error) {
          // Update error node with error details
          updateNodeProgress(status.error.nodeId, {
            status: 'error',
            error: status.error.message,
          });
          onError?.(status.error);
        }
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [fetchExecutionStatus, fetchNodeResultsData, shouldFetchNodeResults, updateNodeProgress, setExecuting, onComplete, onError]);

  /**
   * Start polling for execution status
   */
  const startPolling = useCallback((execId: string) => {
    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    // Initialize all nodes as waiting (use ref to avoid dependency on nodes)
    nodesRef.current.forEach((node) => {
      updateNodeProgress(node.id, {
        status: 'waiting',
        error: undefined,
        output: undefined,
      });
    });

    // Start polling
    pollingRef.current = setInterval(() => {
      updateExecutionState(execId);
    }, interval);

    // Initial fetch
    updateExecutionState(execId);
  }, [updateNodeProgress, updateExecutionState, interval]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  /**
   * Reset execution state
   */
  const resetExecution = useCallback(() => {
    stopPolling();
    clearExecutionProgress();
  }, [stopPolling, clearExecutionProgress]);

  // Start polling when execution starts
  useEffect(() => {
    if (isExecuting && executionId) {
      // Prevent double-starting if already polling for the same execution
      if (pollingRef.current && executionIdRef.current === executionId) {
        return;
      }
      startPolling(executionId);
    } else if (!isExecuting && pollingRef.current) {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecuting, executionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    startPolling,
    stopPolling,
    resetExecution,
    isPolling: !!pollingRef.current,
  };
}
