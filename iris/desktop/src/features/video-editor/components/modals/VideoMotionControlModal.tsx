/**
 * VideoMotionControlModal - Modal for motion control settings
 */

import { memo, useState, useRef, useEffect, useMemo } from 'react';
import { Move, Video, Image, Upload, HelpCircle, Coins, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Modal } from '@/shared/components/ui/Modal';
import { useTokenCostsStore } from '@/shared/stores/token-costs';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { motionControlVideo, pollVideoStatus } from '@/shared/api/video.api';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { toast } from '@/shared/lib/toast';

export interface VideoMotionControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  thumbnailUrl?: string;
  duration?: number;
}

type Mode = 'std' | 'pro';
type CharacterOrientation = 'image' | 'video';

export const VideoMotionControlModal = memo(function VideoMotionControlModal({
  isOpen,
  onClose,
  videoId,
  thumbnailUrl,
  duration = 5,
}: VideoMotionControlModalProps) {
  const [mode, setMode] = useState<Mode>('std');
  const [characterOrientation, setCharacterOrientation] = useState<CharacterOrientation>('image');
  const [keepOriginalSound, setKeepOriginalSound] = useState(false);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { costs, fetchTokenCosts, getModelTokenCost } = useTokenCostsStore();

  useEffect(() => {
    fetchTokenCosts();
  }, [fetchTokenCosts]);

  const tokenCost = useMemo(() => {
    // Use model ID from AGENT_MODELS for dynamic pricing with actual duration
    const baseCost = getModelTokenCost('kling-motion-control', 'EDIT_MOTION_CONTROL', {
      durationSeconds: duration,
    });
    if (baseCost === 0) {
      return costs['EDIT_MOTION_CONTROL'] ?? 0;
    }
    // Pro mode costs 2x
    return mode === 'pro' ? baseCost * 2 : baseCost;
  }, [getModelTokenCost, costs, mode, duration]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceImage(file);
      setReferenceImageUrl(URL.createObjectURL(file));
    }
  };

  const handleGenerate = async () => {
    if (!videoId || !referenceImage || isProcessing) return;

    setIsProcessing(true);
    try {
      const asset = await motionControlVideo(videoId, referenceImage, {
        mode,
        characterOrientation,
        keepOriginalSound,
      });

      if (!asset) {
        throw new Error('Failed to start motion control');
      }

      // Poll until processing completes
      let finalAsset = asset;
      if (asset.processingStatus === 'PROCESSING') {
        const polled = await pollVideoStatus(asset.id);
        if (!polled) {
          throw new Error('Failed to get motion control result');
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

      toast.success('Motion control video generated successfully');
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Motion control failed'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Motion Control"
      description="Transfer motion from a video to a reference image"
      size="lg"
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
              disabled={!referenceImage || isProcessing}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
                referenceImage && !isProcessing
                  ? 'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white'
                  : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              )}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Move className="w-4 h-4" />
              )}
              {isProcessing ? 'Processing...' : 'Generate'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Input Areas */}
        <div className="grid grid-cols-2 gap-4">
          {/* Reference Image */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Reference Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'aspect-square rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center',
                referenceImageUrl
                  ? 'border-transparent'
                  : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/50'
              )}
            >
              {referenceImageUrl ? (
                <img
                  src={referenceImageUrl}
                  alt="Reference"
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <>
                  <Upload className="w-8 h-8 text-zinc-500 mb-2" />
                  <span className="text-sm text-zinc-500">Upload Image</span>
                </>
              )}
            </div>
          </div>

          {/* Motion Source Video */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Motion Source
            </label>
            <div className="aspect-square rounded-lg bg-zinc-800 overflow-hidden flex items-center justify-center">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt="Motion source"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Video className="w-8 h-8 text-zinc-500" />
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1 text-center">Current video</p>
          </div>
        </div>

        {/* Mode Selection */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Generation Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('std')}
              className={cn(
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border',
                mode === 'std'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
              )}
            >
              Standard
            </button>
            <button
              onClick={() => setMode('pro')}
              className={cn(
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                mode === 'pro'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
              )}
            >
              Pro
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                2x
              </span>
            </button>
          </div>
        </div>

        {/* Character Orientation */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-medium text-zinc-300">
              Character Orientation
            </label>
            <HelpCircle className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setCharacterOrientation('image')}
              className={cn(
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                characterOrientation === 'image'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <Image className="w-4 h-4" />
              Image
            </button>
            <button
              onClick={() => setCharacterOrientation('video')}
              className={cn(
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                characterOrientation === 'video'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <Video className="w-4 h-4" />
              Video
            </button>
          </div>
        </div>

        {/* Keep Original Sound */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-300">
            Keep Original Sound
          </label>
          <button
            onClick={() => setKeepOriginalSound(!keepOriginalSound)}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              keepOriginalSound ? 'bg-white' : 'bg-zinc-700'
            )}
          >
            <span
              className={cn(
                'absolute top-1 w-4 h-4 rounded-full transition-transform',
                keepOriginalSound
                  ? 'translate-x-6 bg-black'
                  : 'translate-x-1 bg-zinc-400'
              )}
            />
          </button>
        </div>
      </div>
    </Modal>
  );
});

export default VideoMotionControlModal;
