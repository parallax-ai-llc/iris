/**
 * MediaPanel - Media pool panel for video project editor
 * Displays imported media (videos, images, audio) with drag & drop support
 *
 * Features:
 * - Grid/List view toggle
 * - Media type filtering
 * - Drag to timeline support
 * - Import from gallery/upload
 * - Preview on hover
 */

import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Video,
  Image,
  Music,
  Grid3X3,
  List,
  Plus,
  Search,
  Trash2,
  Film,
  Clock,
  HardDrive,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useVideoProjectStore, selectMediaPool } from '@/features/video-editor/stores/videoProject.store';
import { useCachedAssetUrlById } from '@/shared/hooks/useCachedAssetUrl';
import type { ProjectMedia, MediaType } from '@/types/videoProject.types';

// Cached thumbnail component for media items
const CachedMediaThumbnail = memo(function CachedMediaThumbnail({
  externalId,
  fileUrl,
  thumbnailUrl: directThumbnail,
  mediaType,
  fallbackIcon: FallbackIcon,
}: {
  externalId: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType: string;
  fallbackIcon: typeof Video;
}) {
  const [imgError, setImgError] = useState(false);

  // If we have a direct thumbnail (data URL from probe, or local-media:// image), use it directly
  const hasDirectThumbnail = !!directThumbnail && (directThumbnail.startsWith('data:') || directThumbnail.startsWith('http') || directThumbnail.startsWith('local-media:') || directThumbnail.startsWith('blob:'));

  // Determine mime type based on media type
  const mimeType = mediaType === 'video' ? 'video/mp4' : mediaType === 'audio' ? 'audio/mpeg' : 'image/jpeg';

  // Use externalId for server assets (skip hook if we have a direct thumbnail)
  const assetRef = externalId || null;
  const isLocalFile = !externalId && !!fileUrl;

  const { url, isLoading, error } = useCachedAssetUrlById(
    assetRef,
    mimeType,
    { type: 'thumbnail', enabled: !!assetRef && !hasDirectThumbnail }
  );

  const displayUrl = hasDirectThumbnail ? directThumbnail : url;

  // Reset img error when url changes
  useEffect(() => { setImgError(false); }, [displayUrl]);

  if (isLoading && !hasDirectThumbnail) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  // Media not found / lost (only for server assets or when explicitly errored)
  if (error && !displayUrl && !isLocalFile) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-red-950/60 gap-1">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-[9px] text-red-300">Offline</span>
      </div>
    );
  }

  if (displayUrl && !imgError) {
    return (
      <img
        src={displayUrl}
        alt="thumbnail"
        className="w-full h-full object-cover"
        draggable={false}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback icon
  return (
    <div className="w-full h-full flex items-center justify-center bg-zinc-800">
      <FallbackIcon className="w-8 h-8 text-zinc-500" />
    </div>
  );
});

interface MediaPanelProps {
  className?: string;
  onDragStart?: (media: ProjectMedia) => void;
  onImportClick?: () => void;
  onDoubleClick?: (media: ProjectMedia) => void;
}

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | MediaType;

// Media type icons
const mediaTypeIcons: Record<MediaType, typeof Video> = {
  video: Video,
  image: Image,
  audio: Music,
};

// Format file size
function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Format duration
function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Media item component (Grid view)
const MediaItemGrid = memo(function MediaItemGrid({
  media,
  onDragStart,
  onRemove,
  isSelected,
  onSelect,
  onDoubleClick,
}: {
  media: ProjectMedia;
  onDragStart?: (media: ProjectMedia) => void;
  onRemove?: (mediaId: string) => void;
  isSelected: boolean;
  onSelect: (mediaId: string) => void;
  onDoubleClick?: (media: ProjectMedia) => void;
}) {
  const Icon = mediaTypeIcons[media.mediaType as MediaType] || Film;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/json', JSON.stringify(media));
      e.dataTransfer.effectAllowed = 'copy';
      onDragStart?.(media);
    },
    [media, onDragStart]
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onSelect(media.id)}
      onDoubleClick={() => onDoubleClick?.(media)}
      className={cn(
        'group relative aspect-video rounded-lg overflow-hidden cursor-grab',
        'bg-zinc-800 border transition-all',
        isSelected
          ? 'border-white ring-1 ring-white/30'
          : 'border-zinc-700 hover:border-zinc-500'
      )}
    >
      {/* Thumbnail */}
      <CachedMediaThumbnail
        externalId={media.externalId}
        fileUrl={media.fileUrl}
        thumbnailUrl={media.thumbnailUrl}
        mediaType={media.mediaType}
        fallbackIcon={Icon}
      />

      {/* Overlay on hover */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent',
          'opacity-0 group-hover:opacity-100 transition-opacity'
        )}
      >
        {/* Duration badge */}
        {media.duration && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white">
            {formatDuration(media.duration)}
          </div>
        )}

        {/* Remove button */}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(media.id);
            }}
            className="absolute top-2 right-2 p-1 rounded bg-red-500/80 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
        <p className="text-xs text-white truncate">{media.name}</p>
      </div>

      {/* Type icon */}
      <div className="absolute top-2 left-2 p-1 rounded bg-black/50">
        <Icon className="w-3 h-3 text-white" />
      </div>
    </div>
  );
});

// Media item component (List view)
const MediaItemList = memo(function MediaItemList({
  media,
  onDragStart,
  onRemove,
  isSelected,
  onSelect,
  onDoubleClick,
}: {
  media: ProjectMedia;
  onDragStart?: (media: ProjectMedia) => void;
  onRemove?: (mediaId: string) => void;
  isSelected: boolean;
  onSelect: (mediaId: string) => void;
  onDoubleClick?: (media: ProjectMedia) => void;
}) {
  const Icon = mediaTypeIcons[media.mediaType as MediaType] || Film;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/json', JSON.stringify(media));
      e.dataTransfer.effectAllowed = 'copy';
      onDragStart?.(media);
    },
    [media, onDragStart]
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onSelect(media.id)}
      onDoubleClick={() => onDoubleClick?.(media)}
      className={cn(
        'group flex items-center gap-3 p-2 rounded-lg cursor-grab',
        'transition-all',
        isSelected
          ? 'bg-zinc-700 ring-1 ring-white/30'
          : 'hover:bg-zinc-800'
      )}
    >
      {/* Thumbnail - use cached URL for encrypted assets or local file reference */}
      <div className="w-16 h-10 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
        <CachedMediaThumbnail
          externalId={media.externalId}
          fileUrl={media.fileUrl}
          mediaType={media.mediaType}
          fallbackIcon={Icon}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{media.name}</p>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          {media.duration && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(media.duration)}
            </span>
          )}
          {media.width && media.height && (
            <span>
              {media.width}x{media.height}
            </span>
          )}
          {media.fileSize && (
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {formatFileSize(media.fileSize)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(media.id);
          }}
          className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

// Filter button component
const FilterButton = memo(function FilterButton({
  label,
  icon: Icon,
  isActive,
  onClick,
  count,
}: {
  label: string;
  icon?: typeof Video;
  isActive: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
        isActive
          ? 'bg-white text-black'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'px-1 rounded text-[10px]',
            isActive ? 'bg-black/20' : 'bg-zinc-700'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
});

// Main MediaPanel component
export const MediaPanel = memo(function MediaPanel({
  className,
  onDragStart,
  onImportClick,
  onDoubleClick,
}: MediaPanelProps) {
  const mediaPool = useVideoProjectStore(selectMediaPool);
  const removeMedia = useVideoProjectStore((s) => s.removeMedia);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filter and search media
  const filteredMedia = useMemo(() => {
    let result = mediaPool;

    // Type filter
    if (filter !== 'all') {
      result = result.filter((m) => m.mediaType === filter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(query));
    }

    return result;
  }, [mediaPool, filter, searchQuery]);

  // Count by type
  const counts = useMemo(() => {
    return {
      all: mediaPool.length,
      video: mediaPool.filter((m) => m.mediaType === 'video').length,
      image: mediaPool.filter((m) => m.mediaType === 'image').length,
      audio: mediaPool.filter((m) => m.mediaType === 'audio').length,
    };
  }, [mediaPool]);

  const handleRemove = useCallback(
    async (mediaId: string) => {
      await removeMedia(mediaId);
      if (selectedId === mediaId) {
        setSelectedId(null);
      }
    },
    [removeMedia, selectedId]
  );

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-white">Media Pool</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'grid'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-white'
            )}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'list'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-white'
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search media..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800 overflow-x-auto">
        <FilterButton
          label="All"
          isActive={filter === 'all'}
          onClick={() => setFilter('all')}
          count={counts.all}
        />
        <FilterButton
          label="Video"
          icon={Video}
          isActive={filter === 'video'}
          onClick={() => setFilter('video')}
          count={counts.video}
        />
        <FilterButton
          label="Image"
          icon={Image}
          isActive={filter === 'image'}
          onClick={() => setFilter('image')}
          count={counts.image}
        />
        <FilterButton
          label="Audio"
          icon={Music}
          isActive={filter === 'audio'}
          onClick={() => setFilter('audio')}
          count={counts.audio}
        />
      </div>

      {/* Media list */}
      <div className="flex-1 overflow-auto p-3">
        {filteredMedia.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Film className="w-12 h-12 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 mb-1">
              {searchQuery ? 'No media found' : 'No media imported'}
            </p>
            <p className="text-xs text-zinc-500 mb-4">
              {searchQuery
                ? 'Try a different search term'
                : 'Import videos, images, or audio to get started'}
            </p>
            {!searchQuery && onImportClick && (
              <button
                onClick={onImportClick}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Import Media
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filteredMedia.map((media) => (
              <MediaItemGrid
                key={media.id}
                media={media}
                onDragStart={onDragStart}
                onRemove={handleRemove}
                isSelected={selectedId === media.id}
                onSelect={setSelectedId}
                onDoubleClick={onDoubleClick}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredMedia.map((media) => (
              <MediaItemList
                key={media.id}
                media={media}
                onDragStart={onDragStart}
                onRemove={handleRemove}
                isSelected={selectedId === media.id}
                onSelect={setSelectedId}
                onDoubleClick={onDoubleClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Import button (fixed at bottom) */}
      {onImportClick && filteredMedia.length > 0 && (
        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={onImportClick}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded bg-zinc-800 text-white text-sm hover:bg-zinc-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Import Media
          </button>
        </div>
      )}
    </div>
  );
});

export default MediaPanel;
