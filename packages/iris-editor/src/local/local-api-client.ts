/**
 * Local IrisApiClient — adapts the editor's cloud-shaped API contract to the
 * iris-host-local Fastify endpoints (same origin, no auth). Maps between the
 * cloud DTOs the editor expects (positionX/positionY, edge handles, execution
 * status/progress) and the local store shapes. Cloud-only features (webhook /
 * schedule) are omitted so those config panels hide.
 */

import type {
  IrisApiClient,
  Workflow,
  UpdateWorkflowData,
  ApiNodeInput,
  ApiEdgeInput,
  ExecuteWorkflowData,
  ValidationResultDTO,
  TokenCostsResponse,
  ScheduleInfo,
  ScheduleSettings,
  SchedulePreviewResult,
  SchedulePresetsResponse,
  CronPreset,
} from '@editor/lib/apis/iris-api-client';
import type {
  ExecutionStatusResponse,
  NodeResult,
} from '@editor/types/execution.types';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

interface LocalNode {
  id: string;
  nodeId: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  inputPorts?: unknown;
  outputPorts?: unknown;
  position?: { x: number; y: number };
}
interface LocalEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
}
interface LocalWorkflow {
  id: string;
  name: string;
  status: string;
  nodes: LocalNode[];
  edges: LocalEdge[];
  totalExecutions: number;
  successfulRuns: number;
  failedRuns: number;
  createdAt: string;
  updatedAt: string;
}

function toCloudWorkflow(w: LocalWorkflow): Workflow {
  return {
    id: w.id,
    name: w.name,
    status: (w.status as Workflow['status']) ?? 'DRAFT',
    nodes: (w.nodes ?? []).map(n => ({
      id: n.nodeId,
      nodeId: n.nodeId,
      type: n.type,
      label: n.label,
      positionX: n.position?.x ?? 0,
      positionY: n.position?.y ?? 0,
      config: n.config ?? {},
      inputPorts: [],
      outputPorts: [],
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    })),
    edges: (w.edges ?? []).map(e => ({
      id: e.edgeId,
      edgeId: e.edgeId,
      sourceNodeId: e.sourceNodeId,
      sourcePortId: e.sourceHandle,
      targetNodeId: e.targetNodeId,
      targetPortId: e.targetHandle,
      // The editor's loader reads sourceHandle/targetHandle directly.
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      createdAt: w.createdAt,
    })) as Workflow['edges'],
    isTemplate: false,
    totalExecutions: w.totalExecutions ?? 0,
    successfulRuns: w.successfulRuns ?? 0,
    failedRuns: w.failedRuns ?? 0,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

/**
 * @param baseUrl Prefix for every request path. Default `''` keeps same-origin
 *   relative requests (iris-host-local serves the SPA itself). The Electron
 *   desktop host passes `http://127.0.0.1:<port>` (the embedded local server).
 */
export function createLocalApiClient(baseUrl = ''): IrisApiClient {
  const call = <T>(method: string, path: string, body?: unknown): Promise<T> =>
    req<T>(method, `${baseUrl}${path}`, body);
  return {
    async getWorkflow(id) {
      const { workflow } = await call<{ workflow: LocalWorkflow }>(
        'GET',
        `/api/iris/workflows/${id}`,
      );
      return workflow ? toCloudWorkflow(workflow) : null;
    },

    async updateWorkflow(id, data: UpdateWorkflowData) {
      const { workflow } = await call<{ workflow: LocalWorkflow }>(
        'PATCH',
        `/api/iris/workflows/${id}`,
        { name: data.name, status: data.status },
      );
      return workflow ? toCloudWorkflow(workflow) : null;
    },

    async updateNodes(workflowId, nodes: ApiNodeInput[]) {
      const localNodes: LocalNode[] = nodes.map(n => ({
        id: n.nodeId,
        nodeId: n.nodeId,
        type: n.type,
        label: n.label,
        config: n.config ?? {},
        inputPorts: [],
        outputPorts: [],
        position: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
      }));
      const { workflow } = await call<{ workflow: LocalWorkflow }>(
        'PUT',
        `/api/iris/workflows/${workflowId}/nodes`,
        { nodes: localNodes },
      );
      return workflow ? toCloudWorkflow(workflow) : null;
    },

    async updateEdges(workflowId, edges: ApiEdgeInput[]) {
      const localEdges: LocalEdge[] = edges.map(e => ({
        edgeId: e.edgeId,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceHandle: e.sourceHandle ?? 'output',
        targetHandle: e.targetHandle ?? 'input',
      }));
      const { workflow } = await call<{ workflow: LocalWorkflow }>(
        'PUT',
        `/api/iris/workflows/${workflowId}/edges`,
        { edges: localEdges },
      );
      return workflow ? toCloudWorkflow(workflow) : null;
    },

    async validateWorkflow(id, nodes, edges) {
      const result = await call<ValidationResultDTO>(
        'POST',
        `/api/iris/workflows/${id}/validate`,
        { nodes, edges },
      );
      return {
        valid: result.valid,
        errors: result.errors ?? [],
        warnings: result.warnings ?? [],
      };
    },

    async executeWorkflow(id, data?: ExecuteWorkflowData) {
      const r = await call<{ executionId: string; status: string }>(
        'POST',
        `/api/iris/workflows/${id}/execute`,
        data ?? {},
      );
      return { executionId: r.executionId, status: r.status, message: '' };
    },

    async getTokenCosts(): Promise<TokenCostsResponse> {
      // Local host is unmetered — synthesize an empty cost map.
      return {
        costs: {},
        descriptions: {},
        modelPricing: {},
        categories: { generator: [], analyzer: [], free: [] },
      };
    },

    async getExecutionStatus(executionId): Promise<ExecutionStatusResponse | null> {
      const s = await call<{
        id: string;
        status: string;
        errorMessage?: string | null;
        errorNodeId?: string | null;
        outputAssets?: unknown;
      }>('GET', `/api/iris/executions/${executionId}/status`);
      const failed =
        s.status === 'FAILED' ||
        s.status === 'CANCELLED' ||
        s.status === 'TIMEOUT';
      return {
        id: s.id,
        status: s.status as ExecutionStatusResponse['status'],
        progress: { completedNodes: 0, totalNodes: 0, percent: 0 },
        assets: [],
        error: failed
          ? {
              nodeId: s.errorNodeId ?? '',
              message: s.errorMessage ?? 'Execution failed',
              code: 'ERROR',
            }
          : undefined,
      };
    },

    async getNodeResults(executionId): Promise<{ results: NodeResult[] }> {
      const { nodeResults } = await call<{
        nodeResults: Array<{
          nodeId: string;
          status: string;
          inputData?: Record<string, unknown>;
          outputData?: Record<string, unknown>;
          assets?: unknown;
          duration?: number;
          tokensUsed?: number;
          apiCost?: number;
          errorMessage?: string | null;
        }>;
      }>('GET', `/api/iris/executions/${executionId}/nodes`);
      const results: NodeResult[] = (nodeResults ?? []).map(n => ({
        id: n.nodeId,
        nodeId: n.nodeId,
        status: n.status as NodeResult['status'],
        inputData: n.inputData ?? {},
        outputData: n.outputData,
        assets: Array.isArray(n.assets)
          ? (n.assets as NodeResult['assets'])
          : undefined,
        duration: n.duration,
        tokensUsed: n.tokensUsed ?? 0,
        apiCost: n.apiCost ?? 0,
        errorMessage: n.errorMessage ?? undefined,
      }));
      return { results };
    },

    // ── Schedule (cron) — served locally by iris-host-local's scheduler ───────
    async getScheduleInfo(workflowId): Promise<ScheduleInfo | null> {
      const s = await call<{
        enabled: boolean;
        cron: string | null;
        timezone: string;
        nextRun: string | null;
        lastRun: string | null;
      }>('GET', `/api/iris/workflows/${workflowId}/schedule`);
      return { ...s, description: null };
    },

    async updateScheduleSettings(
      workflowId,
      settings: ScheduleSettings,
    ): Promise<ScheduleInfo | null> {
      const s = await call<{
        enabled: boolean;
        cron: string | null;
        timezone: string;
        nextRun: string | null;
        lastRun: string | null;
      }>('PATCH', `/api/iris/workflows/${workflowId}/schedule`, settings);
      return { ...s, description: null };
    },

    async previewSchedule(
      workflowId,
      cron,
      timezone,
      count,
    ): Promise<SchedulePreviewResult | null> {
      return call<SchedulePreviewResult>(
        'POST',
        `/api/iris/workflows/${workflowId}/schedule/preview`,
        { cron, timezone, count },
      );
    },

    async getSchedulePresets(): Promise<SchedulePresetsResponse | null> {
      const r = await call<{
        presets: Array<{ label: string; cron: string }>;
        timezones: string[];
      }>('GET', '/api/iris/schedule/presets');
      const presets: CronPreset[] = r.presets.map(p => ({
        label: p.label,
        description: p.label,
        cron: p.cron,
      }));
      // Non-"Free" plan so the editor shows presets + custom cron (no gating
      // locally — it's the user's own machine).
      return { presets, timezones: r.timezones, userPlan: 'Local' };
    },
    // webhook/* intentionally omitted (cloud-only).
  };
}
