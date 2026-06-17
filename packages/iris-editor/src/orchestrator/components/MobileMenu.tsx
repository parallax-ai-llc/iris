'use client';

import {
  AlertCircle,
  CheckCircle,
  XCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useI18n } from '@editor/hooks/usei18n';
import { ValidationResult } from '../types';

interface MobileMenuProps {
  isOpen: boolean;
  isValidating: boolean;
  validationResult: ValidationResult | null;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  onValidate: () => void;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
  onClose: () => void;
}

export function MobileMenu({
  isOpen,
  isValidating,
  validationResult,
  showLeftPanel,
  showRightPanel,
  onValidate,
  onToggleLeftPanel,
  onToggleRightPanel,
  onClose,
}: MobileMenuProps) {
  const { t } = useI18n();

  if (!isOpen) return null;

  return (
    <div className="md:hidden absolute top-14 right-2 z-30 border border-white/10 rounded-lg shadow-xl p-2 flex flex-col gap-1 bg-iris-bg-solid">
      <button
        onClick={() => { onValidate(); onClose(); }}
        disabled={isValidating}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-white/80 text-sm w-full"
      >
        {validationResult?.valid ? (
          <CheckCircle size={16} className="text-green-400" />
        ) : validationResult ? (
          <XCircle size={16} className="text-red-400" />
        ) : (
          <AlertCircle size={16} />
        )}
        {t('iris.editor.validate')}
      </button>
      <button
        onClick={() => { onToggleLeftPanel(); onClose(); }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-white/80 text-sm w-full"
      >
        {showLeftPanel ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        {showLeftPanel ? t('iris.editor.hideNodes') : t('iris.editor.showNodes')}
      </button>
      <button
        onClick={() => { onToggleRightPanel(); onClose(); }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-white/80 text-sm w-full"
      >
        {showRightPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        {showRightPanel ? t('iris.editor.hideConfig') : t('iris.editor.showConfig')}
      </button>
    </div>
  );
}
