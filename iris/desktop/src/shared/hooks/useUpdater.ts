/**
 * Hook for managing app auto-updates
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  UpdateAvailableData,
  DownloadProgressData,
  UpdaterStatus,
} from '@/types/electron';

export interface UseUpdaterReturn {
  // State
  status: UpdaterStatus | null;
  updateInfo: UpdateAvailableData | null;
  downloadProgress: DownloadProgressData | null;
  isReady: boolean;
  error: string | null;

  // Actions
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => void;
  skipVersion: () => Promise<void>;
  setAutoCheck: (enabled: boolean) => Promise<void>;
  clearError: () => void;
}

export function useUpdater(): UseUpdaterReturn {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateAvailableData | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize and fetch initial status
  useEffect(() => {
    const updater = window.electronAPI?.updater;
    if (!updater) {
      setIsReady(false);
      return;
    }

    // Get initial status
    updater.getStatus().then((initialStatus) => {
      setStatus(initialStatus);
      setIsReady(true);
    });

    // Set up event listeners
    updater.onChecking(() => {
      setStatus((prev) => (prev ? { ...prev, isCheckingForUpdate: true } : prev));
    });

    updater.onAvailable((data) => {
      setUpdateInfo(data);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              isCheckingForUpdate: false,
              updateAvailable: { version: data.version, releaseDate: data.releaseDate },
            }
          : prev
      );
    });

    updater.onNotAvailable(() => {
      setUpdateInfo(null);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              isCheckingForUpdate: false,
              updateAvailable: null,
            }
          : prev
      );
    });

    updater.onDownloadProgress((progress) => {
      setDownloadProgress(progress);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              isDownloading: true,
              downloadProgress: progress.percent,
            }
          : prev
      );
    });

    updater.onDownloaded((data) => {
      setDownloadProgress(null);
      setUpdateInfo((prev) =>
        prev ? { ...prev, ...data } : { version: data.version, releaseDate: '', releaseNotes: data.releaseNotes }
      );
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              isDownloading: false,
              downloadProgress: 100,
            }
          : prev
      );
    });

    updater.onError((data) => {
      setError(data.message);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              isCheckingForUpdate: false,
              isDownloading: false,
            }
          : prev
      );
    });

    // Cleanup — removeAllListeners() only removes updater-specific IPC channels
    // (updater:checking, updater:available, updater:not-available, updater:download-progress,
    //  updater:downloaded, updater:error) so it will not affect listeners from other modules.
    return () => {
      updater.removeAllListeners();
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;

    setError(null);
    const result = await updater.checkForUpdates();
    if (result.status === 'error' && result.message) {
      setError(result.message);
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;

    setError(null);
    const result = await updater.downloadUpdate();
    if (result.status === 'error' && result.message) {
      setError(result.message);
    }
  }, []);

  const installUpdate = useCallback(() => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;

    updater.installUpdate();
  }, []);

  const skipVersion = useCallback(async () => {
    const updater = window.electronAPI?.updater;
    if (!updater || !updateInfo) return;

    await updater.skipVersion(updateInfo.version);
    setUpdateInfo(null);
    setStatus((prev) => (prev ? { ...prev, updateAvailable: null } : prev));
  }, [updateInfo]);

  const setAutoCheck = useCallback(async (enabled: boolean) => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;

    await updater.setAutoCheck(enabled);
    setStatus((prev) => (prev ? { ...prev, autoCheckEnabled: enabled } : prev));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    status,
    updateInfo,
    downloadProgress,
    isReady,
    error,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    skipVersion,
    setAutoCheck,
    clearError,
  };
}
