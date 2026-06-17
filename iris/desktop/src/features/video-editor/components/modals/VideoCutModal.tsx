/**
 * VideoCutModal - Modal for video cutting with timeline
 */

import { memo, useState, useCallback } from 'react';
import {
  Scissors,
  Video,
  Play,
  Pause,
  Plus,
  X,
  Layers,
  FileStack,
  Loader2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Modal } from '@/shared/components/ui/Modal';
import { cutVideoSegments, pollVideoStatus } from '@/shared/api/video.api';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { toast } from '@/shared/lib/toast';
import { formatTime } from '@/shared/lib/utils/time';

export interface VideoCutModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  thumbnailUrl?: string;
  duration?: number;
}

interface CutSegment {
  id: string;
  startTime: number;
  endTime: number;
}

type ExportMode = 'merge' | 'individual';

const formatTimePrecise = (seconds: number) => formatTime(seconds, { padMinutes: true, fractionalDigits: 1 });

export const VideoCutModal = memo(function VideoCutModal({
  isOpen,
  onClose,
  videoId,
  thumbnailUrl,
  duration = 60,
}: VideoCutModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, _setCurrentTime] = useState(0);
  const [segments, setSegments] = useState<CutSegment[]>([
    { id: '1', startTime: 0, endTime: duration },
  ]);
  const [activeSegmentId, setActiveSegmentId] = useState<string>('1');
  const [exportMode, setExportMode] = useState<ExportMode>('merge');
  const [outputName, setOutputName] = useState('video-cut');
  const [isProcessing, setIsProcessing] = useState(false);

  const activeSegment = segments.find((s) => s.id === activeSegmentId);

  const addSegment = useCallback(() => {
    const newId = Date.now().toString();
    setSegments((prev) => [
      ...prev,
      { id: newId, startTime: 0, endTime: duration },
    ]);
    setActiveSegmentId(newId);
  }, [duration]);

  const removeSegment = useCallback((id: string) => {
    setSegments((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        return [{ id: '1', startTime: 0, endTime: duration }];
      }
      return filtered;
    });
    setActiveSegmentId((prev) => {
      if (prev === id) {
        const remaining = segments.filter((s) => s.id !== id);
        return remaining[0]?.id || '1';
      }
      return prev;
    });
  }, [segments, duration]);

  const updateSegment = useCallback((id: string, field: 'startTime' | 'endTime', value: number) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              [field]: Math.max(0, Math.min(duration, value)),
            }
          : s
      )
    );
  }, [duration]);

  const totalDuration = segments.reduce((acc, s) => acc + (s.endTime - s.startTime), 0);

  const handleGenerate = async () => {
    if (!videoId || totalDuration <= 0 || isProcessing) return;

    setIsProcessing(true);
    try {
      const result = await cutVideoSegments(
        videoId,
        segments.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        exportMode,
        exportMode === 'merge' ? outputName : undefined
      );

      if (!result || result.assets.length === 0) {
        throw new Error('No output produced from video cut');
      }

      // Poll each asset until READY
      const readyAssets = await Promise.all(
        result.assets.map(async (asset) => {
          if (asset.processingStatus === 'PROCESSING') {
            return pollVideoStatus(asset.id);
          }
          return asset;
        })
      );

      // Add results to media pool
      const { addMedia } = useVideoProjectStore.getState();
      for (const asset of readyAssets) {
        if (asset) {
          const metadata = (asset.metadata || {}) as Record<string, unknown>;
          await addMedia({
            mediaType: 'video',
            name: asset.name,
            externalId: asset.id,
            fileUrl: asset.previewUrl || undefined,
            thumbnailUrl: asset.thumbnailUrl || null,
            duration: (metadata.duration as number) || null,
            width: (metadata.width as number) || null,
            height: (metadata.height as number) || null,
            fileSize: asset.sizeBytes || null,
          });
        }
      }

      const count = readyAssets.filter(Boolean).length;
      toast.success(
        exportMode === 'merge'
          ? 'Video segments merged successfully'
          : `${count} segment(s) exported successfully`
      );
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Video cut failed'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cut Video"
      description="Select segments to cut and export"
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={totalDuration <= 0 || isProcessing}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
              totalDuration > 0 && !isProcessing
                ? 'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            )}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Scissors className="w-4 h-4" />
            )}
            {isProcessing ? 'Processing...' : 'Generate'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
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
          {/* Play/Pause Overlay */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
          >
            {isPlaying ? (
              <Pause className="w-12 h-12 text-white" />
            ) : (
              <Play className="w-12 h-12 text-white" />
            )}
          </button>
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={addSegment}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Segment
            </button>
            <span className="text-sm text-zinc-500">
              {formatTimePrecise(currentTime)} / {formatTimePrecise(duration)}
            </span>
          </div>

          {/* Timeline Bar */}
          <div className="relative h-12 bg-zinc-800 rounded-lg overflow-hidden">
            {/* Segments */}
            {segments.map((segment, index) => {
              const left = (segment.startTime / duration) * 100;
              const width = ((segment.endTime - segment.startTime) / duration) * 100;
              const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500'];
              return (
                <div
                  key={segment.id}
                  onClick={() => setActiveSegmentId(segment.id)}
                  className={cn(
                    'absolute top-1 bottom-1 rounded cursor-pointer transition-all',
                    colors[index % colors.length],
                    activeSegmentId === segment.id
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-800'
                      : 'opacity-70 hover:opacity-100'
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            })}
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
          </div>

          {/* Time Labels */}
          <div className="flex justify-between text-xs text-zinc-500">
            <span>00:00</span>
            <span>{formatTimePrecise(duration)}</span>
          </div>
        </div>

        {/* Segment List */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Segments</label>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {segments.map((segment, index) => (
              <div
                key={segment.id}
                onClick={() => setActiveSegmentId(segment.id)}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
                  activeSegmentId === segment.id
                    ? 'bg-zinc-700'
                    : 'bg-zinc-800/50 hover:bg-zinc-800'
                )}
              >
                <span className="text-sm text-zinc-400 w-4">{index + 1}.</span>
                <span className="text-sm text-zinc-300 flex-1">
                  {formatTimePrecise(segment.startTime)} - {formatTimePrecise(segment.endTime)}
                </span>
                <span className="text-xs text-zinc-500">
                  {formatTimePrecise(segment.endTime - segment.startTime)}
                </span>
                {segments.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSegment(segment.id);
                    }}
                    className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Active Segment Time Inputs */}
        {activeSegment && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Start Time</label>
              <input
                type="number"
                value={activeSegment.startTime.toFixed(1)}
                onChange={(e) => updateSegment(activeSegment.id, 'startTime', parseFloat(e.target.value) || 0)}
                step={0.1}
                min={0}
                max={duration}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">End Time</label>
              <input
                type="number"
                value={activeSegment.endTime.toFixed(1)}
                onChange={(e) => updateSegment(activeSegment.id, 'endTime', parseFloat(e.target.value) || 0)}
                step={0.1}
                min={0}
                max={duration}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
          </div>
        )}

        {/* Total Duration */}
        <div className="flex justify-between text-sm p-2 bg-zinc-800/50 rounded-lg">
          <span className="text-zinc-500">Total Duration</span>
          <span className="text-zinc-300">{formatTimePrecise(totalDuration)}</span>
        </div>

        {/* Export Mode */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Export Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setExportMode('merge')}
              className={cn(
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                exportMode === 'merge'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <Layers className="w-4 h-4" />
              Merge
            </button>
            <button
              onClick={() => setExportMode('individual')}
              className={cn(
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                exportMode === 'individual'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <FileStack className="w-4 h-4" />
              Individual
            </button>
          </div>
        </div>

        {/* Output Name (Merge mode only) */}
        {exportMode === 'merge' && (
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Output Name
            </label>
            <input
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="video-cut"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
        )}
      </div>
    </Modal>
  );
});

export default VideoCutModal;
