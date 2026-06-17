/**
 * UpdateNotification - Displays app update notifications
 */

import { memo } from 'react';
import { Download, RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useUpdater } from '@/shared/hooks/useUpdater';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const UpdateNotification = memo(function UpdateNotification() {
  const { status, updateInfo, downloadProgress, downloadUpdate, installUpdate, skipVersion } =
    useUpdater();

  // Don't show if no update or still checking
  if (!status?.updateAvailable || status.isCheckingForUpdate) {
    return null;
  }

  const isDownloading = status.isDownloading;
  const isDownloaded = status.downloadProgress === 100 && !isDownloading;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 z-[100] max-w-sm w-full',
        'bg-zinc-900/95 border border-zinc-700/50 rounded-xl shadow-2xl backdrop-blur-sm',
        'p-4 animate-in slide-in-from-left-4 duration-300'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <ArrowUpCircle className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white">Update Available</h4>
          <p className="text-xs text-zinc-400 mt-0.5">
            Version {updateInfo?.version || status.updateAvailable.version}
          </p>
        </div>
        {!isDownloading && !isDownloaded && (
          <button
            onClick={skipVersion}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Skip this version"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress bar (when downloading) */}
      {isDownloading && downloadProgress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
            <span>Downloading...</span>
            <span>{Math.round(downloadProgress.percent)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress.percent}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {isDownloaded ? (
          <button
            onClick={installUpdate}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2',
              'bg-green-600 hover:bg-green-500 text-white text-sm font-medium',
              'rounded-lg transition-colors'
            )}
          >
            <RefreshCw className="w-4 h-4" />
            Restart to Update
          </button>
        ) : isDownloading ? (
          <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-400 text-sm rounded-lg">
            <Download className="w-4 h-4 animate-bounce" />
            Downloading...
          </div>
        ) : (
          <>
            <button
              onClick={downloadUpdate}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2',
                'bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium',
                'rounded-lg transition-colors'
              )}
            >
              <Download className="w-4 h-4" />
              Download Update
            </button>
            <button
              onClick={skipVersion}
              className={cn(
                'px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm',
                'hover:bg-zinc-800 rounded-lg transition-colors'
              )}
            >
              Later
            </button>
          </>
        )}
      </div>
    </div>
  );
});
