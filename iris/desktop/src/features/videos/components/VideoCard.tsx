/**
 * VideoCard - Display video thumbnail with hover preview
 */

import { memo, useRef, useState, useCallback } from 'react';
import {
  Play,
  Download,
  Trash2,
  Clock,
  Loader2,
  AlertCircle,
  Film,
  ImageIcon,
  FolderPlus,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useCachedAssetUrl } from '@/shared/hooks/useCachedAssetUrl';
import type { IrisAsset } from '@/shared/api/types';

interface VideoCardProps {
  video: IrisAsset;
  onClick: (video: IrisAsset) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onSetReference?: (video: IrisAsset) => void;
  onAddToProject?: (video: IrisAsset) => void;
  isReference?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
}

export const VideoCard = memo(function VideoCard({
  video,
  onClick,
  onDownload,
  onDelete,
  onSetReference,
  onAddToProject,
  isReference,
  isSelectionMode,
  isSelected,
  onToggleSelection,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);

  const isProcessing = video.processingStatus === 'PROCESSING' || video.processingStatus === 'PENDING';
  const isFailed = video.processingStatus === 'FAILED';

  // Use cached URLs for thumbnails and video previews
  const { url: cachedThumbnailUrl } = useCachedAssetUrl(
    (!isProcessing && !isFailed) ? video : null,
    { type: 'thumbnail' }
  );
  const { url: cachedVideoUrl } = useCachedAssetUrl(
    (!isProcessing && !isFailed && isHovering) ? video : null,
    { type: 'preview', enabled: isHovering }
  );

  const thumbnailUrl = cachedThumbnailUrl || video.thumbnailUrl || video.previewUrl;
  const videoUrl = cachedVideoUrl || video.previewUrl || video.publicUrl;

  // Format duration
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `0:${secs.toString().padStart(2, '0')}`;
  };

  const duration = (video.metadata?.duration as number) || (video.metadata?.settings as Record<string, unknown>)?.duration as number;

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    if (videoRef.current && videoUrl && !isProcessing && !isFailed) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // Ignore play errors (e.g., autoplay policy)
      });
    }
  }, [videoUrl, isProcessing, isFailed]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    // In selection mode, toggle selection
    if (isSelectionMode && onToggleSelection) {
      onToggleSelection(video.id);
      return;
    }
    if (e.shiftKey && onSetReference) {
      e.preventDefault();
      onSetReference(video);
      return;
    }
    onClick(video);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onSetReference) {
      e.preventDefault();
      onSetReference(video);
    }
  };

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'group relative aspect-video rounded-xl overflow-hidden bg-zinc-800 border transition-colors cursor-pointer',
        isSelectionMode && isSelected
          ? 'border-white/30 ring-2 ring-white/20'
          : isReference
            ? 'border-white/30 ring-2 ring-white/20'
            : 'border-zinc-700 hover:border-zinc-600',
        (isProcessing || isFailed) && !isSelectionMode && 'cursor-default'
      )}
    >
      {/* Selection checkbox */}
      {isSelectionMode && !isProcessing && (
        <div
          className={cn(
            'absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all z-10',
            isSelected
              ? 'bg-white border-white'
              : 'bg-black/30 border-white/50 backdrop-blur-sm'
          )}
        >
          {isSelected && <Check size={14} className="text-black" />}
        </div>
      )}

      {/* Thumbnail / Video Preview */}
      {isProcessing ? (
        // Processing state
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
          <Loader2 className="w-10 h-10 text-white/70 animate-spin mb-2" />
          <span className="text-xs text-zinc-400">Processing...</span>
        </div>
      ) : isFailed ? (
        // Failed state
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
          <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
          <span className="text-xs text-red-400">Failed</span>
          {video.processingError && (
            <span className="text-xs text-zinc-500 mt-1 px-4 text-center line-clamp-2">
              {video.processingError}
            </span>
          )}
          {/* Delete button for failed items - hidden in selection mode */}
          {!isSelectionMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(video.id);
              }}
              className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 rounded-lg backdrop-blur-sm transition-colors"
              title="Delete"
            >
              <X size={14} className="text-white" />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Thumbnail image */}
          {thumbnailUrl && !isHovering && !thumbnailError && (
            <img
              src={thumbnailUrl}
              alt={video.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setThumbnailError(true)}
            />
          )}

          {/* Video preview on hover */}
          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              className={cn(
                'w-full h-full object-cover',
                !isHovering && 'hidden'
              )}
              muted
              loop
              playsInline
              onError={() => setHasError(true)}
            />
          )}

          {/* Fallback if no thumbnail or video, or thumbnail failed to load */}
          {((!thumbnailUrl || thumbnailError) && !videoUrl) || (thumbnailError && !isHovering) ? (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-12 h-12 text-zinc-600" />
            </div>
          ) : null}

          {/* Play icon overlay (when not hovering) */}
          {!isHovering && !hasError && videoUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-6 h-6 text-white ml-1" fill="white" />
              </div>
            </div>
          )}

          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(duration)}
            </div>
          )}
        </>
      )}

      {/* Reference badge */}
      {isReference && !isSelectionMode && (
        <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-white/10 rounded-md text-xs font-medium text-white flex items-center gap-1">
          <ImageIcon className="w-3 h-3" />
          Reference
        </div>
      )}

      {/* Overlay on hover - hidden in selection mode */}
      {!isProcessing && !isFailed && !isSelectionMode && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Info */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-sm font-medium text-white truncate">{video.name}</p>
            <p className="text-xs text-zinc-400">
              {new Date(video.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Actions */}
          <div className="absolute top-2 right-2 flex gap-1.5">
            {onAddToProject && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToProject(video);
                }}
                className={cn(
                  'p-2 rounded-lg',
                  'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800',
                  'transition-colors'
                )}
                title="Add to Project"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            )}
            {onSetReference && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetReference(video);
                }}
                className={cn(
                  'p-2 rounded-lg',
                  'bg-zinc-900/80 text-zinc-300 hover:text-white/70 hover:bg-zinc-800',
                  'transition-colors'
                )}
                title="Use as reference (Shift+Click)"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(video.id);
              }}
              className={cn(
                'p-2 rounded-lg',
                'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800',
                'transition-colors'
              )}
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(video.id);
              }}
              className={cn(
                'p-2 rounded-lg',
                'bg-zinc-900/80 text-zinc-300 hover:text-red-400 hover:bg-zinc-800',
                'transition-colors'
              )}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// Skeleton loader for video cards
export const VideoCardSkeleton = memo(function VideoCardSkeleton() {
  return (
    <div className="aspect-video rounded-xl bg-zinc-800 animate-pulse">
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-12 h-12 rounded-lg bg-zinc-700" />
      </div>
    </div>
  );
});

export default VideoCard;
