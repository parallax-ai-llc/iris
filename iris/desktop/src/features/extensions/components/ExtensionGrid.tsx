import { memo } from 'react';
import { Puzzle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Extension, InstallationStatus } from '@/shared/api/extension.types';
import { ExtensionCard } from './ExtensionCard';

interface ExtensionGridProps {
  extensions: Extension[];
  getInstallStatus: (id: string) => InstallationStatus;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onViewDetail: (id: string) => void;
  isLoading?: boolean;
}

export const ExtensionGrid = memo(function ExtensionGrid({
  extensions,
  getInstallStatus,
  onInstall,
  onUninstall,
  onViewDetail,
  isLoading,
}: ExtensionGridProps) {
  const { t } = useTranslation('extensions');

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 animate-pulse"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-zinc-700" />
              <div className="flex-1">
                <div className="h-4 bg-zinc-700 rounded w-3/4 mb-2" />
                <div className="h-3 bg-zinc-700/50 rounded w-1/2" />
              </div>
            </div>
            <div className="h-8 bg-zinc-700/30 rounded mb-3" />
            <div className="h-3 bg-zinc-700/30 rounded w-2/3 mb-4" />
            <div className="h-8 bg-zinc-700/50 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (extensions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Puzzle className="w-12 h-12 text-zinc-600 mb-4" />
        <h3 className="text-lg font-medium text-zinc-400 mb-1">
          {t('empty.title')}
        </h3>
        <p className="text-sm text-zinc-500">{t('empty.description')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {extensions.map((ext) => (
        <ExtensionCard
          key={ext.id}
          extension={ext}
          installStatus={getInstallStatus(ext.id)}
          onInstall={() => onInstall(ext.id)}
          onUninstall={() => onUninstall(ext.id)}
          onViewDetail={() => onViewDetail(ext.id)}
        />
      ))}
    </div>
  );
});
