import { memo, useState } from 'react';
import { Download, Check, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { InstallationStatus } from '@/shared/api/extension.types';

interface InstallButtonProps {
  status: InstallationStatus;
  onInstall: () => void;
  onUninstall: () => void;
  size?: 'sm' | 'lg';
}

export const InstallButton = memo(function InstallButton({
  status,
  onInstall,
  onUninstall,
  size = 'sm',
}: InstallButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { t } = useTranslation('extensions');

  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-5 py-2 text-sm';

  if (status === 'installing' || status === 'uninstalling') {
    return (
      <button
        disabled
        className={cn(
          'flex items-center gap-1.5 rounded-lg font-medium bg-zinc-700 text-zinc-400',
          sizeClasses
        )}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {status === 'installing' ? t('card.installing') : t('card.removing')}
      </button>
    );
  }

  if (status === 'installed') {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onUninstall();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg font-medium transition-all border',
          isHovered
            ? 'bg-red-900/30 text-red-400 border-red-800'
            : 'bg-zinc-800 text-zinc-300 border-zinc-700',
          sizeClasses
        )}
      >
        {isHovered ? (
          t('card.uninstall')
        ) : (
          <>
            <Check className="w-3.5 h-3.5" />
            {t('card.installed')}
          </>
        )}
      </button>
    );
  }

  if (status === 'error') {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onInstall();
        }}
        className={cn(
          'flex items-center gap-1.5 rounded-lg font-medium bg-red-900/30 text-red-400 border border-red-800',
          sizeClasses
        )}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        {t('card.retry')}
      </button>
    );
  }

  // not_installed
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onInstall();
      }}
      className={cn(
        'flex items-center gap-1.5 rounded-lg font-medium bg-white text-zinc-900 hover:bg-zinc-200 transition-colors',
        sizeClasses
      )}
    >
      <Download className="w-3.5 h-3.5" />
      {t('card.install')}
    </button>
  );
});
