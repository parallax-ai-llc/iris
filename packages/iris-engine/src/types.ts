/**
 * Iris runtime type definitions — the vocabulary the execution engine and its
 * provider adapters reason about.
 *
 * Moved out of `core/server/src/modules/iris/core/iris.types.ts` so the engine
 * is server-independent. The five enum unions below mirror the Prisma enums of
 * the same name member-for-member, so a value of the Prisma type is freely
 * assignable to/from these (they are structurally identical string-literal
 * unions). The server re-exports everything here from its old `iris.types` path,
 * keeping all existing consumers working unchanged.
 *
 * ⚠️ If you add/rename a member of one of the Prisma `Iris*` enums in
 * `schema.prisma`, mirror the change here or the server typecheck will break.
 */

// ============================================================
// ENUM UNIONS (mirror of Prisma enums — see schema.prisma)
// ============================================================

export type IrisTriggerType =
  | 'MANUAL'
  | 'WEBHOOK'
  | 'SCHEDULE'
  | 'DIRECTORY_WATCH'
  | 'API';

export type IrisNodeType =
  // Triggers
  | 'TRIGGER_MANUAL'
  | 'TRIGGER_WEBHOOK'
  | 'TRIGGER_SCHEDULE'
  | 'TRIGGER_DIRECTORY'
  | 'TRIGGER_EVENT'
  | 'TRIGGER_CHAT'
  | 'TRIGGER_FORM'
  | 'TRIGGER_EMAIL_RECEIVED'
  // Generators (AI)
  | 'GEN_TEXT_TO_TEXT'
  | 'GEN_TEXT_TO_IMAGE'
  | 'GEN_IMAGE_TO_IMAGE'
  | 'GEN_TEXT_TO_VIDEO'
  | 'GEN_IMAGE_TO_VIDEO'
  | 'GEN_TEXT_TO_SPEECH'
  | 'GEN_SPEECH_TO_TEXT'
  | 'GEN_TEXT_TO_MUSIC'
  | 'GEN_INPAINT'
  | 'GEN_OUTPAINT'
  | 'GEN_STYLE_TRANSFER'
  | 'GEN_FACE_SWAP'
  | 'GEN_VIDEO_SUBTITLE'
  | 'GEN_LIP_SYNC'
  // Analyzers
  | 'ANALYZE_IMAGE'
  | 'ANALYZE_VIDEO'
  | 'ANALYZE_AUDIO'
  | 'ANALYZE_TEXT'
  | 'ANALYZE_DOCUMENT'
  | 'DOC_LONG_CONTEXT'
  | 'AI_STRUCTURED_EXTRACT'
  | 'AI_CATEGORIZE'
  // Editors
  | 'EDIT_IMAGE_UPSCALE'
  | 'EDIT_IMAGE_INPAINT'
  | 'EDIT_IMAGE_OUTPAINT'
  | 'EDIT_IMAGE_STYLE'
  | 'EDIT_IMAGE_FACE_SWAP'
  | 'EDIT_IMAGE_BG_REMOVE'
  | 'EDIT_IMAGE_CROP'
  | 'EDIT_IMAGE_FILTER'
  | 'EDIT_IMAGE_SKY_REPLACE'
  | 'EDIT_IMAGE_RELIGHT'
  | 'EDIT_IMAGE_AUTO_ENHANCE'
  | 'EDIT_VIDEO_TRIM'
  | 'EDIT_VIDEO_CROP'
  | 'EDIT_VIDEO_UPSCALE'
  | 'EDIT_VIDEO_INPAINT'
  | 'EDIT_AUDIO_TRIM'
  | 'EDIT_MASK_DEFINE'
  | 'EDIT_MOTION_CONTROL'
  | 'EDIT_AUDIO_SEPARATE'
  | 'EDIT_VIDEO_MERGE'
  | 'EDIT_VIDEO_OVERLAY'
  // Utilities
  | 'UTIL_DELAY'
  | 'UTIL_CONDITION'
  | 'UTIL_CONDITIONAL'
  | 'UTIL_LOOP'
  | 'UTIL_MERGE'
  | 'UTIL_SPLIT'
  | 'UTIL_TRANSFORM'
  | 'UTIL_FILE_SAVE'
  | 'UTIL_FILE_LOAD'
  | 'UTIL_HTTP_REQUEST'
  | 'UTIL_SCRIPT'
  | 'UTIL_VARIABLE_SET'
  | 'UTIL_VARIABLE_GET'
  | 'UTIL_TEMPLATE'
  | 'UTIL_ROUTER'
  | 'UTIL_FILTER'
  | 'UTIL_AGGREGATE'
  | 'UTIL_TRY_CATCH'
  | 'UTIL_SUB_WORKFLOW'
  | 'UTIL_REGEX'
  | 'UTIL_DATE'
  | 'UTIL_JSON_PATH'
  | 'DOC_GREP'
  // Web
  | 'WEB_SEARCH'
  | 'WEB_SCRAPER'
  | 'WEB_YOUTUBE_TRANSCRIPT'
  // Output
  | 'OUTPUT_STORAGE'
  | 'OUTPUT_WEBHOOK'
  | 'OUTPUT_EMAIL'
  | 'OUTPUT_NOTIFICATION'
  | 'OUTPUT_SLACK_POST'
  | 'OUTPUT_SHEET_APPEND';

export type IrisExecutionStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMEOUT';

export type IrisNodeResultStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'CACHED';

export type IrisAssetType =
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'TEXT'
  | 'DOCUMENT'
  | 'ARCHIVE'
  | 'OTHER';

// ============================================================
// UNIVERSAL API MANAGER TYPES
// ============================================================

/** Supported AI capabilities across all providers */
export type AICapability =
  | 'text-to-text'
  | 'text-to-image'
  | 'image-to-image'
  | 'image-to-video'
  | 'text-to-video'
  | 'text-to-speech'
  | 'speech-to-text'
  | 'text-to-music'
  | 'image-upscale'
  | 'video-upscale'
  | 'inpaint'
  | 'video-inpaint'
  | 'outpaint'
  | 'style-transfer'
  | 'face-swap'
  | 'background-remove'
  | 'sky-replace'
  | 'relight'
  | 'image-enhance'
  | 'motion-control'
  | 'multi-angle'
  | 'image-analysis'
  | 'video-analysis'
  | 'audio-analysis'
  | 'document-analysis';

/** Normalized input types */
export type MediaType = 'text' | 'image' | 'video' | 'audio' | 'document';

/** Provider identification */
export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'perplexity'
  | 'deepseek'
  | 'runway'
  | 'kling'
  | 'luma'
  | 'elevenlabs'
  | 'replicate'
  | 'stability'
  | 'midjourney'
  | 'pika'
  | 'heygen'
  | 'deepgram'
  | 'fal'
  | 'ideogram'
  | 'recraft'
  | 'bfl'
  | 'suno';

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

/** Unified request structure for all AI operations */
export interface AIRequest {
  /** Operation type */
  capability: AICapability;

  /** Model to use (provider-specific) */
  model: string;

  /** Text inputs */
  prompt?: string;
  negativePrompt?: string;
  systemPrompt?: string;

  /** Media inputs (URLs or base64) */
  inputImage?: MediaInput;
  inputImages?: MediaInput[];
  inputVideo?: MediaInput;
  inputAudio?: MediaInput;
  maskImage?: MediaInput;

  /** Generation parameters */
  parameters?: GenerationParameters;

  /** Request metadata */
  metadata?: {
    userId: string;
    workflowId?: string;
    executionId?: string;
    nodeId?: string;
  };
}

/** Media input structure */
export interface MediaInput {
  type: 'url' | 'base64' | 'gcs';
  value: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

/** Common generation parameters */
export interface GenerationParameters {
  // Image parameters
  width?: number;
  height?: number;
  aspectRatio?: string;
  numOutputs?: number;
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  sampler?: string;

  // Video parameters
  duration?: number; // seconds
  fps?: number;
  motionScore?: number; // 1-10 for video motion intensity

  // Audio parameters
  voice?: string;
  speed?: number;
  pitch?: number;
  stability?: number;
  similarity?: number;

  // Text parameters
  maxTokens?: number;
  temperature?: number;
  topP?: number;

  // Style/quality
  style?: string;
  quality?: 'draft' | 'standard' | 'hd' | 'ultra';

  // Provider-specific (pass-through)
  [key: string]: unknown;
}

/** Unified response structure */
export interface AIResponse {
  /** Request success status */
  success: boolean;

  /** Generated outputs */
  outputs: GeneratedOutput[];

  /** Usage/billing information */
  usage: UsageInfo;

  /** Provider-specific raw response (for debugging) */
  rawResponse?: unknown;

  /** Error information */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfter?: number; // seconds
  };

  /** Request metadata */
  metadata: {
    provider: ProviderName;
    model: string;
    requestId?: string;
    duration: number; // milliseconds
  };
}

/** Generated output (image, video, audio, text) */
export interface GeneratedOutput {
  type: MediaType;

  /** URL to access the generated content */
  url?: string;

  /** Base64-encoded content */
  base64?: string;

  /** Text output */
  text?: string;

  /** Output dimensions/duration */
  width?: number;
  height?: number;
  duration?: number; // seconds

  /** Additional metadata */
  metadata?: {
    seed?: number;
    format?: string;
    mimeType?: string;
    sizeBytes?: number;
    [key: string]: unknown;
  };
}

/** API usage tracking */
export interface UsageInfo {
  /** Token-based usage */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;

  /** Time-based usage (video/audio) */
  durationSeconds?: number;

  /** Unit-based usage (images) */
  units?: number;

  /** Estimated cost (USD) */
  estimatedCost: number;

  /** Iris tokens consumed (from user's token balance) */
  tokensConsumed?: number;
}

// ============================================================
// PROVIDER ADAPTER INTERFACE
// ============================================================

/** Model information */
export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderName;
  capabilities: AICapability[];
  inputTypes: MediaType[];
  outputTypes: MediaType[];

  constraints?: {
    maxImageSize?: number;
    maxVideoDuration?: number;
    maxAudioDuration?: number;
    maxTokens?: number;
    supportedFormats?: string[];
    supportedAspectRatios?: string[];
    /** Specific durations supported by video models (in seconds) */
    supportedDurations?: number[];
    /** Supported target resolutions for video upscaling (e.g., "720p", "1080p", "4k") */
    supportedResolutions?: string[];
    /** Supported target FPS values for video upscaling */
    supportedFps?: number[];
  };

  pricing?: {
    unit: 'token' | 'second' | 'image' | 'video' | 'request';
    inputCost: number;
    outputCost: number;
    currency: 'USD';
  };

  defaultParameters?: GenerationParameters;
  isPreview?: boolean;
}

/** Provider credentials */
export interface ProviderCredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  organizationId?: string;
  projectId?: string;
  custom?: Record<string, string>;
}

/** Validation issue detail */
export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
}

/** Request validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: string[];
}

/** Health check status */
export interface HealthStatus {
  healthy: boolean;
  latency?: number;
  message?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

// ============================================================
// NODE EXECUTION TYPES
// ============================================================

/** Node execution context */
export interface NodeExecutionContext {
  /** Current execution */
  executionId: string;
  workflowId: string;
  userId: string;

  /** Node being executed */
  node: NodeDefinition;

  /** Input data from connected nodes */
  inputs: Record<string, unknown>;

  /** Workflow variables */
  variables: Record<string, unknown>;

  /** Previous node results (for referencing) */
  nodeResults: Map<string, NodeResult>;

  /** Storage context */
  storage: {
    defaultBucket: string;
    outputPath: string;
    resolvedPath: string;
  };

  /** Logging/debugging */
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: unknown
  ) => void;

  /** Progress reporting */
  reportProgress: (percent: number, message?: string) => void;

  /** Check if execution is cancelled */
  isCancelled: () => boolean;
}

/** Node definition (from registry) */
export interface NodeDefinition {
  type: IrisNodeType;
  nodeId: string;
  label: string;

  config: Record<string, unknown>;

  inputPorts: PortDefinition[];
  outputPorts: PortDefinition[];

  providerId?: string;
  modelId?: string;
}

/** Port definition */
export interface PortDefinition {
  id: string;
  label: string;
  type: MediaType | 'any' | 'trigger';
  required?: boolean;
  multiple?: boolean;
}

/** Node execution result */
export interface NodeResult {
  nodeId: string;
  status: 'completed' | 'failed' | 'skipped';

  outputs: Record<string, unknown>;
  assets: AssetReference[];

  usage?: UsageInfo;
  duration: number;

  error?: {
    message: string;
    code: string;
    stack?: string;
    /** Required tokens for INSUFFICIENT_TOKENS error */
    requiredTokens?: number;
    /** Remaining tokens for INSUFFICIENT_TOKENS error */
    remainingTokens?: number;
  };
}

/** Reference to a stored asset */
export interface AssetReference {
  id: string;
  type: IrisAssetType;
  /** URL to the asset (http/https or data URL) */
  url?: string;
  /** Base64 encoded asset data */
  base64?: string;
  path: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// WORKFLOW EXECUTION TYPES
// ============================================================

/** Workflow execution options */
export interface ExecutionOptions {
  /** Input variables */
  inputs?: Record<string, unknown>;

  /** Trigger context */
  trigger?: {
    type: 'manual' | 'webhook' | 'schedule' | 'directory' | 'api';
    data?: unknown;
  };

  /** Execution mode */
  mode?: 'full' | 'test' | 'dry-run';

  /** Start from specific node */
  startNodeId?: string;

  /** Stop at specific node */
  endNodeId?: string;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Batch job reference */
  batchJobId?: string;
  batchRowNumber?: number;
}

/** Execution state (in-memory during execution) */
export interface ExecutionState {
  id: string;
  workflowId: string;
  status:
    | 'pending'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';

  /** Current node being executed */
  currentNodeId?: string;

  /** Completed nodes */
  completedNodes: Set<string>;

  /** Node results */
  nodeResults: Map<string, NodeResult>;

  /** Resolved variables */
  variables: Map<string, unknown>;

  /** Collected assets */
  assets: AssetReference[];

  /** Error info */
  error?: {
    nodeId: string;
    message: string;
    code: string;
  };

  /** Timing */
  startTime: number;
  endTime?: number;

  /** Resource usage */
  totalTokens: number;
  totalCost: number;
}

// ============================================================
// GRAPH TRAVERSAL TYPES
// ============================================================

/** Workflow graph structure */
export interface WorkflowGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];

  /** Pre-computed traversal info */
  entryNodes: string[]; // Nodes with no inputs
  exitNodes: string[]; // Nodes with no outputs
  topologicalOrder: string[];
}

/** Graph node */
export interface GraphNode {
  id: string;
  type: IrisNodeType;
  config: Record<string, unknown>;

  /** Connected nodes */
  inputs: Map<string, { nodeId: string; portId: string }>;
  outputs: Map<string, { nodeId: string; portId: string }[]>;

  /** Computed properties */
  depth: number; // Distance from entry
  dependencies: Set<string>; // Nodes that must complete first
}

/** Graph edge */
export interface GraphEdge {
  id: string;
  source: { nodeId: string; portId: string };
  target: { nodeId: string; portId: string };
}

// ============================================================
// BATCH PROCESSING TYPES
// ============================================================

/** Parsed row from Excel/CSV */
export interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
  variables: Record<string, unknown>;
}

/** Batch job options */
export interface BatchJobOptions {
  workflowId: string;
  userId: string;
  name: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileType: 'xlsx' | 'csv' | 'json';
  columnMapping: Record<string, string>;
  concurrency?: number;
  stopOnError?: boolean;
  retryFailedRows?: boolean;
  maxRetries?: number;
  notifyOnComplete?: boolean;
  notifyWebhook?: string;
  notifyEmail?: string;
}

/** Parse options for file parsers */
export interface ParseOptions {
  limit?: number;
  sheetIndex?: number;
  hasHeader?: boolean;
}

// ============================================================
// STORAGE TYPES
// ============================================================

/** Path resolution context */
export interface PathContext {
  userId?: string;
  workflowId?: string;
  workflowName?: string;
  executionId?: string;
  nodeId?: string;
  date?: string;
  timestamp?: number;
  batchJobId?: string;
  rowNumber?: number;
  assetType?: string;
  custom?: Record<string, string>;
}

// ============================================================
// EDITOR TYPES
// ============================================================

/** Mask definition for image editing */
export interface MaskDefinition {
  id: string;
  type: 'protect' | 'edit';
  data: string; // Base64 encoded mask image
  label?: string;
}

/** Editor operation */
export interface EditorOperation {
  type: string;
  prompt?: string;
  parameters: Record<string, unknown>;
  maskId?: string;
}
