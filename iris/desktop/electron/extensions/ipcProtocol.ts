/**
 * IPC Protocol types for Extension Host communication.
 *
 * Communication flow:
 *   Extension (Worker) → ExtensionHost (fork) → Main Process → Renderer
 *
 * All iris.* API calls go through this protocol.
 */

// ─── Permission Types ───

export const PERMISSIONS = [
  'commands:register',
  'tools:register',
  'workflow:register',
  'ui:panel',
  'image:read',
  'image:write',
  'ai:execute',
  'network',
  'clipboard',
  'filesystem:read',
  'filesystem:write',
  'export:configure',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionRiskLevel = 'low' | 'medium' | 'high';

export const PERMISSION_RISK: Record<Permission, PermissionRiskLevel> = {
  'commands:register': 'low',
  'tools:register': 'low',
  'workflow:register': 'low',
  'ui:panel': 'low',
  'image:read': 'medium',
  'image:write': 'medium',
  'clipboard': 'medium',
  'ai:execute': 'high',
  'network': 'high',
  'filesystem:read': 'high',
  'filesystem:write': 'high',
  'export:configure': 'medium',
};

export const PERMISSION_LABELS: Record<Permission, { title: string; description: string }> = {
  'commands:register': { title: 'Register Commands', description: 'Register custom commands' },
  'tools:register': { title: 'Register Tools', description: 'Add new tools to the tool panel' },
  'workflow:register': { title: 'Register Workflow Nodes', description: 'Add custom workflow nodes' },
  'ui:panel': { title: 'Create UI Panels', description: 'Create webview panels in the UI' },
  'image:read': { title: 'Read Images', description: 'Access the current canvas image' },
  'image:write': { title: 'Write Images', description: 'Modify images on the canvas' },
  'clipboard': { title: 'Clipboard Access', description: 'Read and write clipboard content' },
  'ai:execute': { title: 'Execute AI Models', description: 'Run AI models (uses credits)' },
  'network': { title: 'Network Access', description: 'Make HTTP requests to external services' },
  'filesystem:read': { title: 'Read Files', description: 'Read files from the filesystem' },
  'filesystem:write': { title: 'Write Files', description: 'Write files to the filesystem' },
  'export:configure': { title: 'Configure Export', description: 'Read and modify video export settings' },
};

// ─── Activation Events ───

export type ActivationEvent =
  | 'onStartup'
  | `onCommand:${string}`
  | `onTool:${string}`
  | `onWorkflowNode:${string}`
  | `onView:${string}`
  | 'onImageOpen';

// ─── Contribution Types ───

export interface ContributedCommand {
  command: string;
  title: string;
  icon?: string;
  category?: string;
}

export interface ContributedTool {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
}

export interface ContributedWorkflowNode {
  id: string;
  name: string;
  category: string;
  inputs: { id: string; type: string; label?: string }[];
  outputs: { id: string; type: string; label?: string }[];
  configFields?: { id: string; type: string; label: string; default?: unknown }[];
}

export interface ContributedPanel {
  id: string;
  title: string;
  location: 'sidebar' | 'bottom' | 'floating';
  icon?: string;
}

export interface ContributedKeybinding {
  command: string;
  key: string;
  when?: string;
}

export interface ContributedSetting {
  id: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  title: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  secret?: boolean;
}

export interface ContributionPoints {
  commands?: ContributedCommand[];
  tools?: ContributedTool[];
  workflowNodes?: ContributedWorkflowNode[];
  panels?: ContributedPanel[];
  menus?: Record<string, { command: string; when?: string }[]>;
  keybindings?: ContributedKeybinding[];
  settings?: ContributedSetting[];
}

// ─── Extension Manifest ───

export interface ExtensionManifest {
  id: string;                    // publisher.extension-name
  name: string;
  version: string;
  engineVersion?: string;        // semver range for Iris compatibility
  main: string;                  // entry point (relative path)
  displayName?: string;
  description?: string;
  icon?: string;                 // relative path to icon
  publisher: string;
  activationEvents: ActivationEvent[];
  contributes?: ContributionPoints;
  permissions: Permission[];
}

// ─── Trust Tiers ───

export type TrustTier = 'official' | 'verified' | 'community';

// ─── Extension State ───

export type ExtensionStatus =
  | 'installed'
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'error'
  | 'disabled';

export interface ExtensionRuntimeInfo {
  id: string;
  manifest: ExtensionManifest;
  status: ExtensionStatus;
  installPath: string;
  trustTier: TrustTier;
  grantedPermissions: Permission[];
  error?: string;
}

// ─── IPC Messages (Main ↔ ExtensionHost) ───

export type ExtHostMessageType =
  | 'api-call'
  | 'api-response'
  | 'event'
  | 'lifecycle'
  | 'log'
  | 'contribution';

export interface ExtHostApiCall {
  type: 'api-call';
  requestId: string;
  extensionId: string;
  payload: {
    namespace: string;   // 'iris.image', 'iris.commands', etc.
    method: string;      // 'getActive', 'register', etc.
    args: unknown[];
  };
}

export interface ExtHostApiResponse {
  type: 'api-response';
  requestId: string;
  extensionId: string;
  payload: {
    result?: unknown;
    error?: { code: string; message: string };
  };
}

export interface ExtHostEvent {
  type: 'event';
  extensionId: string;   // '*' for broadcast
  payload: {
    eventName: string;   // 'image:didChangeActive', etc.
    data: unknown;
  };
}

export interface ExtHostLifecycle {
  type: 'lifecycle';
  extensionId: string;
  payload: {
    action: 'activate' | 'deactivate' | 'activated' | 'deactivated' | 'error';
    error?: string;
    /**
     * Generation token minted by the Main Process for one 'activate' request
     * and echoed on every lifecycle message the resulting worker produces.
     * Without it a dying predecessor's 'error' is indistinguishable from the
     * new worker's, and rejects the healthy activation that replaced it.
     */
    generation?: string;
  };
}

export interface ExtHostLog {
  type: 'log';
  extensionId: string;
  payload: {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    args?: unknown[];
  };
}

export interface ExtHostContribution {
  type: 'contribution';
  extensionId: string;
  payload: {
    action: 'register' | 'unregister';
    contributionType: 'command' | 'tool' | 'workflowNode' | 'panel' | 'statusBarItem';
    data: unknown;
  };
}

export type ExtHostMessage =
  | ExtHostApiCall
  | ExtHostApiResponse
  | ExtHostEvent
  | ExtHostLifecycle
  | ExtHostLog
  | ExtHostContribution;

// ─── IPC Messages (Renderer ↔ Main) ───

/** Result shape shared by the install channels */
export interface ExtensionInstallResult {
  success: boolean;
  error?: string;
  extensionId?: string;
}

/** Options accepted by the install channels */
export interface ExtensionInstallOptions {
  /** Replace an already-installed extension with the same id (deactivate → replace → re-activate). Default: reject duplicates. */
  upgrade?: boolean;
}

/** Renderer → Main: install/uninstall/enable/disable extensions */
export interface ExtensionIpcChannels {
  'extensions:getInstalled': () => Promise<ExtensionRuntimeInfo[]>;
  /** Install from a local directory containing iris-extension.json (dev install / extracted bundle) */
  'extensions:install': (sourceDir: string, trustTier?: TrustTier, opts?: ExtensionInstallOptions) => Promise<ExtensionInstallResult>;
  /** Install from a .iex bundle (ZIP) — source is an http(s) URL or a local file path */
  'extensions:installFromIex': (source: string, trustTier?: TrustTier, opts?: ExtensionInstallOptions) => Promise<ExtensionInstallResult>;
  'extensions:uninstall': (extensionId: string) => Promise<{ success: boolean }>;
  'extensions:enable': (extensionId: string) => Promise<{ success: boolean }>;
  'extensions:disable': (extensionId: string) => Promise<{ success: boolean }>;
  /**
   * Snapshot of runtime contributions registered by active extensions.
   * Every entry is a replayable `extensions:contributionChanged` message with
   * `payload.action === 'register'`, so the renderer can feed each one to the
   * same handler it uses for live events. Excludes workflowNode (v1 non-goal).
   */
  'extensions:getContributions': () => Promise<ExtHostContribution[]>;
  /**
   * Forget a panel the user closed. Removes it from the contribution snapshot
   * so a later `extensions:getContributions` does not resurrect it.
   * `success` is false when no panel with that id was recorded.
   */
  'extensions:dismissPanel': (panelId: string) => Promise<{ success: boolean }>;
  'extensions:getStatus': (extensionId: string) => Promise<ExtensionRuntimeInfo | null>;
  'extensions:grantPermissions': (extensionId: string, permissions: Permission[]) => Promise<{ success: boolean }>;
  'extensions:executeCommand': (commandId: string, args?: unknown[]) => Promise<unknown>;
  'extensions:executeTool': (toolId: string, params: unknown) => Promise<unknown>;
}

// ─── Resource Limits ───

export const RESOURCE_LIMITS = {
  /** Max memory per worker (bytes) */
  WORKER_MEMORY_LIMIT: 256 * 1024 * 1024,  // 256MB
  /** Timeout for synchronous API calls (ms) */
  SYNC_API_TIMEOUT: 5_000,
  /** Timeout for async API calls (ms) */
  ASYNC_API_TIMEOUT: 30_000,
  /** Maximum concurrent workers */
  MAX_CONCURRENT_WORKERS: 8,
  /** Maximum pending API calls per extension */
  MAX_PENDING_CALLS: 50,
} as const;
