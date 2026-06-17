/**
 * AssetPreviewModal - Unified preview modal for images and videos in library
 * Supports preview, download, rename, move, delete, and version history
 */

import { memo, useCallback, useEffect, useState } from 'react';
import {
  X,
  Download,
  Trash2,
  ChevronDown,
  ImageIcon,
  Video,
  Calendar,
  FileText,
  History,
  FolderOpen,
  Edit,
  FolderInput,
  Clock,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, formatFileSize, formatDuration } from '@/shared/lib/utils';
import { useLibraryStore } from '@/features/library/stores/library.store';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import type { AssetVersion } from '@/shared/api/types';

// ==================== Sub-components ====================

interface DownloadDropdownProps {
  onDownload: () => void;
  onShowInFolder: () => void;
  disabled: boolean;
  lastSavedPath: string | null;
}

const DownloadDropdown = memo(function DownloadDropdown({
  onDownload,
  onShowInFolder,
  disabled,
  lastSavedPath,
}: DownloadDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = () => setIsOpen(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (lastSavedPath) {
            setIsOpen(!isOpen);
          } else {
            onDownload();
          }
        }}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'transition-colors text-sm font-medium',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Download className="w-4 h-4" />
        Download
        {lastSavedPath && <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && !disabled && lastSavedPath && (
        <div className="absolute top-full left-0 mt-1 py-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[160px]">
          <button
            onClick={() => {
              setIsOpen(false);
              onDownload();
            }}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download Again
          </button>
          <div className="my-1 border-t border-zinc-700" />
          <button
            onClick={() => {
              setIsOpen(false);
              onShowInFolder();
            }}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors flex items-center gap-2"
          >
            <FolderOpen className="w-4 h-4" />
            Show in Folder
          </button>
        </div>
      )}
    </div>
  );
});

interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
}

const RenameDialog = memo(function RenameDialog({
  isOpen,
  onClose,
  onConfirm,
  currentName,
}: RenameDialogProps) {
  const [newName, setNewName] = useState(currentName);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName !== currentName) {
      onConfirm(newName.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-4">Rename Asset</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            className={cn(
              'w-full px-3 py-2 rounded-lg mb-6',
              'bg-zinc-800 border border-zinc-700',
              'text-white placeholder-zinc-500',
              'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent'
            )}
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newName.trim() || newName === currentName}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white transition-colors text-sm font-medium disabled:opacity-50"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

interface MoveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newPath: string) => void;
  folders: string[];
  currentPath: string;
}

const MoveDialog = memo(function MoveDialog({
  isOpen,
  onClose,
  onConfirm,
  folders,
  currentPath,
}: MoveDialogProps) {
  const [selectedFolder, setSelectedFolder] = useState('/');

  useEffect(() => {
    if (isOpen) {
      setSelectedFolder('/');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-4">Move to Folder</h3>
        <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
          <button
            onClick={() => setSelectedFolder('/')}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-left text-sm transition-colors flex items-center gap-2',
              selectedFolder === '/'
                ? 'bg-white/10 text-white border border-white/30'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-transparent'
            )}
          >
            <FolderOpen className="w-4 h-4" />
            Root /
          </button>
          {folders
            .filter((f) => f !== '/' && f !== currentPath)
            .map((folder) => (
              <button
                key={folder}
                onClick={() => setSelectedFolder(folder)}
                className={cn(
                  'w-full px-3 py-2 rounded-lg text-left text-sm transition-colors flex items-center gap-2',
                  selectedFolder === folder
                    ? 'bg-white/10 text-white border border-white/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-transparent'
                )}
              >
                <FolderOpen className="w-4 h-4" />
                {folder}
              </button>
            ))}
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedFolder)}
            disabled={selectedFolder === currentPath}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white transition-colors text-sm font-medium disabled:opacity-50"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
});

interface VersionHistoryProps {
  versions: AssetVersion[];
}

const VersionHistory = memo(function VersionHistory({ versions }: VersionHistoryProps) {
  if (versions.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-zinc-800">
      <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
        <History className="w-4 h-4" />
        Version History
      </h4>
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {versions.map((version) => (
          <div
            key={version.id}
            className="flex items-center justify-between text-xs text-zinc-500 px-3 py-2 bg-zinc-800/50 rounded-lg"
          >
            <span>Version {version.versionNumber}</span>
            <span>{new Date(version.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

const SimpleVideoPlayer = memo(function SimpleVideoPlayer({
  src,
  poster,
  className,
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);

  const handlePlay = useCallback(() => {
    if (videoRef) {
      if (isPlaying) {
        videoRef.pause();
      } else {
        videoRef.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [videoRef, isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef) {
      setProgress((videoRef.currentTime / videoRef.duration) * 100);
    }
  }, [videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef) {
      setDuration(videoRef.duration);
    }
  }, [videoRef]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (videoRef) {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        videoRef.currentTime = percent * videoRef.duration;
      }
    },
    [videoRef]
  );

  const handleFullscreen = useCallback(() => {
    if (videoRef) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.requestFullscreen();
      }
    }
  }, [videoRef]);

  return (
    <div className={cn('relative group', className)}>
      <video
        ref={setVideoRef}
        src={src}
        poster={poster}
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        className="w-full max-h-[60vh] object-contain bg-black"
      />

      {/* Controls overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Progress bar */}
        <div
          className="h-1 bg-zinc-600 rounded-full mb-3 cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-white/70 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlay}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>

          <span className="text-xs text-white/70 flex-1">
            {formatDuration(duration)}
          </span>

          <button
            onClick={handleFullscreen}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Play button overlay */}
      {!isPlaying && (
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </div>
        </button>
      )}
    </div>
  );
});

// ==================== Main Component ====================

export const AssetPreviewModal = memo(function AssetPreviewModal() {
  // Store state
  const previewAsset = useLibraryStore((state) => state.previewAsset);
  const previewVersions = useLibraryStore((state) => state.previewVersions);
  const folders = useLibraryStore((state) => state.folders);
  const assets = useLibraryStore((state) => state.assets);

  // Store actions
  const closePreview = useLibraryStore((state) => state.closePreview);
  const downloadAsset = useLibraryStore((state) => state.downloadAsset);
  const showInFolder = useLibraryStore((state) => state.showInFolder);
  const deleteAsset = useLibraryStore((state) => state.deleteAsset);
  const renameAsset = useLibraryStore((state) => state.renameAsset);
  const moveAsset = useLibraryStore((state) => state.moveAsset);
  const openPreview = useLibraryStore((state) => state.openPreview);

  // Local state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  // Find current asset index for navigation
  const currentIndex = previewAsset ? assets.findIndex((a) => a.id === previewAsset.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < assets.length - 1;

  // Handlers
  const handleDownload = useCallback(async () => {
    if (previewAsset) {
      const savedPath = await downloadAsset(previewAsset);
      if (savedPath) {
        setLastSavedPath(savedPath);
      }
    }
  }, [previewAsset, downloadAsset]);

  const handleShowInFolder = useCallback(() => {
    if (lastSavedPath) {
      showInFolder(lastSavedPath);
    }
  }, [lastSavedPath, showInFolder]);

  const handleDelete = useCallback(async () => {
    if (previewAsset) {
      await deleteAsset(previewAsset.id);
      closePreview();
    }
  }, [previewAsset, deleteAsset, closePreview]);

  const handleRename = useCallback(
    (newName: string) => {
      if (previewAsset) {
        renameAsset(previewAsset.id, newName);
        setShowRenameDialog(false);
      }
    },
    [previewAsset, renameAsset]
  );

  const handleMove = useCallback(
    (newPath: string) => {
      if (previewAsset) {
        moveAsset(previewAsset.id, newPath);
        setShowMoveDialog(false);
      }
    },
    [previewAsset, moveAsset]
  );

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      openPreview(assets[currentIndex - 1]);
    }
  }, [hasPrev, assets, currentIndex, openPreview]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      openPreview(assets[currentIndex + 1]);
    }
  }, [hasNext, assets, currentIndex, openPreview]);

  // Keyboard handler
  useEffect(() => {
    if (!previewAsset) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showDeleteConfirm || showRenameDialog || showMoveDialog) return;

      switch (e.key) {
        case 'Escape':
          closePreview();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    previewAsset,
    showDeleteConfirm,
    showRenameDialog,
    showMoveDialog,
    closePreview,
    handlePrev,
    handleNext,
  ]);

  // Don't render if no preview asset
  if (!previewAsset) return null;

  const isVideo = previewAsset.assetType === 'VIDEO';
  const mediaUrl = previewAsset.publicUrl || previewAsset.previewUrl;
  const thumbnailUrl = previewAsset.thumbnailUrl;
  const metadata = (previewAsset.metadata || {}) as Record<string, unknown>;
  const prompt = metadata.prompt as string | undefined;
  const resolution = metadata.resolution as string | undefined;
  const durationSec = metadata.duration as number | undefined;

  // Format file size
  const fileSize = formatFileSize(previewAsset.sizeBytes);

  // Format date
  const createdDate = new Date(previewAsset.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
        onClick={closePreview}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 pointer-events-none">
        <div
          className={cn(
            'relative w-full max-w-5xl max-h-[90vh] overflow-hidden',
            'bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl',
            'flex flex-col pointer-events-auto'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={closePreview}
            className={cn(
              'absolute top-4 right-4 z-20 p-2 rounded-lg',
              'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700',
              'transition-colors'
            )}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Navigation arrows */}
          {hasPrev && (
            <button
              onClick={handlePrev}
              className={cn(
                'absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-lg',
                'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700',
                'transition-colors'
              )}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={handleNext}
              className={cn(
                'absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-lg',
                'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700',
                'transition-colors'
              )}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Media preview */}
            <div className="relative rounded-xl overflow-hidden bg-zinc-800 mb-6">
              {isVideo && mediaUrl ? (
                <SimpleVideoPlayer src={mediaUrl} poster={thumbnailUrl} />
              ) : mediaUrl ? (
                <img
                  src={mediaUrl}
                  alt={previewAsset.name}
                  className="w-full max-h-[60vh] object-contain mx-auto"
                  loading="eager"
                />
              ) : (
                <div className="w-full h-64 flex items-center justify-center">
                  {isVideo ? (
                    <Video className="w-16 h-16 text-zinc-600" />
                  ) : (
                    <ImageIcon className="w-16 h-16 text-zinc-600" />
                  )}
                </div>
              )}
            </div>

            {/* Asset info */}
            <div className="space-y-4">
              {/* Name and type badge */}
              <div className="flex items-start gap-3">
                <h2 className="text-xl font-semibold text-white flex-1">{previewAsset.name}</h2>
                <span
                  className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium',
                    isVideo ? 'bg-blue-600/20 text-blue-400' : 'bg-white/10 text-white'
                  )}
                >
                  {isVideo ? 'VIDEO' : 'IMAGE'}
                </span>
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                {resolution && (
                  <span className="flex items-center gap-1.5">
                    <Maximize className="w-4 h-4" />
                    {resolution}
                  </span>
                )}
                {isVideo && durationSec && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {formatDuration(durationSec)}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  {fileSize}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {createdDate}
                </span>
                {previewAsset.path && previewAsset.path !== '/' && (
                  <span className="flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4" />
                    {previewAsset.path}
                  </span>
                )}
              </div>

              {/* Prompt */}
              {prompt && (
                <div className="p-4 bg-zinc-800/50 rounded-lg">
                  <p className="text-xs text-zinc-500 mb-1">Prompt</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">{prompt}</p>
                </div>
              )}

              {/* Version history */}
              <VersionHistory versions={previewVersions} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex-shrink-0 p-4 border-t border-zinc-800 bg-zinc-900/50">
            <div className="flex flex-wrap items-center gap-3">
              {/* Primary actions */}
              <DownloadDropdown
                onDownload={handleDownload}
                onShowInFolder={handleShowInFolder}
                disabled={false}
                lastSavedPath={lastSavedPath}
              />

              <button
                onClick={() => setShowRenameDialog(true)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg',
                  'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white',
                  'transition-colors text-sm font-medium'
                )}
              >
                <Edit className="w-4 h-4" />
                Rename
              </button>

              <button
                onClick={() => setShowMoveDialog(true)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg',
                  'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white',
                  'transition-colors text-sm font-medium'
                )}
              >
                <FolderInput className="w-4 h-4" />
                Move
              </button>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Asset index indicator */}
              {assets.length > 1 && (
                <span className="text-xs text-zinc-500">
                  {currentIndex + 1} / {assets.length}
                </span>
              )}

              {/* Delete button */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg',
                  'bg-zinc-800 text-zinc-400 hover:bg-red-600/20 hover:text-red-400',
                  'transition-colors text-sm font-medium'
                )}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={`Delete ${previewAsset.assetType === 'VIDEO' ? 'Video' : 'Image'}?`}
        message={`Are you sure you want to delete "${previewAsset.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Rename dialog */}
      <RenameDialog
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onConfirm={handleRename}
        currentName={previewAsset.name}
      />

      {/* Move dialog */}
      <MoveDialog
        isOpen={showMoveDialog}
        onClose={() => setShowMoveDialog(false)}
        onConfirm={handleMove}
        folders={folders}
        currentPath={previewAsset.path || '/'}
      />
    </>
  );
});

export default AssetPreviewModal;
