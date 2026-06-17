/**
 * ErrorModal - Error display modal component
 * Based on web's ConfirmModal error type styling
 */

import { memo, useEffect, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  closeLabel?: string;
}

export const ErrorModal = memo(function ErrorModal({
  isOpen,
  onClose,
  title,
  message,
  closeLabel = 'Close',
}: ErrorModalProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            'relative w-full max-w-md pointer-events-auto',
            'border border-white/10 rounded-xl p-6 shadow-2xl'
          )}
          style={{ backgroundColor: '#0f0f0f' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white/70 p-1 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* Icon */}
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/20">
            <AlertTriangle size={24} className="text-red-400" />
          </div>

          {/* Content */}
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-white/60 text-sm whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
              {message}
            </p>
          </div>

          {/* Close Action */}
          <button
            onClick={onClose}
            className={cn(
              'w-full px-4 py-2 rounded-lg text-sm transition-colors',
              'bg-white/10 text-white hover:bg-white/20'
            )}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </>
  );
});

export default ErrorModal;
