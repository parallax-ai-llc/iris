/**
 * MergeLayersDialog - Confirmation dialog before merging layers for AI processing
 */

import { memo } from 'react';
import { Layers, Loader2 } from 'lucide-react';

export interface MergeLayersDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export const MergeLayersDialog = memo(function MergeLayersDialog({
  isOpen,
  onConfirm,
  onCancel,
  isLoading,
}: MergeLayersDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isLoading ? undefined : onCancel}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800">
            <Layers className="w-5 h-5 text-zinc-300" />
          </div>
          <h3 className="text-sm font-semibold text-white">
            Merge Layers for AI Processing
          </h3>
        </div>

        {/* Body */}
        <div className="px-5 pb-4">
          <p className="text-xs text-zinc-400 leading-relaxed">
            This image has multiple layers. They will be merged into a single
            image for AI processing.
          </p>
          <p className="mt-2 text-xs text-zinc-300 font-medium">
            Your original layers will not be affected.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-medium text-zinc-400 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-neutral-900 bg-white rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Merging…
              </>
            ) : (
              'Merge & Continue'
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
