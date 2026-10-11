/**
 * OutpaintPanel - AI outpainting (image expansion) settings
 */

import { memo, useCallback, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { ImagePlus, Info, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { outpaintImage } from '@/shared/api/image.api';
import { toast } from '@/shared/lib/toast';
import { useAIOperation } from '@/features/image-editor/hooks/useAIOperation';
import { MergeLayersDialog } from '@/features/image-editor/components/shared/MergeLayersDialog';
import { runAIEditJob } from '@/features/image-editor/lib/aiEditJob';
import { useMountedRef } from '@/features/image-editor/hooks/useMountedRef';

type ExpandDirection = 'top' | 'bottom' | 'left' | 'right' | 'all';

export const OutpaintPanel = memo(function OutpaintPanel() {
  const {
    sourceAsset,
    prompt,
    setPrompt,
    isProcessing,
  } = useImageEditorStore();

  const [expandDirection, setExpandDirection] = useState<ExpandDirection>('all');
  const [expandAmount, setExpandAmount] = useState(256);
  const [error, setError] = useState<string | null>(null);
  const { prepareAssetForAI, mergeDialogProps } = useAIOperation();
  const isMountedRef = useMountedRef();

  const handleOutpaint = useCallback(async () => {
    if (!sourceAsset?.id) {
      setError('No image selected');
      return;
    }

    setError(null);

    const assetId = await prepareAssetForAI();
    if (!assetId) return;

    try {
      // Bound to this tab: keeps running (and lands here) if the panel closes or the tab changes
      await runAIEditJob({
        message: 'Expanding image...',
        start: () => outpaintImage(assetId, expandDirection, expandAmount, prompt || undefined),
        apply: (asset, store) => store.getState().openEditor(asset),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Outpainting failed';
      if (isMountedRef.current) setError(message);
      else toast.error(`Outpaint: ${message}`);
    }
  }, [sourceAsset?.id, expandDirection, expandAmount, prompt, prepareAssetForAI, isMountedRef]);

  return (
    <div className="p-4 space-y-6">
      <MergeLayersDialog {...mergeDialogProps} />
      <div className="p-3 bg-white/70/10 border border-white/30/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-white/70 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">
            AI will expand your image beyond its original boundaries while maintaining context.
          </p>
        </div>
      </div>

      {/* Expand direction */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Expand Direction
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <div /> {/* Empty cell */}
          <button
            onClick={() => setExpandDirection('top')}
            className={cn(
              'flex items-center justify-center p-3 rounded-lg',
              'transition-all',
              expandDirection === 'top'
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <div /> {/* Empty cell */}
          
          <button
            onClick={() => setExpandDirection('left')}
            className={cn(
              'flex items-center justify-center p-3 rounded-lg',
              'transition-all',
              expandDirection === 'left'
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setExpandDirection('all')}
            className={cn(
              'flex items-center justify-center p-3 rounded-lg',
              'transition-all text-xs font-medium',
              expandDirection === 'all'
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            ALL
          </button>
          <button
            onClick={() => setExpandDirection('right')}
            className={cn(
              'flex items-center justify-center p-3 rounded-lg',
              'transition-all',
              expandDirection === 'right'
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          
          <div /> {/* Empty cell */}
          <button
            onClick={() => setExpandDirection('bottom')}
            className={cn(
              'flex items-center justify-center p-3 rounded-lg',
              'transition-all',
              expandDirection === 'bottom'
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            <ArrowDown className="w-5 h-5" />
          </button>
          <div /> {/* Empty cell */}
        </div>
      </div>

      {/* Expand amount */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Expand Amount
        </h3>
        <div className="flex gap-2">
          {[128, 256, 512, 1024].map((amount) => (
            <button
              key={amount}
              onClick={() => setExpandAmount(amount)}
              className={cn(
                'flex-1 py-2 rounded-lg text-xs font-medium transition-colors',
                expandAmount === amount
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              )}
            >
              {amount}px
            </button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Context (Optional)
        </h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what should appear in the expanded area..."
          className={cn(
            'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg',
            'text-sm text-white placeholder:text-zinc-500',
            'focus:outline-none focus:border-white/30',
            'resize-none h-20'
          )}
        />
        <p className="text-xs text-zinc-500">
          Leave empty to let AI infer from existing content
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleOutpaint}
        disabled={isProcessing || !sourceAsset?.id}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'text-sm font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <ImagePlus className="w-4 h-4" />
        {isProcessing ? 'Processing...' : 'Expand Image'}
      </button>
    </div>
  );
});

export default OutpaintPanel;
