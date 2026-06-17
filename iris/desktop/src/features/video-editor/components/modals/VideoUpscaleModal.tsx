/**
 * VideoUpscaleModal - Modal for video upscaling settings
 */

import { memo, useState, useEffect, useMemo } from 'react';
import { Maximize2, Video, AlertCircle, Coins, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Modal } from '@/shared/components/ui/Modal';
import { useTokenCostsStore } from '@/shared/stores/token-costs';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { upscaleVideoWithSettings, pollVideoStatus } from '@/shared/api/video.api';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { toast } from '@/shared/lib/toast';

export interface VideoUpscaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  thumbnailUrl?: string;
  duration?: number;
}

type Resolution = '720p' | '1080p' | '4K';
type FrameRate = 24 | 30 | 60;

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '4K', label: '4K' },
];

const FRAME_RATES: { value: FrameRate; label: string }[] = [
  { value: 24, label: '24 fps' },
  { value: 30, label: '30 fps' },
  { value: 60, label: '60 fps' },
];

export const VideoUpscaleModal = memo(function VideoUpscaleModal({
  isOpen,
  onClose,
  videoId,
  thumbnailUrl,
  duration = 5,
}: VideoUpscaleModalProps) {
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [frameRate, setFrameRate] = useState<FrameRate>(30);
  const [isProcessing, setIsProcessing] = useState(false);

  const { costs, fetchTokenCosts, getModelTokenCost } = useTokenCostsStore();

  useEffect(() => {
    fetchTokenCosts();
  }, [fetchTokenCosts]);

  const tokenCost = useMemo(() => {
    // Use model ID from AGENT_MODELS for dynamic pricing with actual duration
    const baseCost = getModelTokenCost('topazlabs-video-upscale', 'EDIT_VIDEO_UPSCALE', {
      durationSeconds: duration,
    });
    if (baseCost === 0) {
      return costs['EDIT_VIDEO_UPSCALE'] ?? 0;
    }
    // 4K costs 2x
    return resolution === '4K' ? baseCost * 2 : baseCost;
  }, [getModelTokenCost, costs, resolution, duration]);

  const handleGenerate = async () => {
    if (!videoId || isProcessing) return;

    setIsProcessing(true);
    try {
      const asset = await upscaleVideoWithSettings(videoId, {
        targetResolution: resolution,
        targetFps: frameRate,
      });

      if (!asset) {
        throw new Error('Failed to start video upscale');
      }

      // Poll until processing completes
      let finalAsset = asset;
      if (asset.processingStatus === 'PROCESSING') {
        const polled = await pollVideoStatus(asset.id);
        if (!polled) {
          throw new Error('Failed to get upscaled video');
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

      toast.success(`Video upscaled to ${resolution} successfully`);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Video upscale failed'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upscale Video"
      description="Enhance video resolution and frame rate"
      size="md"
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
              disabled={isProcessing}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
                isProcessing
                  ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white'
              )}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
              {isProcessing ? 'Processing...' : 'Generate'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Video Preview */}
        <div className="relative aspect-video bg-zinc-800 rounded-lg overflow-hidden">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Video preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Video className="w-12 h-12 text-zinc-600" />
            </div>
          )}
        </div>

        {/* Resolution Selection */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Target Resolution
          </label>
          <div className="grid grid-cols-3 gap-2">
            {RESOLUTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setResolution(value)}
                className={cn(
                  'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border',
                  resolution === value
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate Selection */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Frame Rate
          </label>
          <div className="grid grid-cols-3 gap-2">
            {FRAME_RATES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFrameRate(value)}
                className={cn(
                  'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border',
                  frameRate === value
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 4K Warning */}
        {resolution === '4K' && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-200">
              4K upscaling costs 2x credits compared to lower resolutions.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
});

export default VideoUpscaleModal;
