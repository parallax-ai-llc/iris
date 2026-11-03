'use client';

import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@editor/lib/convert/string';
import { useI18n } from '@editor/hooks/usei18n';
import { ConfirmDialogState } from '../types';

interface ConfirmDialogProps {
  dialog: ConfirmDialogState;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ dialog, onClose, onConfirm }: ConfirmDialogProps) {
  const { t } = useI18n();

  if (!dialog.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--we-backdrop,rgba(0,0,0,0.6))] backdrop-blur-sm">
      <div className="border border-iris-line-2 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden bg-iris-bg-solid">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-iris-line-2 bg-amber-500/10">
          <div className="p-2 rounded-full bg-amber-500/20">
            <AlertTriangle size={24} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-iris-text-1">{t('iris.editor.executionInProgress')}</h3>
            <p className="text-sm text-iris-text-3">{t('iris.editor.attentionRequired')}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg hover:bg-iris-surf-3 transition-colors"
          >
            <X size={18} className="text-iris-text-3" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-iris-text-2 text-sm leading-relaxed">
            {t('iris.editor.executionWarningContent')}{' '}
            <span className="text-amber-400 font-medium">
              {dialog.type === 'save' ? t('iris.editor.saveWarning') : t('iris.editor.runWarning')}
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-iris-line-2 bg-iris-surf-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg bg-iris-surf-3 hover:bg-iris-surf-hover text-iris-text-1 font-medium transition-colors text-sm"
          >
            {t('iris.actions.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors text-sm',
              dialog.type === 'save'
                ? 'bg-iris-fg text-iris-canvas hover:opacity-90'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            )}
          >
            {dialog.type === 'save' ? t('iris.editor.proceedSave') : t('iris.editor.proceedRun')}
          </button>
        </div>
      </div>
    </div>
  );
}
