/**
 * FaceRestorePanel - AI face restoration settings
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { Smile, Info } from 'lucide-react';
import { faceRestoreImage, getAssetStatus } from '@/shared/api/image.api';
import { toast } from '@/shared/lib/toast';
import { useTokenCost, formatTokenCost } from '@/shared/hooks/useTokenCost';
import { useAIOperation } from '@/features/image-editor/hooks/useAIOperation';
import { MergeLayersDialog } from '@/features/image-editor/components/shared/MergeLayersDialog';
import { Coins } from 'lucide-react';

type RestoreModel = 'gfpgan' | 'codeformer';

export const FaceRestorePanel = memo(function FaceRestorePanel() {
  const { sourceAsset, isProcessing, setProcessing, setProcessingProgress, openEditor, addLayerFromUrl, layers } = useImageEditorStore();

  const [model, setModel] = useState<RestoreModel>('codeformer');
  const [fidelity, setFidelity] = useState(0.5);
  const [enhanceBackground, setEnhanceBackground] = useState(true);
  const [addAsNewLayer, setAddAsNewLayer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { cost: tokenCost, isLoading: costLoading } = useTokenCost('EDIT_IMAGE_FACE_RESTORE');
  const { prepareAssetForAI, mergeDialogProps } = useAIOperation();
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const handleRestore = useCallback(async () => {
    if (!sourceAsset?.id) {
      setError('No image selected');
      return;
    }

    setError(null);

    const assetId = await prepareAssetForAI();
    if (!assetId) return;

    setProcessing(true, 'Restoring faces...');

    try {
      // Start face restore process
      const result = await faceRestoreImage(assetId, model, fidelity);
      
      if (!result) {
        throw new Error('Failed to start face restoration');
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
                await addLayerFromUrl(imageUrl, 'Face Restored');
                toast.success('Face restored - added as new layer');
              }
            } else {
              openEditor(status.asset);
            }
          }
          return;
        }

        if (status.status === 'FAILED' || status.status === 'ERROR') {
          throw new Error(status.error || 'Face restoration failed');
        }

        if (!isMountedRef.current) return;
        setProcessingProgress(Math.min(90, (attempts / maxAttempts) * 100));

        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      throw new Error('Processing timeout');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Face restoration failed');
      setProcessing(false);
    }
  }, [sourceAsset?.id, model, fidelity, setProcessing, setProcessingProgress, openEditor, addAsNewLayer, layers.length, addLayerFromUrl, prepareAssetForAI]);

  return (
    <div className="p-4 space-y-6">
      <MergeLayersDialog {...mergeDialogProps} />
      <div className="p-3 bg-white/70/10 border border-white/30/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-white/70 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">
            AI Face Restore enhances and repairs faces in your image, improving clarity and detail.
          </p>
        </div>
      </div>

      {/* Model selection */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Restoration Model
        </h3>
        <div className="space-y-2">
          <button
            onClick={() => setModel('codeformer')}
            className={cn(
              'w-full flex items-start gap-3 p-3 rounded-lg text-left',
              'transition-all',
              model === 'codeformer'
                ? 'bg-white/10 border border-white/20'
                : 'bg-zinc-800 border border-transparent hover:bg-zinc-700'
            )}
          >
            <div className={cn(
              'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
              model === 'codeformer' ? 'border-white/30' : 'border-zinc-600'
            )}>
              {model === 'codeformer' && (
                <div className="w-2 h-2 rounded-full bg-white/70" />
              )}
            </div>
            <div>
              <span className={cn(
                'text-sm font-medium',
                model === 'codeformer' ? 'text-white' : 'text-zinc-300'
              )}>
                CodeFormer
              </span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Better quality, preserves identity
              </p>
            </div>
          </button>
          <button
            onClick={() => setModel('gfpgan')}
            className={cn(
              'w-full flex items-start gap-3 p-3 rounded-lg text-left',
              'transition-all',
              model === 'gfpgan'
                ? 'bg-white/10 border border-white/20'
                : 'bg-zinc-800 border border-transparent hover:bg-zinc-700'
            )}
          >
            <div className={cn(
              'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
              model === 'gfpgan' ? 'border-white/30' : 'border-zinc-600'
            )}>
              {model === 'gfpgan' && (
                <div className="w-2 h-2 rounded-full bg-white/70" />
              )}
            </div>
            <div>
              <span className={cn(
                'text-sm font-medium',
                model === 'gfpgan' ? 'text-white' : 'text-zinc-300'
              )}>
                GFPGAN
              </span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Faster processing, good for general use
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Fidelity slider (CodeFormer only) */}
      {model === 'codeformer' && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            Fidelity Weight
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Quality ←→ Fidelity</span>
              <span className="text-xs text-zinc-500">{fidelity.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={fidelity}
              onChange={(e) => setFidelity(Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white
                [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <p className="text-xs text-zinc-500">
              Lower = more enhancement, Higher = preserve original
            </p>
          </div>
        </div>
      )}

      {/* Options */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Options
        </h3>
        <label className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors">
          <input
            type="checkbox"
            checked={enhanceBackground}
            onChange={(e) => setEnhanceBackground(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-white/70 focus:ring-white/30"
          />
          <div>
            <span className="text-sm text-zinc-300">Enhance background</span>
            <p className="text-xs text-zinc-500">Also improve non-face areas</p>
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

      {/* Restore button */}
      <button
        onClick={handleRestore}
        disabled={isProcessing || !sourceAsset?.id}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'text-sm font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Smile className="w-4 h-4" />
        {isProcessing ? 'Processing...' : 'Restore Faces'}
        {tokenCost > 0 && !costLoading && (
          <span className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-neutral-900/20 text-xs">
            <Coins className="w-3 h-3" />
            {formatTokenCost(tokenCost)}
          </span>
        )}
      </button>
    </div>
  );
});

export default FaceRestorePanel;
