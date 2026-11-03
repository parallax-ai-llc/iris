'use client';

import { AlertCircle, Lock, LogIn, RotateCw } from 'lucide-react';
import { useI18n } from '@editor/hooks/usei18n';
import { useSeams } from '@editor/seams';
import type { WorkflowLoadErrorKind } from '@editor/lib/apis/iris-api-client';

interface LoadErrorStateProps {
  workflowId: string;
  /** Not `not_found`: that one keeps its own `NotFoundState`. */
  kind: Exclude<WorkflowLoadErrorKind, 'not_found'>;
  onRetry: () => void;
}

/**
 * Shown when the workflow could not be loaded for a reason other than "it does
 * not exist": no session (sign in), no access (forbidden), or a failure that
 * may pass on retry (server/network error).
 */
export function LoadErrorState({ workflowId, kind, onRetry }: LoadErrorStateProps) {
  const { navigate, onUnauthorized } = useSeams();
  const { t } = useI18n();

  const title =
    kind === 'unauthorized'
      ? t('iris.editor.unauthorized')
      : kind === 'forbidden'
        ? t('iris.editor.forbidden')
        : t('iris.editor.loadFailed');
  const description =
    kind === 'unauthorized'
      ? t('iris.editor.unauthorizedDescription')
      : kind === 'forbidden'
        ? t('iris.editor.forbiddenDescription')
        : t('iris.editor.loadFailedDescription');
  const Icon = kind === 'error' ? AlertCircle : Lock;

  return (
    <div className="h-screen flex items-center justify-center bg-iris-canvas">
      <div className="text-center max-w-sm px-6" role="alert">
        <Icon size={48} className="text-red-400 mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-iris-text-1 mb-2">{title}</h2>
        {description && <p className="text-iris-text-3 text-sm mb-6">{description}</p>}
        <div className="flex items-center justify-center gap-4">
          {kind === 'error' && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-full bg-iris-fg px-4 py-2 text-sm font-medium text-iris-canvas hover:opacity-90"
            >
              <RotateCw size={16} aria-hidden="true" />
              {t('iris.editor.retry')}
            </button>
          )}
          {kind === 'unauthorized' && onUnauthorized && (
            <button
              type="button"
              onClick={() => onUnauthorized({ workflowId })}
              className="inline-flex items-center gap-2 rounded-full bg-iris-fg px-4 py-2 text-sm font-medium text-iris-canvas hover:opacity-90"
            >
              <LogIn size={16} aria-hidden="true" />
              {t('iris.editor.signIn')}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate?.('/')}
            className="text-iris-text-2 hover:text-iris-text-1 underline underline-offset-2 text-sm"
          >
            {t('iris.editor.goBack')}
          </button>
        </div>
      </div>
    </div>
  );
}
