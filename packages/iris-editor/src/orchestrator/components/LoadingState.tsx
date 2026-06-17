'use client';

import { useI18n } from '@editor/hooks/usei18n';

export function LoadingState() {
  const { t } = useI18n();
  
  return (
    <div className="h-screen flex items-center justify-center bg-iris-bg">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60">{t('iris.editor.loading')}</p>
      </div>
    </div>
  );
}
