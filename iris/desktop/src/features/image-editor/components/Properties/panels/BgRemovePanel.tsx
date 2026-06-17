/**
 * BgRemovePanel - Background removal settings
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { Eraser, Info, Download } from 'lucide-react';
import { removeBackground, getAssetStatus } from '@/shared/api/image.api';
import { getCachedAssetUrl } from '@/shared/api/asset.api';
import { toast } from '@/shared/lib/toast';
import { useTokenCost, formatTokenCost } from '@/shared/hooks/useTokenCost';
import { useAIOperation } from '@/features/image-editor/hooks/useAIOperation';
import { MergeLayersDialog } from '@/features/image-editor/components/shared/MergeLayersDialog';
import { Coins } from 'lucide-react';

export const BgRemovePanel = memo(function BgRemovePanel() {
  const { sourceAsset, isProcessing, setProcessing, setProcessingProgress, openEditor, addLayerFromUrl, layers } = useImageEditorStore();
  const [error, setError] = useState<string | null>(null);
  const [refineEdges, setRefineEdges] = useState(true);
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);
  const { cost: tokenCost, isLoading: costLoading } = useTokenCost('EDIT_IMAGE_BG_REMOVE');
  const [keepShadows, setKeepShadows] = useState(false);
  const [addAsNewLayer, setAddAsNewLayer] = useState(true); // Default to adding as layer when layers exist
  const { prepareAssetForAI, mergeDialogProps } = useAIOperation();

  const handleRemoveBackground = useCallback(async () => {
    if (!sourceAsset?.id) {
      setError('No image selected');
      return;
    }

    setError(null);

    // If multiple layers, ask user to merge first
    const assetId = await prepareAssetForAI();
    if (!assetId) return; // User cancelled or merge failed

    setProcessing(true, 'Removing background...');

    try {
      // Start background removal process
      const result = await removeBackground(assetId);
      
      if (!result) {
        throw new Error('Failed to start background removal');
      }

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes max
      
      while (attempts < maxAttempts) {
        if (!isMountedRef.current) return;
        const status = await getAssetStatus(result.id);

        if (!status) {
          throw new Error('Failed to get processing status');
        }

        if (status.status === 'READY' || status.status === 'COMPLETED') {
          if (!isMountedRef.current) return;
          setProcessing(false);
          if (status.asset) {
            if (addAsNewLayer && layers.length > 0) {
              const imageUrl = status.asset.previewUrl || status.asset.publicUrl;
              if (imageUrl) {
                await addLayerFromUrl(imageUrl, 'BG Removed');
                toast.success('Background removed - added as new layer');
              }
            } else {
              openEditor(status.asset);
            }
          }
          return;
        }

        if (status.status === 'FAILED' || status.status === 'ERROR') {
          throw new Error(status.error || 'Background removal failed');
        }

        if (!isMountedRef.current) return;
        setProcessingProgress(Math.min(90, (attempts / maxAttempts) * 100));

        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      throw new Error('Processing timeout');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Background removal failed');
      setProcessing(false);
    }
  }, [sourceAsset?.id, setProcessing, setProcessingProgress, openEditor, addAsNewLayer, layers.length, addLayerFromUrl, prepareAssetForAI]);

  const handleDownloadPng = useCallback(async () => {
    if (!sourceAsset) {
      toast.error('No image to download');
      return;
    }

    try {
      // Get the cached image URL (with transparent background if processed)
      const url = await getCachedAssetUrl(sourceAsset, 'preview');
      if (!url) {
        toast.error('Failed to get image');
        return;
      }

      // Fetch the image
      const response = await fetch(url);
      const blob = await response.blob();

      // Check if Electron API is available
      if (window.electronAPI?.files) {
        const arrayBuffer = await blob.arrayBuffer();
        const savePath = await window.electronAPI.files.saveFile({
          defaultPath: `${sourceAsset.name.replace(/\.[^/.]+$/, '')}_nobg.png`,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        });

        if (savePath) {
          await window.electronAPI.files.writeFile(savePath, arrayBuffer);
          toast.success('Downloaded as PNG');
        }
      } else {
        // Browser fallback
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${sourceAsset.name.replace(/\.[^/.]+$/, '')}_nobg.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        toast.success('Downloaded as PNG');
      }
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to download image');
    }
  }, [sourceAsset]);

  return (
    <div className="p-4 space-y-6">
      <MergeLayersDialog {...mergeDialogProps} />
      <div className="p-3 bg-white/70/10 border border-white/30/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-white/70 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">
            AI will automatically detect and remove the background, leaving only the main subject.
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Options
        </h3>
        <label className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors">
          <input
            type="checkbox"
            checked={refineEdges}
            onChange={(e) => setRefineEdges(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-white/70 focus:ring-white/30"
          />
          <div>
            <span className="text-sm text-zinc-300">Refine edges</span>
            <p className="text-xs text-zinc-500">Smooth out jagged edges</p>
          </div>
        </label>
        <label className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors">
          <input
            type="checkbox"
            checked={keepShadows}
            onChange={(e) => setKeepShadows(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-white/70 focus:ring-white/30"
          />
          <div>
            <span className="text-sm text-zinc-300">Keep shadows</span>
            <p className="text-xs text-zinc-500">Preserve natural shadows</p>
          </div>
        </label>
        {layers.length > 0 && (
          <label className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors">
            <input
              type="checkbox"
              checked={addAsNewLayer}
              onChange={(e) => setAddAsNewLayer(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-white/70 focus:ring-white/30"
            />
            <div>
              <span className="text-sm text-zinc-300">Add as new layer</span>
              <p className="text-xs text-zinc-500">Keep existing layers, add result on top</p>
            </div>
          </label>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Token cost */}
      {tokenCost > 0 && !costLoading && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-zinc-400">
            <Coins className="w-3 h-3" />
            <span>Estimated cost</span>
          </div>
          <span className="text-zinc-300">{formatTokenCost(tokenCost)} credits</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-2">
        <button
          onClick={handleRemoveBackground}
          disabled={isProcessing || !sourceAsset?.id}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
            'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
            'text-sm font-medium transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Eraser className="w-4 h-4" />
          {isProcessing ? 'Processing...' : 'Remove Background'}
        </button>

        <button
          onClick={handleDownloadPng}
          disabled={isProcessing || !sourceAsset}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
            'text-sm transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Download className="w-4 h-4" />
          Download as PNG
        </button>
      </div>
    </div>
  );
});

export default BgRemovePanel;
