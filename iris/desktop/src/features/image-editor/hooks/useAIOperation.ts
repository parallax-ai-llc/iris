/**
 * useAIOperation - Shared hook for AI panel operations.
 * Decides which asset an AI tool sends (lib/aiSource.ts):
 *  - several layers: asks to merge (MergeLayersDialog), then uploads the composite
 *  - one layer, unchanged since opening: the original asset
 *  - one layer, edited (or a local file / PSD): uploads the current composite
 */

import { useState, useCallback, useRef } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { resolveAIInputAssetId, uploadDocumentComposite } from '@/features/image-editor/lib/aiSource';
import { toast } from '@/shared/lib/toast';
import type { MergeLayersDialogProps } from '@/features/image-editor/components/shared/MergeLayersDialog';

export function useAIOperation() {
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isFlatteningInProgress, setIsFlatteningInProgress] = useState(false);

  // Promise bridge: stores resolve/reject for the pending prepareAssetForAI call
  const pendingRef = useRef<{
    resolve: (assetId: string | null) => void;
  } | null>(null);

  const confirmMerge = useCallback(async () => {
    if (!pendingRef.current) return;
    const { resolve } = pendingRef.current;

    setIsFlatteningInProgress(true);
    try {
      // Composite all visible layers (current document size) and upload it
      const assetId = await uploadDocumentComposite(useImageEditorStore.getState(), 'merged-layers');

      setIsMergeDialogOpen(false);
      pendingRef.current = null;
      toast.success('Layers merged — starting AI processing...');
      resolve(assetId);
    } catch {
      // On error, resolve with null so the caller can handle it
      toast.error('Failed to merge layers');
      setIsMergeDialogOpen(false);
      pendingRef.current = null;
      resolve(null);
    } finally {
      setIsFlatteningInProgress(false);
    }
  }, []);

  const cancelMerge = useCallback(() => {
    if (pendingRef.current) {
      pendingRef.current.resolve(null);
      pendingRef.current = null;
    }
    setIsMergeDialogOpen(false);
  }, []);

  /**
   * Get the asset ID to use for an AI operation.
   * If layers.length >= 2, shows confirmation dialog and flattens + uploads.
   * Returns null if user cancels or an error occurs.
   */
  const prepareAssetForAI = useCallback(async (): Promise<string | null> => {
    const state = useImageEditorStore.getState();
    const { sourceAsset, layers } = state;

    if (!sourceAsset?.id) {
      return null;
    }

    // Single layer or no layers → the original asset while unchanged,
    // otherwise the current document (uploaded)
    if (layers.length < 2) {
      try {
        return await resolveAIInputAssetId(state);
      } catch {
        toast.error('Failed to upload the current image');
        return null;
      }
    }

    // Multiple layers → show merge confirmation dialog
    return new Promise<string | null>((resolve) => {
      pendingRef.current = { resolve };
      setIsMergeDialogOpen(true);
    });
  }, []);

  const mergeDialogProps: MergeLayersDialogProps = {
    isOpen: isMergeDialogOpen,
    onConfirm: confirmMerge,
    onCancel: cancelMerge,
    isLoading: isFlatteningInProgress,
  };

  return { prepareAssetForAI, mergeDialogProps };
}
