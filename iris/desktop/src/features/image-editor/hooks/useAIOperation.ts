/**
 * useAIOperation - Shared hook for AI panel operations.
 * Handles layer merging confirmation and flattened asset upload when multiple layers exist.
 */

import { useState, useCallback, useRef } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { uploadImage } from '@/shared/api/image.api';
import { flattenLayersToBlob } from '@/features/image-editor/canvas/layerCompositor';
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
      const { layers, sourceAsset, canvasWidth: storeW, canvasHeight: storeH } =
        useImageEditorStore.getState();

      // Use stored canvas dimensions; fall back to layer bounds if unavailable
      const canvasWidth = storeW > 0 ? storeW : Math.max(...layers.map((l) => l.x + l.width), 1);
      const canvasHeight = storeH > 0 ? storeH : Math.max(...layers.map((l) => l.y + l.height), 1);

      // Composite all visible layers into a single image
      const blob = await flattenLayersToBlob(layers, canvasWidth, canvasHeight);
      const file = new File(
        [blob],
        `merged-layers-${Date.now()}.png`,
        { type: 'image/png' },
      );

      // Upload the merged image as a temporary asset
      const storagePath = sourceAsset?.storagePath || 'images';
      const uploaded = await uploadImage(file, {
        storagePath,
        name: 'merged-layers',
      });

      if (!uploaded?.id) {
        throw new Error('Failed to upload merged image');
      }

      setIsMergeDialogOpen(false);
      pendingRef.current = null;
      toast.success('Layers merged — starting AI processing...');
      resolve(uploaded.id);
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
  const prepareAssetForAI = useCallback((): Promise<string | null> => {
    const { sourceAsset, layers } = useImageEditorStore.getState();

    if (!sourceAsset?.id) {
      return Promise.resolve(null);
    }

    // Single layer or no layers → use the source asset directly
    if (layers.length < 2) {
      return Promise.resolve(sourceAsset.id);
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
