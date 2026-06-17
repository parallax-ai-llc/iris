/**
 * iris-api-client seam — the editor talks to the backend through this module.
 *
 * The concrete implementation is injected by the host (`IrisEditorProvider`):
 *   - iris/web injects its real `@/lib/apis/iris` client (cloud, authed).
 *   - iris-host-local injects an adapter over the local Fastify endpoints.
 *
 * Components import the `irisApiClient` singleton and call its methods (as they
 * did in iris/web, verbatim); the provider swaps the backing implementation via
 * `setIrisApiClient` at mount. Types mirror iris/web's `@/lib/apis/iris` exactly.
 */

export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type PortType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'image'
  | 'video'
  | 'audio'
  | 'any'
  | 'array';

export interface Port {
  id: string;
  name: string;
  type: PortType;
  required?: boolean;
  defaultValue?: unknown;
}

export interface WorkflowNode {
  id: string;
  nodeId: string;
  type: string;
  label: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
  inputPorts: Port[];
  outputPorts: Port[];
  providerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowEdge {
  id: string;
  edgeId: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  label?: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  outputBucketId?: string;
  outputPath?: string;
  isTemplate: boolean;
  templateCategory?: string;
  totalExecutions: number;
  successfulRuns: number;
  failedRuns: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateWorkflowData {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  outputBucketId?: string;
  outputPath?: string;
  isTemplate?: boolean;
  templateCategory?: string;
}

export interface ApiNodeInput {
  nodeId: string;
  type: string;
  label: string;
  positionX?: number;
  positionY?: number;
  config?: Record<string, unknown>;
  inputPorts?: Port[];
  outputPorts?: Port[];
  providerId?: string;
}

export interface ApiEdgeInput {
  edgeId: string;
  sourceNodeId: string;
  sourceHandle?: string;
  targetNodeId: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
}

export interface ExecuteWorkflowData {
  inputs?: Record<string, unknown>;
  trigger?: { type: string; data?: Record<string, unknown> };
  startNodeId?: string;
  endNodeId?: string;
  timeout?: number;
}

export interface ValidationResultDTO {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ModelPricingEntry {
  costPerUnit: number;
  unit: 'per-image' | 'per-second' | 'per-request' | 'per-1k-chars';
  displayName: string;
}

export interface TokenCostsResponse {
  costs: Record<string, number>;
  descriptions: Record<string, string>;
  modelPricing: Record<string, ModelPricingEntry>;
  categories: { generator: string[]; analyzer: string[]; free: string[] };
}

import type {
  ExecutionStatusResponse,
  NodeResult,
} from '../../types/execution.types';
export type { ExecutionStatusResponse, NodeResult };

export interface WebhookInfo {
  enabled: boolean;
  hasToken: boolean;
  webhookUrl: string | null;
  rateLimit: number;
  hasSecret: boolean;
}
export interface WebhookTokenResponse {
  token: string;
  webhookUrl: string;
}
export interface WebhookSettings {
  enabled?: boolean;
  secret?: string | null;
  rateLimit?: number;
}
export interface ScheduleInfo {
  enabled: boolean;
  cron: string | null;
  timezone: string;
  nextRun: string | null;
  lastRun: string | null;
  description: string | null;
}
export interface ScheduleSettings {
  enabled?: boolean;
  cron?: string | null;
  timezone?: string;
}
export interface SchedulePreviewResult {
  valid: boolean;
  nextRuns?: string[];
  description?: string;
  error?: string;
}
export interface CronPreset {
  label: string;
  description: string;
  cron: string;
  minPlan?: string;
}
export interface SchedulePresetsResponse {
  presets: CronPreset[];
  timezones: string[];
  userPlan?: string;
  restrictions?: Record<string, string>;
}

/** The contract the editor needs from the host's backend. */
export interface IrisApiClient {
  getWorkflow(id: string): Promise<Workflow | null>;
  updateWorkflow(
    id: string,
    data: UpdateWorkflowData,
  ): Promise<Workflow | null>;
  updateNodes(
    workflowId: string,
    nodes: ApiNodeInput[],
  ): Promise<Workflow | null>;
  updateEdges(
    workflowId: string,
    edges: ApiEdgeInput[],
  ): Promise<Workflow | null>;
  validateWorkflow(
    id: string,
    nodes: Array<{
      nodeId: string;
      type: string;
      label: string;
      config?: Record<string, unknown>;
    }>,
    edges: ApiEdgeInput[],
  ): Promise<ValidationResultDTO | null>;
  executeWorkflow(
    id: string,
    data?: ExecuteWorkflowData,
  ): Promise<{ executionId: string; status: string; message: string } | null>;
  getTokenCosts(): Promise<TokenCostsResponse | null>;
  getExecutionStatus(
    executionId: string,
  ): Promise<ExecutionStatusResponse | null>;
  getNodeResults(
    executionId: string,
  ): Promise<{ results: NodeResult[] } | null>;
  // Optional cloud-only features (local host returns null → panels hide/no-op).
  getWebhookInfo?(workflowId: string): Promise<WebhookInfo | null>;
  generateWebhookToken?(workflowId: string): Promise<WebhookTokenResponse | null>;
  regenerateWebhookToken?(
    workflowId: string,
  ): Promise<WebhookTokenResponse | null>;
  updateWebhookSettings?(
    workflowId: string,
    settings: WebhookSettings,
  ): Promise<boolean>;
  getScheduleInfo?(workflowId: string): Promise<ScheduleInfo | null>;
  updateScheduleSettings?(
    workflowId: string,
    settings: ScheduleSettings,
  ): Promise<ScheduleInfo | null>;
  previewSchedule?(
    workflowId: string,
    cron: string,
    timezone?: string,
    count?: number,
  ): Promise<SchedulePreviewResult | null>;
  getSchedulePresets?(): Promise<SchedulePresetsResponse | null>;
}

let _impl: IrisApiClient | null = null;

/** Called by `IrisEditorProvider` at mount to bind the concrete client. */
export function setIrisApiClient(impl: IrisApiClient): void {
  _impl = impl;
}

function client(): IrisApiClient {
  if (!_impl) {
    throw new Error(
      'iris-editor: no IrisApiClient configured. Wrap the editor in <IrisEditorProvider value={{ apiClient, ... }}>.',
    );
  }
  return _impl;
}

/** The singleton proxy always implements every method (delegating / degrading),
 *  so call sites never see an optional method. */
type IrisApiClientProxy = {
  [K in keyof IrisApiClient]-?: NonNullable<IrisApiClient[K]>;
};

/** Singleton proxy — methods delegate to the injected implementation. */
export const irisApiClient: IrisApiClientProxy = {
  getWorkflow: id => client().getWorkflow(id),
  updateWorkflow: (id, data) => client().updateWorkflow(id, data),
  updateNodes: (wid, nodes) => client().updateNodes(wid, nodes),
  updateEdges: (wid, edges) => client().updateEdges(wid, edges),
  validateWorkflow: (id, nodes, edges) =>
    client().validateWorkflow(id, nodes, edges),
  executeWorkflow: (id, data) => client().executeWorkflow(id, data),
  getTokenCosts: () => client().getTokenCosts(),
  getExecutionStatus: id => client().getExecutionStatus(id),
  getNodeResults: id => client().getNodeResults(id),
  getWebhookInfo: id => client().getWebhookInfo?.(id) ?? Promise.resolve(null),
  generateWebhookToken: id =>
    client().generateWebhookToken?.(id) ?? Promise.resolve(null),
  regenerateWebhookToken: id =>
    client().regenerateWebhookToken?.(id) ?? Promise.resolve(null),
  updateWebhookSettings: (id, s) =>
    client().updateWebhookSettings?.(id, s) ?? Promise.resolve(false),
  getScheduleInfo: id =>
    client().getScheduleInfo?.(id) ?? Promise.resolve(null),
  updateScheduleSettings: (id, s) =>
    client().updateScheduleSettings?.(id, s) ?? Promise.resolve(null),
  previewSchedule: (id, cron, tz, count) =>
    client().previewSchedule?.(id, cron, tz, count) ?? Promise.resolve(null),
  getSchedulePresets: () =>
    client().getSchedulePresets?.() ?? Promise.resolve(null),
};
