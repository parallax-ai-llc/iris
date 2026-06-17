import { useConnectionStore } from '@/shared/stores/connection.store';
import { useUpdater } from '@/shared/hooks/useUpdater';
import { ArrowUpCircle, RefreshCw, Download, Loader2 } from 'lucide-react';

interface ConnectionStatusProps {
  isExpanded: boolean;
}

export function ConnectionStatus({ isExpanded }: ConnectionStatusProps) {
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  const appVersion = useConnectionStore((s) => s.appVersion);
  const { status, downloadProgress, downloadUpdate, installUpdate } = useUpdater();

  const statusLabel = isServerConnected ? 'Connected' : 'Disconnected';
  const versionLabel = appVersion ? `v${appVersion}` : `v${__APP_VERSION__}`;

  const isChecking = !!status?.isCheckingForUpdate;
  const hasUpdate = !!status?.updateAvailable && !isChecking;
  const isDownloading = status?.isDownloading;
  const isDownloaded = status?.downloadProgress === 100 && !isDownloading;

  const tooltipText = `${statusLabel}${versionLabel ? ` · ${versionLabel}` : ''}`;

  const renderRightSlot = () => {
    if (isChecking) {
      return (
        <span className="dt-conn-action" title="Checking for updates…">
          <Loader2 className="w-3 h-3 animate-spin" />
          Checking
        </span>
      );
    }

    if (isDownloaded) {
      return (
        <button onClick={installUpdate} className="dt-conn-action" title="Restart to update">
          <RefreshCw className="w-3 h-3" />
          Restart
        </button>
      );
    }

    if (isDownloading) {
      const percent = downloadProgress ? Math.round(downloadProgress.percent) : 0;
      return (
        <span className="dt-conn-action">
          <Download className="w-3 h-3 animate-bounce" />
          {percent}%
        </span>
      );
    }

    if (hasUpdate) {
      return (
        <button
          onClick={downloadUpdate}
          className="dt-conn-action"
          title={`Update to ${status?.updateAvailable?.version}`}
        >
          <ArrowUpCircle className="w-3 h-3" />
          Update
        </button>
      );
    }

    if (versionLabel) {
      return <span className="dt-conn-ver">{versionLabel}</span>;
    }

    return null;
  };

  return (
    <div className="dt-conn" title={tooltipText}>
      <span className={`dt-conn-dot${isServerConnected ? '' : ' dt-conn-dot-err'}`} />
      {isExpanded && (
        <>
          <span>{statusLabel}</span>
          {renderRightSlot()}
        </>
      )}
    </div>
  );
}
