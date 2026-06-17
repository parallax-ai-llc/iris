/**
 * Iris API - Type definitions
 */

// ==================== Common Types ====================

export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type ExecutionStatus = 'PENDING' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TriggerType = 'manual' | 'api' | 'webhook' | 'schedule' | 'directory';
export type PortType = 'string' | 'number' | 'boolean' | 'image' | 'video' | 'audio' | 'any' | 'array';
export type AssetType = 'IMAGE' | 'VIDEO';
export type CameraAngle = 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'THREE_QUARTER_FRONT_LEFT' | 'THREE_QUARTER_FRONT_RIGHT' | 'THREE_QUARTER_BACK';

// ==================== Workflow Types ====================

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
  category?: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
  inputPorts?: Port[];
  outputPorts?: Port[];
  inputs?: Array<{ name: string; type: string; label: string; required?: boolean }>;
  outputs?: Array<{ name: string; type: string; label: string }>;
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

export interface WorkflowListResponse {
  workflows: Workflow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateWorkflowData {
  name: string;
  description?: string;
  nodes?: Array<{
    nodeId: string;
    type: string;
    label: string;
    positionX: number;
    positionY: number;
    config?: Record<string, unknown>;
    inputPorts?: Port[];
    outputPorts?: Port[];
    providerId?: string;
  }>;
  edges?: Array<{
    edgeId: string;
    sourceNodeId: string;
    sourceHandle: string;
    targetNodeId: string;
    targetHandle: string;
    label?: string;
    animated?: boolean;
  }>;
  outputBucketId?: string;
  outputPath?: string;
  isTemplate?: boolean;
  templateCategory?: string;
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

// ==================== Execution Types ====================

export interface Execution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  triggerType: TriggerType;
  inputData: Record<string, unknown>;
  outputAssets?: unknown[];
  startedAt?: string;
  completedAt?: string;
  totalTokensUsed: number;
  estimatedCost: number;
  errorMessage?: string;
  createdAt: string;
}

export interface ExecutionListResponse {
  executions: Execution[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExecuteWorkflowData {
  inputs?: Record<string, unknown>;
  trigger?: {
    type: TriggerType;
    data?: Record<string, unknown>;
  };
  startNodeId?: string;
  endNodeId?: string;
  timeout?: number;
}

export interface ExecutionLog {
  id: string;
  executionId: string;
  nodeId: string | null;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  eventType: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  duration: number | null;
}

export interface ExecutionLogsResponse {
  logs: ExecutionLog[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface ExecutionStatusResponse {
  id: string;
  status: string;
  progress: {
    completedNodes: number;
    totalNodes: number;
    currentNodeId?: string;
    percent: number;
  };
  assets: unknown[];
  error?: {
    nodeId: string;
    message: string;
    code: string;
  };
}

export type NodeResultStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CACHED';

export interface NodeResult {
  id: string;
  nodeId: string;
  status: NodeResultStatus;
  inputData: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  assets?: Array<{ type: string; url: string; name?: string }>;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  tokensUsed: number;
  apiCost: number;
  errorMessage?: string;
}

// ==================== Template Types ====================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags?: string[];
  thumbnailUrl?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  nodeCount?: number;
  usageCount?: number;
  rating?: number | null;
  creatorName?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export interface TemplateListResponse {
  templates: WorkflowTemplate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ==================== Webhook Types ====================

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

export interface WebhookLog {
  id: string;
  sourceIp: string;
  userAgent: string | null;
  success: boolean;
  executionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface WebhookLogsResponse {
  logs: WebhookLog[];
  total: number;
  page: number;
  limit: number;
}

// ==================== Schedule Types ====================

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
  restrictions?: {
    Free: string;
    Pro: string;
    Ultra: string;
  };
}

// ==================== API Key Types ====================

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  key: string; // Full key - only returned once on creation!
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyScope {
  value: string;
  label: string;
  description: string;
}

export interface CreateApiKeyData {
  name: string;
  scopes?: string[];
  expiresAt?: string;
}

export interface UpdateApiKeyData {
  name?: string;
  scopes?: string[];
}

// ==================== Execution Log Query Types ====================

export interface ExecutionLogQueryParams extends PaginationParams {
  nodeId?: string;
  level?: string;
}

// ==================== Asset Types ====================

export interface GenerationSettings {
  resolution?: string;
  aspectRatio?: string;
  duration?: number;
  cameraAngle?: CameraAngle;
  subjectId?: string;
  model?: string;
  providerId?: string;
  upscale?: boolean;
  removeBackground?: boolean;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  versionNumber: number;
  prompt?: string;
  negativePrompt?: string;
  settings: GenerationSettings;
  resolution?: string;
  aspectRatio?: string;
  duration?: number;
  cameraAngle?: string;
  subjectId?: string;
  modelId?: string;
  providerId?: string;
  upscaled: boolean;
  backgroundRemoved: boolean;
  referenceAssetId?: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
  diffInfo?: Record<string, { old: unknown; new: unknown }>;
  createdAt: string;
  createdBy: string;
}

export interface IrisAsset {
  id: string;
  userId: string;
  name: string;
  path?: string;
  storagePath: string;
  currentVersion: number;
  assetType: AssetType;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
  thumbnailUrl?: string;
  previewUrl?: string;
  processingStatus?: string;
  processingError?: string;
  isPublic: boolean;
  publicUrl?: string;
  sourceExecutionId?: string;
  sourceNodeId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  currentVersionData?: AssetVersion;
}

export interface AssetListResponse {
  assets: IrisAsset[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateAssetData {
  name: string;
  assetType: AssetType;
  storagePath: string;
  prompt?: string;
  negativePrompt?: string;
  sizeBytes: number;
  mimeType: string;
  settings?: GenerationSettings;
  referenceAssetId?: string;
}

export interface UpdateAssetData {
  name?: string;
  prompt?: string;
  negativePrompt?: string;
  storagePath?: string;
  sizeBytes?: number;
  mimeType?: string;
  settings?: GenerationSettings;
  referenceAssetId?: string;
}

export interface GenerateMediaData {
  name?: string;
  assetType: AssetType;
  storagePath: string;
  prompt: string;
  negativePrompt?: string;
  settings?: GenerationSettings;
}

export interface GenerateImageData {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  providerId?: string;
  aspectRatio?: string;
  resolution?: string;
  storagePath?: string;
  name?: string;
  // Image-to-Image: reference an existing image for guided generation
  referenceAssetId?: string;
  // Image-to-Image: inline reference image (used when no existing asset — e.g.
  // a pasted screenshot that we don't want to persist into the user's library).
  referenceImageBase64?: string;
  // Image strength for img2img (0-1, higher = more original image preserved)
  imageStrength?: number;
  // Preset mode identifier for preset-based generation (e.g., '4panel', 'sticker')
  presetMode?: string;
}

// ==================== Query Params Types ====================

export interface WorkflowQueryParams {
  page?: number;
  limit?: number;
  status?: WorkflowStatus;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'lastExecutedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface AssetQueryParams {
  type?: AssetType;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'sizeBytes';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

// ==================== Provider/Model Types ====================

export interface ModelConstraints {
  maxVideoDuration?: number;
  supportedDurations?: number[];
  maxImageSize?: number;
  supportedFormats?: string[];
  supportedAspectRatios?: string[];
}

export interface AdapterModel {
  id: string;
  name: string;
  provider: string;
  capabilities: string[];
  constraints?: ModelConstraints;
  defaultParameters?: Record<string, unknown>;
}

export interface AdapterModelsResponse {
  models: AdapterModel[];
}

// ==================== Token Costs Types ====================

export interface ModelPricingEntry {
  costPerUnit: number;
  unit: 'per-image' | 'per-second' | 'per-request' | 'per-1k-chars';
  displayName: string;
}

export interface TokenCostsResponse {
  costs: Record<string, number>;
  descriptions: Record<string, string>;
  modelPricing: Record<string, ModelPricingEntry>;
  categories: {
    generator: string[];
    analyzer: string[];
    free: string[];
  };
}
