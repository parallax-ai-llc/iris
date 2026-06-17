'use client';

import { AlertCircle } from 'lucide-react';
import { useI18n } from '@editor/hooks/usei18n';
import { useSeams } from '@editor/seams';

export function NotFoundState() {
  const { navigate } = useSeams();
  const { t } = useI18n();

  return (
    <div className="h-screen flex items-center justify-center bg-iris-bg">
      <div className="text-center">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">{t('iris.editor.notFound')}</h2>
        <button
          onClick={() => navigate?.('/')}
          className="text-purple-400 hover:text-purple-300"
        >
          {t('iris.editor.goBack')}
        </button>
      </div>
    </div>
  );
}
