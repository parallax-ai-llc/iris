'use client';

import { useI18n } from '@editor/hooks/usei18n';

export function LoadingState() {
  const { t } = useI18n();
  
  return (
    <div className="h-screen flex items-center justify-center bg-iris-canvas">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-iris-line-3 border-t-iris-text-1 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-iris-text-3">{t('iris.editor.loading')}</p>
      </div>
    </div>
  );
}
