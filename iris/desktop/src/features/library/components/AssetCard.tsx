/**
 * AssetCard - Display card for images and videos in library
 * Supports selection, preview, and context menu actions
 */

import { memo, useState, useRef, useCallback } from 'react';
import {
  ImageIcon,
  Video,
  Play,
  Check,
  MoreVertical,
  Download,
  Trash2,
  Edit,
  FolderInput,
  Loader2,
} from 'lucide-react';
import { cn, formatFileSize } from '@/shared/lib/utils';
import { useCachedAssetUrl } from '@/shared/hooks/useCachedAssetUrl';
import type { IrisAsset } from '@/shared/api/types';

// ==================== Types ====================

interface AssetCardProps {
  asset: IrisAsset;
  isSelected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
  viewMode?: 'grid' | 'list';
}

// ==================== Grid Card ====================

const GridAssetCard = memo(function GridAssetCard({
  asset,
  isSelected,
  onSelect,
  onClick,
  onDownload,
  onDelete,
  onRename,
  onMove,
}: Omit<AssetCardProps, 'viewMode'>) {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isVideo = asset.assetType === 'VIDEO';
  
  // Use cached URLs for proper decryption/signing
  const { url: cachedThumbnailUrl, isLoading: isLoadingThumbnail } = useCachedAssetUrl(
    asset,
    { type: 'thumbnail', enabled: true }
  );
  const { url: cachedPreviewUrl } = useCachedAssetUrl(
    asset,
    { type: 'preview', enabled: isVideo && isHovering }
  );
  
  const thumbnailUrl = cachedThumbnailUrl;
  const previewUrl = cachedPreviewUrl || asset.previewUrl || asset.publicUrl;

  // Handle video hover preview
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    if (isVideo && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [isVideo]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    if (isVideo && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isVideo]);

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <div
      className={cn(
        'group relative rounded-xl overflow-hidden cursor-pointer',
        'bg-zinc-800/50 border-2 transition-all',
        isSelected
          ? 'border-white/30 ring-2 ring-white/20'
          : 'border-transparent hover:border-zinc-600'
      )}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Thumbnail / Preview */}
      <div className="aspect-square relative bg-zinc-900">
        {isLoadingThumbnail ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
          </div>
        ) : isVideo && previewUrl ? (
          <>
            {/* Video thumbnail */}
            {thumbnailUrl && !isHovering && (
              <img
                src={thumbnailUrl}
                alt={asset.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {/* Video preview on hover */}
            <video
              ref={videoRef}
              src={previewUrl}
              muted
              loop
              playsInline
              className={cn(
                'absolute inset-0 w-full h-full object-cover',
                !isHovering && 'opacity-0'
              )}
            />
            {/* Play icon overlay */}
            {!isHovering && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                  <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                </div>
              </div>
            )}
          </>
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? (
              <Video className="w-12 h-12 text-zinc-600" />
            ) : (
              <ImageIcon className="w-12 h-12 text-zinc-600" />
            )}
          </div>
        )}

        {/* Selection checkbox */}
        <button
          onClick={handleSelectClick}
          className={cn(
            'absolute top-2 left-2 w-6 h-6 rounded-md transition-all',
            'flex items-center justify-center',
            isSelected
              ? 'bg-white/70 text-white'
              : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100'
          )}
        >
          {isSelected && <Check className="w-4 h-4" />}
        </button>

        {/* Type badge */}
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/50 text-xs text-white/80">
          {isVideo ? 'VIDEO' : 'IMAGE'}
        </div>

        {/* Menu button */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                  }}
                />
                <div className="absolute right-0 bottom-full mb-1 w-40 py-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
                  >
                    <FolderInput className="w-4 h-4" />
                    Move to...
                  </button>
                  <div className="my-1 border-t border-zinc-700" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-600/20 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-white truncate">{asset.name}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {formatFileSize(asset.sizeBytes)}
        </p>
      </div>
    </div>
  );
});

// ==================== List Card ====================

const ListAssetCard = memo(function ListAssetCard({
  asset,
  isSelected,
  onSelect,
  onClick,
  onDownload,
  onDelete,
  onRename,
}: Omit<AssetCardProps, 'viewMode' | 'onMove'>) {
  const isVideo = asset.assetType === 'VIDEO';
  
  // Use cached URLs for proper decryption/signing
  const { url: cachedThumbnailUrl, isLoading: isLoadingThumbnail } = useCachedAssetUrl(
    asset,
    { type: 'thumbnail', enabled: true }
  );
  
  const thumbnailUrl = cachedThumbnailUrl;

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3 rounded-lg cursor-pointer',
        'bg-zinc-800/30 border transition-all',
        isSelected
          ? 'border-white/30 bg-white/70/10'
          : 'border-transparent hover:bg-zinc-800/50'
      )}
      onClick={onClick}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={cn(
          'w-5 h-5 rounded border-2 transition-all flex-shrink-0',
          'flex items-center justify-center',
          isSelected
            ? 'bg-white/70 border-white/30 text-white'
            : 'border-zinc-600 hover:border-zinc-500'
        )}
      >
        {isSelected && <Check className="w-3 h-3" />}
      </button>

      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
        {isLoadingThumbnail ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : thumbnailUrl ? (
          <img src={thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? (
              <Video className="w-5 h-5 text-zinc-600" />
            ) : (
              <ImageIcon className="w-5 h-5 text-zinc-600" />
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{asset.name}</p>
        <p className="text-xs text-zinc-500">
          {isVideo ? 'Video' : 'Image'} • {formatFileSize(asset.sizeBytes)}
        </p>
      </div>

      {/* Date */}
      <div className="text-xs text-zinc-500 flex-shrink-0">
        {new Date(asset.createdAt).toLocaleDateString()}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          title="Rename"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-600/20 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

// ==================== Main Component ====================

export const AssetCard = memo(function AssetCard(props: AssetCardProps) {
  if (props.viewMode === 'list') {
    return <ListAssetCard {...props} />;
  }
  return <GridAssetCard {...props} />;
});

// ==================== Skeleton ====================

export const AssetCardSkeleton = memo(function AssetCardSkeleton({
  viewMode = 'grid',
}: {
  viewMode?: 'grid' | 'list';
}) {
  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-4 p-3 rounded-lg bg-zinc-800/30 animate-pulse">
        <div className="w-5 h-5 rounded bg-zinc-700" />
        <div className="w-12 h-12 rounded-lg bg-zinc-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-zinc-700" />
          <div className="h-3 w-24 rounded bg-zinc-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden bg-zinc-800/50 animate-pulse">
      <div className="aspect-square bg-zinc-700" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-zinc-700" />
        <div className="h-3 w-1/2 rounded bg-zinc-700" />
      </div>
    </div>
  );
});

export default AssetCard;
