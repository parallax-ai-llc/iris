/**
 * InstallFromLocalButton — developer flow: install an extension from a local
 * directory (the output of `iris-ext create` + build).
 *
 * Opens the OS directory picker, then installs via the extensions:install IPC
 * with upgrade:true so re-installing during development replaces the previous
 * copy in place.
 */
import { useState } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/shared/lib/toast';
import { useExtensionStore } from '@/features/extensions/stores/extension.store';

export function InstallFromLocalButton() {
  const { t } = useTranslation('extensions');
  const [isInstalling, setIsInstalling] = useState(false);
  const fetchInstalledExtensions = useExtensionStore((s) => s.fetchInstalledExtensions);

  const handleInstall = async () => {
    const api = window.electronAPI;
    if (!api?.extensions || isInstalling) return;

    const dir = await api.files.selectDirectory();
    if (!dir) return; // user cancelled

    setIsInstalling(true);
    try {
      const result = await api.extensions.install(dir, 'community', { upgrade: true });
      if (result.success) {
        toast.success(t('local.installSuccess', { id: result.extensionId ?? '' }));
        // Refresh the marketplace "installed" state so buttons update.
        void fetchInstalledExtensions();
      } else {
        toast.error(t('local.installError', { error: result.error ?? 'unknown' }));
      }
    } catch (err) {
      toast.error(
        t('local.installError', { error: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <button
      onClick={() => void handleInstall()}
      disabled={isInstalling}
      className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title={t('local.sectionTitle')}
    >
      {isInstalling ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FolderOpen className="w-4 h-4" />
      )}
      {isInstalling ? t('local.installing') : t('local.installFromDirectory')}
    </button>
  );
}
