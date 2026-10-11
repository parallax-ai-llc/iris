/**
 * UpscalePanel - AI upscaling settings
 */

import { memo, useCallback, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { Info } from 'lucide-react';
import { upscaleImage } from '@/shared/api/image.api';
import { toast } from '@/shared/lib/toast';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { useImageEditTokenCost } from '@/shared/hooks/useImageEditTokenCost';
import { useAIOperation } from '@/features/image-editor/hooks/useAIOperation';
import { MergeLayersDialog } from '@/features/image-editor/components/shared/MergeLayersDialog';
import { runAIEditJob, addResultLayerOrOpen } from '@/features/image-editor/lib/aiEditJob';
import { useMountedRef } from '@/features/image-editor/hooks/useMountedRef';
import { Coins } from 'lucide-react';

export const UpscalePanel = memo(function UpscalePanel() {
  const { sourceAsset, upscaleSettings, setUpscaleSettings, isProcessing, layers } = useImageEditorStore();
  const [error, setError] = useState<string | null>(null);
  const [addAsNewLayer, setAddAsNewLayer] = useState(true);
  const isMountedRef = useMountedRef();
  // 2x → Recraft crisp, 4x → Recraft creative (image.api upscaleImage); priced by that model.
  const { cost: tokenCost, isLoading: costLoading } = useImageEditTokenCost('upscale', {
    upscaleType: upscaleSettings.scale === 4 ? 'creative' : 'crisp',
  });
  const { prepareAssetForAI, mergeDialogProps } = useAIOperation();

  const handleUpscale = useCallback(async () => {
    if (!sourceAsset?.id) {
      setError('No image selected');
      return;
    }

    setError(null);

    const assetId = await prepareAssetForAI();
    if (!assetId) return;

    const scale = upscaleSettings.scale;

    try {
      // Bound to this tab: keeps running (and lands here) if the panel closes or the tab changes
      await runAIEditJob({
        message: `Upscaling image ${scale}×...`,
        start: () => upscaleImage(assetId, scale),
        apply: async (asset, store) => {
          const placed = await addResultLayerOrOpen(asset, store, { addAsLayer: addAsNewLayer, layerName: `Upscaled ${scale}×` });
          if (placed === 'layer') toast.success(`Upscaled ${scale}× - added as new layer`);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upscaling failed';
      if (isMountedRef.current) setError(message);
      else toast.error(`Upscale: ${message}`);
    }
  }, [sourceAsset?.id, upscaleSettings.scale, addAsNewLayer, prepareAssetForAI, isMountedRef]);

  return (
    <div className="p-4 space-y-6">
      <MergeLayersDialog {...mergeDialogProps} />
      <div className="p-3 bg-white/70/10 border border-white/30/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-white/70 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">
            AI Upscale enhances your image resolution while preserving details.
          </p>
        </div>
      </div>

      {/* Scale selection */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Scale Factor
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setUpscaleSettings({ scale: 2 })}
            className={cn(
              'flex flex-col items-center justify-center gap-1 p-4 rounded-lg',
              'transition-all',
              upscaleSettings.scale === 2
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            <span className="text-2xl font-bold">2×</span>
            <span className="text-xs">Double size</span>
          </button>
          <button
            onClick={() => setUpscaleSettings({ scale: 4 })}
            className={cn(
              'flex flex-col items-center justify-center gap-1 p-4 rounded-lg',
              'transition-all',
              upscaleSettings.scale === 4
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            <span className="text-2xl font-bold">4×</span>
            <span className="text-xs">Quadruple size</span>
          </button>
        </div>
      </div>

      {/* Upscale type */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Upscale Type
        </h3>
        <div className="space-y-2">
          <button
            onClick={() => setUpscaleSettings({ type: 'crisp' })}
            className={cn(
              'w-full flex items-start gap-3 p-3 rounded-lg text-left',
              'transition-all',
              upscaleSettings.type === 'crisp'
                ? 'bg-white/10 border border-white/20'
                : 'bg-zinc-800 border border-transparent hover:bg-zinc-700'
            )}
          >
            <div className={cn(
              'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
              upscaleSettings.type === 'crisp' ? 'border-white/30' : 'border-zinc-600'
            )}>
              {upscaleSettings.type === 'crisp' && (
                <div className="w-2 h-2 rounded-full bg-white/70" />
              )}
            </div>
            <div>
              <span className={cn(
                'text-sm font-medium',
                upscaleSettings.type === 'crisp' ? 'text-white' : 'text-zinc-300'
              )}>
                Crisp
              </span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Sharp edges, ideal for text and graphics
              </p>
            </div>
          </button>
          <button
            onClick={() => setUpscaleSettings({ type: 'creative' })}
            className={cn(
              'w-full flex items-start gap-3 p-3 rounded-lg text-left',
              'transition-all',
              upscaleSettings.type === 'creative'
                ? 'bg-white/10 border border-white/20'
                : 'bg-zinc-800 border border-transparent hover:bg-zinc-700'
            )}
          >
            <div className={cn(
              'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
              upscaleSettings.type === 'creative' ? 'border-white/30' : 'border-zinc-600'
            )}>
              {upscaleSettings.type === 'creative' && (
                <div className="w-2 h-2 rounded-full bg-white/70" />
              )}
            </div>
            <div>
              <span className={cn(
                'text-sm font-medium',
                upscaleSettings.type === 'creative' ? 'text-white' : 'text-zinc-300'
              )}>
                Creative
              </span>
              <p className="text-xs text-zinc-500 mt-0.5">
                AI-enhanced details, ideal for photos
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Layer output option */}
      {layers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            Output
          </h3>
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
        </div>
      )}

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

      {/* Upscale button */}
      <button
        onClick={handleUpscale}
        disabled={isProcessing || !sourceAsset?.id}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'text-sm font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isProcessing ? 'Processing...' : `Upscale ${upscaleSettings.scale}×`}
      </button>
    </div>
  );
});

export default UpscalePanel;
