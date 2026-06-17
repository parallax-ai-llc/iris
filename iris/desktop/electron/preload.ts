import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { IrisKeyStatus } from './ipc/iris';

// Type for auth callback data
interface AuthCallbackData {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name?: string;
    profileImageThumbnail?: string;
  };
}

interface AuthErrorData {
  error: string;
}

// Updater data types
interface UpdateAvailableData {
  version: string;
  releaseDate: string;
  releaseNotes?: string | null;
}

interface DownloadProgressData {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

interface UpdateDownloadedData {
  version: string;
  releaseNotes?: string | null;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    forceClose: () => ipcRenderer.invoke('window:force-close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
      ipcRenderer.on('window:maximizeChanged', (_, isMaximized) => callback(isMaximized));
    },
    onCloseRequested: (callback: () => void) => {
      ipcRenderer.on('window:close-requested', callback);
    },
    removeCloseRequestedListener: () => {
      ipcRenderer.removeAllListeners('window:close-requested');
    },
  },

  // Authentication
  auth: {
    getToken: () => ipcRenderer.invoke('auth:getToken'),
    setToken: (token: string) => ipcRenderer.invoke('auth:setToken', token),
    getRefreshToken: () => ipcRenderer.invoke('auth:getRefreshToken'),
    setRefreshToken: (token: string) => ipcRenderer.invoke('auth:setRefreshToken', token),
    clearTokens: () => ipcRenderer.invoke('auth:clearTokens'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    setUser: (user: any) => ipcRenderer.invoke('auth:setUser', user),
    // OAuth: Open system browser for social login
    openOAuth: (provider: 'google' | 'apple') => ipcRenderer.invoke('auth:openOAuth', provider),
    // OAuth: Listen for callback from system browser
    onOAuthCallback: (callback: (data: AuthCallbackData) => void) => {
      ipcRenderer.on('auth:callback', (_, data) => callback(data));
    },
    onOAuthError: (callback: (data: AuthErrorData) => void) => {
      ipcRenderer.on('auth:error', (_, data) => callback(data));
    },
    // Cleanup listeners
    removeOAuthListeners: () => {
      ipcRenderer.removeAllListeners('auth:callback');
      ipcRenderer.removeAllListeners('auth:error');
    },
  },

  // File system
  files: {
    selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('files:selectFile', options),
    selectFiles: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('files:selectFiles', options),
    selectDirectory: () => ipcRenderer.invoke('files:selectDirectory'),
    saveFile: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('files:saveFile', options),
    readFile: (filePath: string) => ipcRenderer.invoke('files:readFile', filePath),
    writeFile: (filePath: string, data: ArrayBuffer) => ipcRenderer.invoke('files:writeFile', filePath, data),
    openPath: (filePath: string) => ipcRenderer.invoke('files:openPath', filePath),
    showInFolder: (filePath: string) => ipcRenderer.invoke('files:showInFolder', filePath),
    getDefaultSavePath: () => ipcRenderer.invoke('files:getDefaultSavePath'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },

  // Local storage (settings, cache)
  storage: {
    get: (key: string) => ipcRenderer.invoke('storage:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('storage:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('storage:delete', key),
    clear: () => ipcRenderer.invoke('storage:clear'),
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => process.platform,
    getLocalMediaPort: () => ipcRenderer.invoke('app:getLocalMediaPort') as Promise<number>,
  },

  // Local Iris workflow engine (embedded in main, BYOK)
  iris: {
    getApiBaseUrl: () => ipcRenderer.invoke('iris:getApiBaseUrl') as Promise<string>,
    openEnvFile: () => ipcRenderer.invoke('iris:openEnvFile') as Promise<boolean>,
    getKeyStatus: () => ipcRenderer.invoke('iris:getKeyStatus'),
    setKey: (envVar: string, value: string) =>
      ipcRenderer.invoke('iris:setKey', envVar, value),
  },

  // Bug report
  bugReport: {
    captureScreen: () => ipcRenderer.invoke('bugReport:captureScreen'),
  },

  // Video export
  videoExport: {
    checkFFmpeg: () => ipcRenderer.invoke('export:checkFFmpeg'),
    ensureFFmpeg: () => ipcRenderer.invoke('export:ensureFFmpeg'),
    start: (request: any) => ipcRenderer.invoke('export:start', request),
    cancel: () => ipcRenderer.invoke('export:cancel'),
    onProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('export:progress', (_, data) => callback(data));
    },
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners('export:progress');
    },
    onFFmpegSetupProgress: (callback: (data: { status: string; progress?: number; message?: string; error?: string }) => void) => {
      ipcRenderer.on('export:ffmpegSetupProgress', (_, data) => callback(data));
    },
    removeFFmpegSetupListener: () => {
      ipcRenderer.removeAllListeners('export:ffmpegSetupProgress');
    },
  },

  // Pre-render (merge multiple clips for AI tools)
  prerender: {
    mergeClips: (request: {
      clips: Array<{
        sourceUrl: string;
        startTime: number;
        endTime: number;
        sourceStartTime: number;
        sourceEndTime: number;
        volume?: number;
        speed?: number;
      }>;
      width: number;
      height: number;
      frameRate?: number;
      outputPath?: string;
    }) => ipcRenderer.invoke('prerender:mergeClips', request),
    cleanup: (filePath: string) => ipcRenderer.invoke('prerender:cleanup', filePath),
    cancel: () => ipcRenderer.invoke('prerender:cancel'),
    onProgress: (callback: (data: { status: string; progress: number; message: string; error?: string; outputPath?: string }) => void) => {
      ipcRenderer.on('prerender:progress', (_, data) => callback(data));
    },
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners('prerender:progress');
    },
  },

  // Silence removal (client-side FFmpeg)
  silenceRemoval: {
    analyze: (request: { inputPath: string }) =>
      ipcRenderer.invoke('silence:analyze', request),
    detect: (request: { inputPath: string; noiseThresholdDb: number; minSilenceDuration: number }) =>
      ipcRenderer.invoke('silence:detect', request),
    remove: (request: { inputPath: string; nonSilentSegments: Array<{ start: number; end: number }>; outputPath?: string }) =>
      ipcRenderer.invoke('silence:remove', request),
    cancel: () => ipcRenderer.invoke('silence:cancel'),
    onProgress: (callback: (data: { status: string; progress: number; message: string; error?: string; outputPath?: string }) => void) => {
      ipcRenderer.on('silence:progress', (_, data) => callback(data));
    },
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners('silence:progress');
    },
  },

  // Persistent local asset storage
  assetStorage: {
    download: (request: { assetId: string; downloadUrl: string; authToken: string; ext?: string }):
      Promise<{ success: boolean; localPath?: string; error?: string; alreadyExists?: boolean }> =>
      ipcRenderer.invoke('asset:download', request),
    getLocalPath: (assetId: string, ext?: string):
      Promise<{ localPath: string | null }> =>
      ipcRenderer.invoke('asset:getLocalPath', { assetId, ext }),
  },

  // Audio extraction (client-side FFmpeg for subtitle generation)
  audioExtract: {
    extract: (inputPath: string): Promise<{ success: boolean; audioBuffer?: ArrayBuffer; error?: string }> =>
      ipcRenderer.invoke('audio:extract', { inputPath }),
    separate: (inputPath: string, outputPath: string): Promise<{ success: boolean; outputPath?: string; error?: string }> =>
      ipcRenderer.invoke('audio:separate', { inputPath, outputPath }),
    cancel: () => ipcRenderer.invoke('audio:extractCancel'),
  },

  // Video utilities (dimension probing for rotation correction)
  video: {
    probeDimensions: (url: string, authToken?: string) =>
      ipcRenderer.invoke('video:probeDimensions', url, authToken),
    probeDuration: (url: string, authToken?: string) =>
      ipcRenderer.invoke('video:probeDuration', url, authToken),
  },

  // Proxy generation (low-res editing proxies)
  proxy: {
    generate: (request: {
      assetId: string;
      inputPath: string;
      width?: number;
      height?: number;
      force?: boolean;
    }) => ipcRenderer.invoke('proxy:generate', request),
    cancel: (assetId?: string) => ipcRenderer.invoke('proxy:cancel', { assetId }),
    check: (assetId: string) => ipcRenderer.invoke('proxy:check', { assetId }),
    hash: (filePath: string) => ipcRenderer.invoke('proxy:hash', { filePath }),
    onProgress: (cb: (data: { assetId: string; progress: number }) => void) => {
      const listener = (_: unknown, data: { assetId: string; progress: number }) => cb(data);
      ipcRenderer.on('proxy:progress', listener);
      return () => ipcRenderer.removeListener('proxy:progress', listener);
    },
  },

  // Extensions
  extensions: {
    getInstalled: () => ipcRenderer.invoke('extensions:getInstalled'),
    install: (sourceDir: string, trustTier?: string) => ipcRenderer.invoke('extensions:install', sourceDir, trustTier),
    uninstall: (extensionId: string) => ipcRenderer.invoke('extensions:uninstall', extensionId),
    enable: (extensionId: string) => ipcRenderer.invoke('extensions:enable', extensionId),
    disable: (extensionId: string) => ipcRenderer.invoke('extensions:disable', extensionId),
    getStatus: (extensionId: string) => ipcRenderer.invoke('extensions:getStatus', extensionId),
    grantPermissions: (extensionId: string, permissions: string[]) =>
      ipcRenderer.invoke('extensions:grantPermissions', extensionId, permissions),
    executeCommand: (commandId: string, args?: unknown[]) =>
      ipcRenderer.invoke('extensions:executeCommand', commandId, args),
    executeTool: (toolId: string, params: unknown) =>
      ipcRenderer.invoke('extensions:executeTool', toolId, params),
    onStatusChanged: (callback: (data: { extensionId: string; info: any }) => void) => {
      ipcRenderer.on('extensions:statusChanged', (_, data) => callback(data));
    },
    onContributionChanged: (callback: (data: any) => void) => {
      ipcRenderer.on('extensions:contributionChanged', (_, data) => callback(data));
    },
    onPermissionRequired: (callback: (data: { extensionId: string; manifest: any; requiredPermissions: string[] }) => void) => {
      ipcRenderer.on('extensions:permissionRequired', (_, data) => callback(data));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('extensions:statusChanged');
      ipcRenderer.removeAllListeners('extensions:contributionChanged');
      ipcRenderer.removeAllListeners('extensions:permissionRequired');
    },
  },

  // Auto-updater
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('updater:installUpdate'),
    skipVersion: (version: string) => ipcRenderer.invoke('updater:skipVersion', version),
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    setAutoCheck: (enabled: boolean) => ipcRenderer.invoke('updater:setAutoCheck', enabled),
    // Event listeners
    onChecking: (callback: () => void) => {
      ipcRenderer.on('updater:checking', callback);
    },
    onAvailable: (callback: (data: UpdateAvailableData) => void) => {
      ipcRenderer.on('updater:available', (_, data) => callback(data));
    },
    onNotAvailable: (callback: (data: { version: string }) => void) => {
      ipcRenderer.on('updater:not-available', (_, data) => callback(data));
    },
    onDownloadProgress: (callback: (data: DownloadProgressData) => void) => {
      ipcRenderer.on('updater:download-progress', (_, data) => callback(data));
    },
    onDownloaded: (callback: (data: UpdateDownloadedData) => void) => {
      ipcRenderer.on('updater:downloaded', (_, data) => callback(data));
    },
    onError: (callback: (data: { message: string }) => void) => {
      ipcRenderer.on('updater:error', (_, data) => callback(data));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('updater:checking');
      ipcRenderer.removeAllListeners('updater:available');
      ipcRenderer.removeAllListeners('updater:not-available');
      ipcRenderer.removeAllListeners('updater:download-progress');
      ipcRenderer.removeAllListeners('updater:downloaded');
      ipcRenderer.removeAllListeners('updater:error');
    },
  },
});

// Type definitions for the exposed API
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
    getUser: () => Promise<any>;
    setUser: (user: any) => Promise<void>;
    openOAuth: (provider: 'google' | 'apple') => Promise<void>;
    onOAuthCallback: (callback: (data: AuthCallbackData) => void) => void;
    onOAuthError: (callback: (data: AuthErrorData) => void) => void;
    removeOAuthListeners: () => void;
  };
  files: {
    selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
    selectFiles: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string[]>;
    selectDirectory: () => Promise<string | null>;
    saveFile: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
    readFile: (filePath: string) => Promise<ArrayBuffer>;
    writeFile: (filePath: string, data: ArrayBuffer) => Promise<void>;
    openPath: (filePath: string) => Promise<void>;
    showInFolder: (filePath: string) => Promise<void>;
    getDefaultSavePath: () => Promise<string>;
  };
  storage: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => string;
    getLocalMediaPort: () => Promise<number>;
  };
  iris: {
    getApiBaseUrl: () => Promise<string>;
    openEnvFile: () => Promise<boolean>;
    getKeyStatus: () => Promise<IrisKeyStatus[]>;
    setKey: (envVar: string, value: string) => Promise<IrisKeyStatus[]>;
  };
  bugReport: {
    captureScreen: () => Promise<string>;
  };
  videoExport: {
    checkFFmpeg: () => Promise<{ available: boolean; path: string; version?: string; needsUpgrade?: boolean; downloaded?: boolean; source?: 'bundled' | 'downloaded' | 'system'; error?: string }>;
    ensureFFmpeg: () => Promise<{ available: boolean; path: string; version?: string; needsUpgrade?: boolean; downloaded?: boolean; source?: 'bundled' | 'downloaded' | 'system'; error?: string }>;
    start: (request: any) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
    cancel: () => Promise<{ cancelled: boolean }>;
    onProgress: (callback: (data: { status: string; progress: number; message: string; error?: string; outputPath?: string }) => void) => void;
    removeProgressListener: () => void;
    onFFmpegSetupProgress: (callback: (data: { status: 'checking' | 'downloading' | 'ready' | 'failed'; progress?: number; message?: string; error?: string }) => void) => void;
    removeFFmpegSetupListener: () => void;
  };
  prerender: {
    mergeClips: (request: {
      clips: Array<{
        sourceUrl: string;
        startTime: number;
        endTime: number;
        sourceStartTime: number;
        sourceEndTime: number;
        volume?: number;
        speed?: number;
      }>;
      width: number;
      height: number;
      frameRate?: number;
      outputPath?: string;
    }) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
    cleanup: (filePath: string) => Promise<{ success: boolean }>;
    cancel: () => Promise<{ cancelled: boolean }>;
    onProgress: (callback: (data: { status: string; progress: number; message: string; error?: string; outputPath?: string }) => void) => void;
    removeProgressListener: () => void;
  };
  silenceRemoval: {
    analyze: (request: { inputPath: string }) =>
      Promise<{ success: boolean; meanVolume?: number; maxVolume?: number; error?: string }>;
    detect: (request: { inputPath: string; noiseThresholdDb: number; minSilenceDuration: number }) =>
      Promise<{ success: boolean; segments: Array<{ start: number; end: number; duration: number }>; totalDuration: number; error?: string }>;
    remove: (request: { inputPath: string; nonSilentSegments: Array<{ start: number; end: number }>; outputPath?: string }) =>
      Promise<{ success: boolean; outputPath?: string; error?: string }>;
    cancel: () => Promise<{ cancelled: boolean }>;
    onProgress: (callback: (data: { status: string; progress: number; message: string; error?: string; outputPath?: string }) => void) => void;
    removeProgressListener: () => void;
  };
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
  proxy: {
    generate: (request: { sourceUrl: string; assetId: string; width?: number; height?: number }) =>
      Promise<{ success: boolean; outputPath?: string; error?: string }>;
  };
  extensions: {
    getInstalled: () => Promise<any[]>;
    install: (sourceDir: string, trustTier?: string) => Promise<{ success: boolean; error?: string; extensionId?: string }>;
    uninstall: (extensionId: string) => Promise<{ success: boolean }>;
    enable: (extensionId: string) => Promise<{ success: boolean }>;
    disable: (extensionId: string) => Promise<{ success: boolean }>;
    getStatus: (extensionId: string) => Promise<any>;
    grantPermissions: (extensionId: string, permissions: string[]) => Promise<{ success: boolean }>;
    executeCommand: (commandId: string, args?: unknown[]) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    executeTool: (toolId: string, params: unknown) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    onStatusChanged: (callback: (data: { extensionId: string; info: any }) => void) => void;
    onContributionChanged: (callback: (data: any) => void) => void;
    onPermissionRequired: (callback: (data: { extensionId: string; manifest: any; requiredPermissions: string[] }) => void) => void;
    removeAllListeners: () => void;
  };
  updater: {
    checkForUpdates: () => Promise<{ status: string; updateInfo?: { version: string; releaseDate: string } | null; message?: string }>;
    downloadUpdate: () => Promise<{ status: string; message?: string }>;
    installUpdate: () => void;
    skipVersion: (version: string) => Promise<{ status: string }>;
    getStatus: () => Promise<{
      isCheckingForUpdate: boolean;
      isDownloading: boolean;
      downloadProgress: number;
      updateAvailable: { version: string; releaseDate: string } | null;
      lastUpdateCheck?: number;
      autoCheckEnabled: boolean;
    }>;
    setAutoCheck: (enabled: boolean) => Promise<{ status: string }>;
    onChecking: (callback: () => void) => void;
    onAvailable: (callback: (data: { version: string; releaseDate: string; releaseNotes?: string | null }) => void) => void;
    onNotAvailable: (callback: (data: { version: string }) => void) => void;
    onDownloadProgress: (callback: (data: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
    onDownloaded: (callback: (data: { version: string; releaseNotes?: string | null }) => void) => void;
    onError: (callback: (data: { message: string }) => void) => void;
    removeAllListeners: () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
