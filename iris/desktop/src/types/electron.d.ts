/**
 * Type definitions for Electron API exposed via preload
 */

// BYOK provider key status (workflow engine). Mirror of electron/ipc/iris.ts.
export interface IrisKeyStatus {
  envVar: string;
  label: string;
  hasEnv: boolean;
  hasOverride: boolean;
  last4: string;
}

// Updater types
export interface UpdateAvailableData {
  version: string;
  releaseDate: string;
  releaseNotes?: string | null;
}

export interface DownloadProgressData {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateDownloadedData {
  version: string;
  releaseNotes?: string | null;
}

export interface UpdaterStatus {
  isCheckingForUpdate: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  updateAvailable: { version: string; releaseDate: string } | null;
  lastUpdateCheck?: number;
  autoCheckEnabled: boolean;
}

export interface UpdaterAPI {
  checkForUpdates: () => Promise<{ status: string; updateInfo?: { version: string; releaseDate: string } | null; message?: string }>;
  downloadUpdate: () => Promise<{ status: string; message?: string }>;
  installUpdate: () => void;
  skipVersion: (version: string) => Promise<{ status: string }>;
  getStatus: () => Promise<UpdaterStatus>;
  setAutoCheck: (enabled: boolean) => Promise<{ status: string }>;
  onChecking: (callback: () => void) => void;
  onAvailable: (callback: (data: UpdateAvailableData) => void) => void;
  onNotAvailable: (callback: (data: { version: string }) => void) => void;
  onDownloadProgress: (callback: (data: DownloadProgressData) => void) => void;
  onDownloaded: (callback: (data: UpdateDownloadedData) => void) => void;
  onError: (callback: (data: { message: string }) => void) => void;
  removeAllListeners: () => void;
}

export interface AuthCallbackData {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name?: string;
    profileImageThumbnail?: string;
  };
}

export interface AuthErrorData {
  error: string;
}

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    forceClose: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => void;
    onCloseRequested: (callback: () => void) => void;
    removeCloseRequestedListener: () => void;
  };
  auth: {
    getToken: () => Promise<string | null>;
    setToken: (token: string) => Promise<void>;
    getRefreshToken: () => Promise<string | null>;
    setRefreshToken: (token: string) => Promise<void>;
    clearTokens: () => Promise<void>;
    getUser: () => Promise<User | null>;
    setUser: (user: User) => Promise<void>;
    // OAuth via system browser
    openOAuth: (provider: 'google' | 'apple') => Promise<void>;
    onOAuthCallback: (callback: (data: AuthCallbackData) => void) => void;
    onOAuthError: (callback: (data: AuthErrorData) => void) => void;
    removeOAuthListeners: () => void;
  };
  files: {
    selectFile: (options?: FileDialogOptions) => Promise<string | null>;
    selectFiles: (options?: FileDialogOptions) => Promise<string[]>;
    selectDirectory: () => Promise<string | null>;
    saveFile: (options?: SaveDialogOptions) => Promise<string | null>;
    readFile: (filePath: string) => Promise<ArrayBuffer>;
    writeFile: (filePath: string, data: ArrayBuffer) => Promise<void>;
    openPath: (filePath: string) => Promise<void>;
    showInFolder: (filePath: string) => Promise<void>;
    getPathForFile: (file: File) => string;
  };
  storage: {
    get: <T = unknown>(key: string) => Promise<T | undefined>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => string;
    getLocalMediaPort: () => Promise<number>;
  };
  iris: {
    /** Base URL of the embedded local Iris workflow engine server. */
    getApiBaseUrl: () => Promise<string>;
    /** Open `<userData>/iris-flow/.env` (BYOK keys) in the OS editor. */
    openEnvFile: () => Promise<boolean>;
    /** Per-provider BYOK key status (never returns raw keys). */
    getKeyStatus: () => Promise<IrisKeyStatus[]>;
    /** Set (or clear, when value is empty) a provider key override. */
    setKey: (envVar: string, value: string) => Promise<IrisKeyStatus[]>;
  };
  bugReport: {
    captureScreen: () => Promise<string>;
  };
  videoExport: ExportAPI;
  prerender: PrerenderAPI;
  silenceRemoval: SilenceRemovalAPI;
  assetStorage: {
    download: (request: { assetId: string; downloadUrl: string; authToken: string; ext?: string }) =>
      Promise<{ success: boolean; localPath?: string; error?: string; alreadyExists?: boolean }>;
    getLocalPath: (assetId: string, ext?: string) => Promise<{ localPath: string | null }>;
  };
  audioExtract: {
    extract: (inputPath: string) => Promise<{ success: boolean; audioBuffer?: ArrayBuffer; error?: string }>;
    separate: (inputPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
    cancel: () => Promise<{ cancelled: boolean }>;
  };
  waveform: {
    extractPeaks: (request: { src: string; sampleCount: number; authToken?: string }) =>
      Promise<{ success: boolean; peaks?: number[]; error?: string }>;
  };
  proxy: ProxyAPI;
  extensions: ExtensionsAPI;
  updater: UpdaterAPI;
  video: {
    probeDimensions: (url: string, authToken?: string) => Promise<{ width: number; height: number } | null>;
    probeDuration: (url: string, authToken?: string) => Promise<number | null>;
  };
}

export interface ExtensionsAPI {
  getInstalled: () => Promise<unknown[]>;
  install: (sourceDir: string, trustTier?: string) => Promise<{ success: boolean; error?: string; extensionId?: string }>;
  uninstall: (extensionId: string) => Promise<{ success: boolean }>;
  enable: (extensionId: string) => Promise<{ success: boolean }>;
  disable: (extensionId: string) => Promise<{ success: boolean }>;
  getStatus: (extensionId: string) => Promise<unknown>;
  grantPermissions: (extensionId: string, permissions: string[]) => Promise<{ success: boolean }>;
  executeCommand: (commandId: string, args?: unknown[]) => Promise<{ success: boolean; result?: unknown; error?: string }>;
  executeTool: (toolId: string, params: unknown) => Promise<{ success: boolean; result?: unknown; error?: string }>;
  onStatusChanged: (callback: (data: { extensionId: string; info: { status: string; error?: string } | null }) => void) => void;
  onContributionChanged: (callback: (data: { extensionId: string; payload: { action: 'register' | 'unregister'; contributionType: string; data: unknown } }) => void) => void;
  onPermissionRequired: (callback: (data: { extensionId: string; manifest: { displayName?: string; name: string; publisher: string }; requiredPermissions: string[] }) => void) => void;
  removeAllListeners: () => void;
}

export interface ExportProgressData {
  status: 'preparing' | 'downloading' | 'rendering' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
  outputPath?: string;
}

export interface FFmpegEnsureResult {
  available: boolean;
  path: string;
  version?: string;
  needsUpgrade?: boolean;
  downloaded?: boolean;
  source?: 'bundled' | 'downloaded' | 'system';
  error?: string;
}

export interface FFmpegSetupProgress {
  status: 'checking' | 'downloading' | 'ready' | 'failed';
  progress?: number;
  message?: string;
  error?: string;
}

export interface ExportAPI {
  checkFFmpeg: () => Promise<FFmpegEnsureResult>;
  ensureFFmpeg: () => Promise<FFmpegEnsureResult>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  start: (request: any) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  cancel: () => Promise<{ cancelled: boolean }>;
  onProgress: (callback: (data: ExportProgressData) => void) => void;
  removeProgressListener: () => void;
  onFFmpegSetupProgress: (callback: (data: FFmpegSetupProgress) => void) => void;
  removeFFmpegSetupListener: () => void;
}

export interface PrerenderClipInput {
  sourceUrl: string;
  startTime: number;
  endTime: number;
  sourceStartTime: number;
  sourceEndTime: number;
  volume?: number;
  speed?: number;
}

export interface PrerenderProgressData {
  status: string;
  progress: number;
  message: string;
  error?: string;
  outputPath?: string;
}

export interface PrerenderAPI {
  mergeClips: (request: {
    clips: PrerenderClipInput[];
    width: number;
    height: number;
    frameRate?: number;
    outputPath?: string;
  }) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  cleanup: (filePath: string) => Promise<{ success: boolean }>;
  cancel: () => Promise<{ cancelled: boolean }>;
  onProgress: (callback: (data: PrerenderProgressData) => void) => void;
  removeProgressListener: () => void;
}

export interface SilenceRemovalProgressData {
  status: 'detecting' | 'removing' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
  outputPath?: string;
}

export interface SilenceRemovalAPI {
  analyze: (request: { inputPath: string }) => Promise<{
    success: boolean;
    meanVolume?: number;
    maxVolume?: number;
    error?: string;
  }>;
  detect: (request: {
    inputPath: string;
    noiseThresholdDb: number;
    minSilenceDuration: number;
  }) => Promise<{
    success: boolean;
    segments: Array<{ start: number; end: number; duration: number }>;
    totalDuration: number;
    error?: string;
  }>;
  remove: (request: {
    inputPath: string;
    nonSilentSegments: Array<{ start: number; end: number }>;
    outputPath?: string;
  }) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  cancel: () => Promise<{ cancelled: boolean }>;
  onProgress: (callback: (data: SilenceRemovalProgressData) => void) => void;
  removeProgressListener: () => void;
}

export interface ProxyAPI {
  generate: (request: {
    assetId: string;
    inputPath: string;
    width?: number;
    height?: number;
    force?: boolean;
  }) => Promise<{
    success: boolean;
    outputPath?: string;
    hash?: string | null;
    cached?: boolean;
    cancelled?: boolean;
    error?: string;
  }>;
  cancel: (assetId?: string) => Promise<{ cancelled: boolean; assetId?: string }>;
  check: (assetId: string) => Promise<{ exists: boolean; outputPath: string | null }>;
  hash: (filePath: string) => Promise<{ hash: string | null }>;
  onProgress: (cb: (data: { assetId: string; progress: number }) => void) => () => void;
}

interface User {
  id: string;
  email: string;
  name?: string;
  profileImageThumbnail?: string;
}

interface FileDialogOptions {
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface SaveDialogOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
