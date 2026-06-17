import { memo, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExtensionStore } from '@/features/extensions/stores/extension.store';

export const MyExtensionsSection = memo(function MyExtensionsSection() {
  const { myExtensions, isMyExtensionsLoading, fetchMyExtensions, deleteMyExtension } =
    useExtensionStore();
  const { t } = useTranslation('extensions');

  useEffect(() => {
    fetchMyExtensions();
  }, [fetchMyExtensions]);

  if (isMyExtensionsLoading) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        {t('my.loading')}
      </div>
    );
  }

  if (myExtensions.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-zinc-500">{t('my.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {myExtensions.map((ext) => (
        <div
          key={ext.id}
          className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50"
        >
          <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center text-lg flex-shrink-0">
            {ext.icon || '🧩'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{ext.name}</p>
            <p className="text-xs text-zinc-500 truncate">
              {ext.shortDescription || ext.type}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">
              {ext.downloadCount} {t('card.installs')}
            </span>
            <button
              onClick={() => deleteMyExtension(ext.id)}
              className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
              title={t('my.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});
