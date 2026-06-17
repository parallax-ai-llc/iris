/**
 * ColorizePanel - AI colorization for black & white images
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { Droplets, Info, Palette } from 'lucide-react';
import { colorizeImage, getAssetStatus } from '@/shared/api/image.api';
import { toast } from '@/shared/lib/toast';
import { useTokenCost, formatTokenCost } from '@/shared/hooks/useTokenCost';
import { useAIOperation } from '@/features/image-editor/hooks/useAIOperation';
import { MergeLayersDialog } from '@/features/image-editor/components/shared/MergeLayersDialog';
import { Coins } from 'lucide-react';

type ColorStyle = 'natural' | 'vivid' | 'cinematic' | 'vintage';

const COLOR_STYLES: Array<{ id: ColorStyle; label: string; description: string }> = [
  { id: 'natural', label: 'Natural', description: 'Realistic, true-to-life colors' },
  { id: 'vivid', label: 'Vivid', description: 'Bright, saturated colors' },
  { id: 'cinematic', label: 'Cinematic', description: 'Film-like color grading' },
  { id: 'vintage', label: 'Vintage', description: 'Retro, nostalgic tones' },
];

export const ColorizePanel = memo(function ColorizePanel() {
  const { sourceAsset, isProcessing, setProcessing, setProcessingProgress, openEditor, addLayerFromUrl, layers } = useImageEditorStore();

  const [style, setStyle] = useState<ColorStyle>('natural');
  const [saturation, setSaturation] = useState(100);
  const [addAsNewLayer, setAddAsNewLayer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { cost: tokenCost, isLoading: costLoading } = useTokenCost('EDIT_IMAGE_COLORIZE');
  const { prepareAssetForAI, mergeDialogProps } = useAIOperation();
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const handleColorize = useCallback(async () => {
    if (!sourceAsset?.id) {
      setError('No image selected');
      return;
    }

    setError(null);

    const assetId = await prepareAssetForAI();
    if (!assetId) return;

    setProcessing(true, 'Colorizing image...');

    try {
      // Start colorization process
      const result = await colorizeImage(assetId, style);
      
      if (!result) {
        throw new Error('Failed to start colorization');
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
                await addLayerFromUrl(imageUrl, 'Colorized');
                toast.success('Image colorized - added as new layer');
              }
            } else {
              openEditor(status.asset);
            }
          }
          return;
        }

        if (status.status === 'FAILED' || status.status === 'ERROR') {
          throw new Error(status.error || 'Colorization failed');
        }

        if (!isMountedRef.current) return;
        setProcessingProgress(Math.min(90, (attempts / maxAttempts) * 100));

        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      throw new Error('Processing timeout');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Colorization failed');
      setProcessing(false);
    }
  }, [sourceAsset?.id, style, setProcessing, setProcessingProgress, openEditor, addAsNewLayer, layers.length, addLayerFromUrl, prepareAssetForAI]);

  return (
    <div className="p-4 space-y-6">
      <MergeLayersDialog {...mergeDialogProps} />
      <div className="p-3 bg-white/70/10 border border-white/30/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-white/70 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">
            AI will add realistic colors to your black & white or grayscale image.
          </p>
        </div>
      </div>

      {/* Style selection */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Color Style
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {COLOR_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 p-3 rounded-lg',
                'transition-all text-center',
                style === s.id
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <span className="text-sm font-medium">{s.label}</span>
              <span className={cn(
                'text-[10px]',
                style === s.id ? 'text-white' : 'text-zinc-500'
              )}>
                {s.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Saturation adjustment */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Color Intensity
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Saturation</span>
            <span className="text-xs text-zinc-500">{saturation}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={150}
            value={saturation}
            onChange={(e) => setSaturation(Number(e.target.value))}
            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-zinc-600">
            <span>Subtle</span>
            <span>Normal</span>
            <span>Vibrant</span>
          </div>
        </div>
      </div>

      {/* Preview hint */}
      <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg">
        <Palette className="w-5 h-5 text-zinc-500" />
        <div>
          <p className="text-xs text-zinc-400">
            Works best on black & white or sepia photographs
          </p>
        </div>
      </div>

      {/* Layer output option */}
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

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Colorize button */}
      <button
        onClick={handleColorize}
        disabled={isProcessing || !sourceAsset?.id}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'text-sm font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Droplets className="w-4 h-4" />
        {isProcessing ? 'Processing...' : 'Colorize Image'}
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

export default ColorizePanel;
