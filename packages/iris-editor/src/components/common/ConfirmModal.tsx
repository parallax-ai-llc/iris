'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { X, AlertTriangle, Trash2, Copy, Loader2, Share2 } from 'lucide-react';
import { cn } from '@editor/lib/convert/string';

export type ConfirmModalType = 'delete' | 'clone' | 'warning' | 'error' | 'publish';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  type?: ConfirmModalType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  /** If true, only shows close button (for info/error display) */
  showOnlyClose?: boolean;
  /** Optional secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void | Promise<void>;
    isLoading?: boolean;
  };
}

const typeConfig = {
  delete: {
    icon: Trash2,
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-400',
    confirmBg: 'bg-red-500 hover:bg-red-600',
  },
  clone: {
    icon: Copy,
    iconBg: 'bg-slate-400/20',
    iconColor: 'text-slate-300',
    confirmBg: 'bg-slate-400 hover:bg-slate-500',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-yellow-500/20',
    iconColor: 'text-yellow-400',
    confirmBg: 'bg-yellow-500 hover:bg-yellow-600',
  },
  error: {
    icon: AlertTriangle,
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-400',
    confirmBg: 'bg-white/10 hover:bg-white/20',
  },
  publish: {
    icon: Share2,
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-400',
    confirmBg: 'bg-green-500 hover:bg-green-600',
  },
};

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  type = 'warning',
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
  showOnlyClose = false,
  secondaryAction,
}: ConfirmModalProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose, isLoading]);

  if (!isOpen || !isMounted) return null;

  const config = typeConfig[type];
  const Icon = config.icon;

  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative border border-white/10 rounded-xl w-full max-w-md p-6 shadow-2xl" style={{ backgroundColor: '#0f0f0f' }}>
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-white/40 hover:text-white/70 p-1 disabled:opacity-50"
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4', config.iconBg)}>
          <Icon size={24} className={config.iconColor} />
        </div>

        {/* Content */}
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
          <p className="text-white/60 text-sm whitespace-pre-wrap break-words max-h-60 overflow-y-auto">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {showOnlyClose ? (
            <>
              {secondaryAction && (
                <button
                  onClick={secondaryAction.onClick}
                  disabled={secondaryAction.isLoading}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {secondaryAction.isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    secondaryAction.label
                  )}
                </button>
              )}
              <button
                onClick={onClose}
                className={cn(
                  'w-full px-4 py-2 rounded-lg text-sm transition-colors',
                  'bg-white/10 text-white hover:bg-white/20'
                )}
              >
                {cancelLabel}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={isLoading}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg text-sm transition-colors',
                  'bg-white/10 text-white hover:bg-white/20',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {cancelLabel}
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors',
                  config.confirmBg,
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  confirmLabel
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
