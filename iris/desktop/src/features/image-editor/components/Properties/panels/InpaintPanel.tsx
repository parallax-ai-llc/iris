/**
 * InpaintPanel - AI inpainting settings
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { Wand2, Info, Trash2 } from 'lucide-react';
import { inpaintImage, getAssetStatus } from '@/shared/api/image.api';
import { useAIOperation } from '@/features/image-editor/hooks/useAIOperation';
import { MergeLayersDialog } from '@/features/image-editor/components/shared/MergeLayersDialog';

export const InpaintPanel = memo(function InpaintPanel() {
  const {
    sourceAsset,
    prompt,
    negativePrompt,
    setPrompt,
    setNegativePrompt,
    maskDataUrl,
    setMaskDataUrl,
    isProcessing,
    setProcessing,
    setProcessingProgress,
    openEditor,
    brushSettings,
    setBrushSettings,
  } = useImageEditorStore();

  const [error, setError] = useState<string | null>(null);
  const { prepareAssetForAI, mergeDialogProps } = useAIOperation();
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const handleInpaint = useCallback(async () => {
    if (!maskDataUrl) {
      setError('Please paint a mask on the image first');
      return;
    }
    if (!sourceAsset?.id) {
      setError('No image selected');
      return;
    }
    if (!prompt.trim()) {
      setError('Please describe what should appear in the masked area');
      return;
    }

    setError(null);

    const assetId = await prepareAssetForAI();
    if (!assetId) return;

    setProcessing(true, 'AI inpainting...');

    try {
      // Start inpaint process
      const result = await inpaintImage(
        assetId,
        prompt,
        maskDataUrl,
        negativePrompt || undefined
      );

      if (!result) {
        throw new Error('Failed to start inpainting');
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
          setMaskDataUrl(null);
          if (status.asset) {
            openEditor(status.asset);
          }
          return;
        }

        if (status.status === 'FAILED' || status.status === 'ERROR') {
          throw new Error(status.error || 'Inpainting failed');
        }

        if (!isMountedRef.current) return;
        setProcessingProgress(Math.min(90, (attempts / maxAttempts) * 100));

        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      throw new Error('Processing timeout');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inpainting failed');
      setProcessing(false);
    }
  }, [sourceAsset?.id, maskDataUrl, prompt, negativePrompt, setProcessing, setProcessingProgress, openEditor, setMaskDataUrl, prepareAssetForAI]);

  const handleClearMask = useCallback(() => {
    setMaskDataUrl(null);
  }, [setMaskDataUrl]);

  return (
    <div className="p-4 space-y-6">
      <MergeLayersDialog {...mergeDialogProps} />
      <div className="p-3 bg-white/70/10 border border-white/30/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-white/70 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">
            Paint over the area you want to modify, then describe what should appear there.
          </p>
        </div>
      </div>

      {/* Brush settings */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Brush
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Size</span>
            <span className="text-xs text-zinc-500">{brushSettings.size}px</span>
          </div>
          <input
            type="range"
            min={5}
            max={200}
            value={brushSettings.size}
            onChange={(e) => setBrushSettings({ size: Number(e.target.value) })}
            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>

        {maskDataUrl && (
          <button
            onClick={handleClearMask}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
              'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
              'text-xs transition-colors'
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Mask
          </button>
        )}
      </div>

      {/* Prompt */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          What to Generate
        </h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what should appear in the masked area..."
          className={cn(
            'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg',
            'text-sm text-white placeholder:text-zinc-500',
            'focus:outline-none focus:border-white/30',
            'resize-none h-24'
          )}
        />
      </div>

      {/* Negative prompt */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Negative Prompt (Optional)
        </h3>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder="What to avoid..."
          className={cn(
            'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg',
            'text-sm text-white placeholder:text-zinc-500',
            'focus:outline-none focus:border-white/30',
            'resize-none h-16'
          )}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleInpaint}
        disabled={isProcessing || !maskDataUrl || !prompt.trim() || !sourceAsset?.id}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'text-sm font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Wand2 className="w-4 h-4" />
        {isProcessing ? 'Processing...' : 'Generate'}
      </button>

      {!maskDataUrl && (
        <p className="text-xs text-zinc-500 text-center">
          Paint on the canvas to create a mask first
        </p>
      )}
    </div>
  );
});

export default InpaintPanel;
