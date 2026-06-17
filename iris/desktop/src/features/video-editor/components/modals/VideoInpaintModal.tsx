/**
 * VideoInpaintModal - Modal for video inpainting with mask drawing
 */

import { memo, useState, useEffect, useMemo } from 'react';
import {
  Paintbrush,
  Video,
  MousePointer2,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  AlertCircle,
  Coins,
  Loader2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Modal } from '@/shared/components/ui/Modal';
import { useTokenCostsStore } from '@/shared/stores/token-costs';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { inpaintVideo, pollVideoStatus } from '@/shared/api/video.api';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { toast } from '@/shared/lib/toast';

export interface VideoInpaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  thumbnailUrl?: string;
  duration?: number;
}

type DrawTool = 'select' | 'brush' | 'eraser';

export const VideoInpaintModal = memo(function VideoInpaintModal({
  isOpen,
  onClose,
  videoId,
  thumbnailUrl,
  duration = 0,
}: VideoInpaintModalProps) {
  const [activeTool, setActiveTool] = useState<DrawTool>('brush');
  const [brushSize, setBrushSize] = useState(50);
  const [prompt, setPrompt] = useState('');
  const [hasMask, setHasMask] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);

  const { costs, fetchTokenCosts, getModelTokenCost } = useTokenCostsStore();

  useEffect(() => {
    fetchTokenCosts();
  }, [fetchTokenCosts]);

  const tokenCost = useMemo(() => {
    // Use model ID from AGENT_MODELS for dynamic pricing with actual duration
    const baseCost = getModelTokenCost('veo2-video-inpaint', 'EDIT_VIDEO_INPAINT', {
      durationSeconds: duration || 5,
    });
    if (baseCost === 0) {
      return costs['EDIT_VIDEO_INPAINT'] ?? 0;
    }
    return baseCost;
  }, [getModelTokenCost, costs, duration]);

  const handleGenerate = async () => {
    if (!videoId || !hasMask || !prompt.trim() || !isMinDurationMet || isProcessing) return;

    // Use the drawn mask data URL, or create a placeholder white mask for demo mode
    const finalMaskDataUrl = maskDataUrl || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    setIsProcessing(true);
    try {
      const asset = await inpaintVideo(videoId, prompt.trim(), finalMaskDataUrl);

      if (!asset) {
        throw new Error('Failed to start video inpainting');
      }

      // Poll until processing completes
      let finalAsset = asset;
      if (asset.processingStatus === 'PROCESSING') {
        const polled = await pollVideoStatus(asset.id);
        if (!polled) {
          throw new Error('Failed to get inpainted video');
        }
        finalAsset = polled;
      }

      // Add result to media pool
      const { addMedia } = useVideoProjectStore.getState();
      const metadata = (finalAsset.metadata || {}) as Record<string, unknown>;
      await addMedia({
        mediaType: 'video',
        name: finalAsset.name,
        externalId: finalAsset.id,
        fileUrl: finalAsset.previewUrl || undefined,
        thumbnailUrl: finalAsset.thumbnailUrl || null,
        duration: (metadata.duration as number) || null,
        width: (metadata.width as number) || null,
        height: (metadata.height as number) || null,
        fileSize: finalAsset.sizeBytes || null,
      });

      toast.success('Video inpainting completed successfully');
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Video inpainting failed'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const isMinDurationMet = duration >= 8;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Inpaint Video"
      description="Draw a mask to remove or replace objects"
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          {tokenCost > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Coins size={12} />
              <span>{formatTokenCost(tokenCost)} credits</span>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!hasMask || !prompt.trim() || !isMinDurationMet || isProcessing}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
                hasMask && prompt.trim() && isMinDurationMet && !isProcessing
                  ? 'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white'
                  : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              )}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Paintbrush className="w-4 h-4" />
              )}
              {isProcessing ? 'Processing...' : 'Generate'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Duration Warning */}
        {!isMinDurationMet && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-200">
              Video must be at least 8 seconds long for inpainting. Current: {duration.toFixed(1)}s
            </p>
          </div>
        )}

        <div className="grid grid-cols-[1fr,300px] gap-4">
          {/* Canvas Area */}
          <div className="space-y-3">
            {/* Frame Preview with Mask Canvas */}
            <div className="relative aspect-video bg-zinc-800 rounded-lg overflow-hidden">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt="First frame"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="w-12 h-12 text-zinc-600" />
                </div>
              )}
              {/* Mask Canvas Placeholder */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Canvas will be rendered here */}
              </div>
              {/* Duration Badge */}
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-xs text-white">
                {duration.toFixed(1)}s
              </div>
            </div>

            {/* Drawing Tools */}
            <div className="flex items-center gap-4 p-3 bg-zinc-800/50 rounded-lg">
              {/* Tool Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTool('select')}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    activeTool === 'select'
                      ? 'bg-amber-500 text-black'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  )}
                  title="Select (Rectangle)"
                >
                  <MousePointer2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveTool('brush')}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    activeTool === 'brush'
                      ? 'bg-amber-500 text-black'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  )}
                  title="Brush"
                >
                  <Paintbrush className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveTool('eraser')}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    activeTool === 'eraser'
                      ? 'bg-amber-500 text-black'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  )}
                  title="Eraser"
                >
                  <Eraser className="w-4 h-4" />
                </button>
              </div>

              {/* Brush Size Slider */}
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-zinc-500 w-8">5</span>
                <input
                  type="range"
                  min={5}
                  max={200}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                />
                <span className="text-xs text-zinc-500 w-8">200</span>
                <span className="text-xs text-zinc-400 w-12 text-right">{brushSize}px</span>
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-zinc-700" />

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  className="p-2 rounded-lg bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-300 transition-colors"
                  title="Undo"
                  disabled
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  className="p-2 rounded-lg bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-300 transition-colors"
                  title="Redo"
                  disabled
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setHasMask(false)}
                  className="p-2 rounded-lg bg-zinc-700 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                  title="Clear All"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Prompt */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what should appear in the masked area..."
                className="w-full h-32 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>

            {/* Info */}
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Duration</span>
                <span className="text-zinc-300">{duration.toFixed(1)}s</span>
              </div>
            </div>

            {/* Mask Hint */}
            {!hasMask && (
              <p className="text-xs text-zinc-500 text-center">
                Draw on the video frame to create a mask for the area you want to modify.
              </p>
            )}

            {/* Demo Button - Simulate mask drawing */}
            <button
              onClick={() => {
                setHasMask(true);
                // Set a demo mask data URL (white pixel placeholder)
                setMaskDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==');
              }}
              disabled={isProcessing}
              className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {hasMask ? 'Mask Applied' : 'Simulate Mask (Demo)'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
});

export default VideoInpaintModal;
