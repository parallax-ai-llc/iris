import { useCallback, useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatFileSize } from '@/shared/lib/utils';
import { useToast } from '@/shared/components/ui/useToast';
import { Button } from '@/shared/components/ui/Button';
import { SettingsRow, SettingsSection } from '../components/SettingsPrimitives';

export function StorageSection() {
  const toast = useToast();
  const { t } = useTranslation(['settings', 'common']);
  const [defaultSavePath, setDefaultSavePath] = useState('');
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheSize, setCacheSize] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const savedPath = await window.electronAPI?.storage?.get<string>('defaultSavePath');
      if (cancelled) return;
      if (savedPath) {
        setDefaultSavePath(savedPath);
        return;
      }
      const files = window.electronAPI?.files as { getDefaultSavePath?: () => Promise<string> } | undefined;
      const systemDefaultPath = await files?.getDefaultSavePath?.();
      if (systemDefaultPath && !cancelled) {
        setDefaultSavePath(systemDefaultPath);
        await window.electronAPI?.storage?.set('defaultSavePath', systemDefaultPath);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Calculate localStorage size on demand (expensive for large storage). */
  const calculateCacheSize = useCallback(() => {
    try {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) totalSize += key.length + value.length;
        }
      }
      setCacheSize(totalSize * 2);
    } catch {
      setCacheSize(0);
    }
  }, []);

  const handleSelectSavePath = useCallback(async () => {
    if (!window.electronAPI?.files?.selectDirectory) {
      toast.error(t('storage.desktopOnly'));
      return;
    }
    const path = await window.electronAPI.files.selectDirectory();
    if (path) {
      setDefaultSavePath(path);
      await window.electronAPI.storage?.set('defaultSavePath', path);
      toast.success(t('storage.saveLocationUpdated'));
    }
  }, [toast, t]);

  const handleClearCache = useCallback(async () => {
    setIsClearingCache(true);
    try {
      // Clear localStorage cache (excluding auth tokens)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !key.includes('auth') && !key.includes('token')) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      setCacheSize(0);
      toast.success(t('storage.cacheCleared'));
    } catch {
      toast.error(t('storage.cacheClearFailed'));
    } finally {
      setIsClearingCache(false);
    }
  }, [toast, t]);

  return (
    <SettingsSection icon={<Folder className="w-5 h-5" />} title={t('sections.storage')}>
      <SettingsRow label={t('storage.defaultSaveLocation')} description={defaultSavePath || t('storage.noFolderSelected')}>
        <Button variant="secondary" size="sm" onClick={handleSelectSavePath}>
          {t('common:buttons.choose')}
        </Button>
      </SettingsRow>
      <SettingsRow label={t('storage.cacheSize')} description={t('storage.cacheSizeDescription')}>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">
            {cacheSize !== null ? (
              formatFileSize(cacheSize)
            ) : (
              <button
                onClick={calculateCacheSize}
                className="text-zinc-500 hover:text-zinc-300 underline transition-colors"
              >
                {t('storage.calculate', 'Calculate')}
              </button>
            )}
          </span>
          <Button variant="ghost" size="sm" isLoading={isClearingCache} onClick={handleClearCache}>
            {t('common:buttons.clear')}
          </Button>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
