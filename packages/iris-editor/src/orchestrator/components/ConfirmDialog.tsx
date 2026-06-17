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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="border border-white/10 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden bg-iris-bg-solid">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10 bg-amber-500/10">
          <div className="p-2 rounded-full bg-amber-500/20">
            <AlertTriangle size={24} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{t('iris.editor.executionInProgress')}</h3>
            <p className="text-sm text-white/60">{t('iris.editor.attentionRequired')}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={18} className="text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-white/80 text-sm leading-relaxed">
            {t('iris.editor.executionWarningContent')}{' '}
            <span className="text-amber-400 font-medium">
              {dialog.type === 'save' ? t('iris.editor.saveWarning') : t('iris.editor.runWarning')}
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-white/10 bg-white/5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors text-sm"
          >
            {t('iris.actions.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors text-sm',
              dialog.type === 'save'
                ? 'bg-purple-500 hover:bg-purple-600 text-white'
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
