/**
 * ImportMediaModal - Select from gallery or import local media files
 */

import { memo, useState, useEffect, useCallback } from 'react';
import {
  X,
  Plus,
  Video,
  Image,
  Check,
  FolderOpen,
  FileVideo,
  FileImage,
  Loader2,
  FileAudio,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { IS_SELF_HOST } from '@/config/self-host';
import { useLibraryStore } from '@/features/library/stores/library.store';
import { useCachedAssetUrl } from '@/shared/hooks/useCachedAssetUrl';
import type { IrisAsset } from '@/shared/api/types';

export interface LocalFileImport {
  path: string;
  name: string;
  type: string;
  size: number;
  mediaType: 'video' | 'image' | 'audio';
}

// ==================== File type constants ====================

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'aac', 'flac'];
const ALL_EXTENSIONS = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS];

/** Determine media type from file extension */
function getMediaTypeFromExt(filePath: string): 'video' | 'image' | 'audio' | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return null;
}

// ==================== CachedAssetThumbnail ====================

const CachedAssetThumbnail = memo(function CachedAssetThumbnail({
  asset,
  isSelected,
  onSelect,
}: {
  asset: IrisAsset;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const { url: cachedUrl, isLoading } = useCachedAssetUrl(asset, { type: 'thumbnail' });

  return (
    <div
      onClick={() => onSelect(asset.id)}
      className={cn(
        'relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all',
        isSelected
          ? 'border-white ring-2 ring-white/30'
          : 'border-transparent hover:border-zinc-600'
      )}
    >
      <div className="aspect-video bg-zinc-800">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
          </div>
        ) : cachedUrl ? (
          <img
            src={cachedUrl}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {asset.assetType === 'VIDEO' && <Video className="w-8 h-8 text-zinc-600" />}
            {asset.assetType === 'IMAGE' && <Image className="w-8 h-8 text-zinc-600" />}
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-sm text-white truncate">{asset.name}</p>
        <p className="text-xs text-zinc-500 capitalize">{asset.assetType.toLowerCase()}</p>
      </div>
      {isSelected && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center">
          <Check className="w-4 h-4 text-black" />
        </div>
      )}
    </div>
  );
});

// ==================== ImportMediaModal ====================

interface ImportMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (assets: IrisAsset[]) => void;
  onImportLocalFiles?: (files: LocalFileImport[]) => void;
}

export const ImportMediaModal = memo(function ImportMediaModal({
  isOpen,
  onClose,
  onImport,
  onImportLocalFiles,
}: ImportMediaModalProps) {
  const assets = useLibraryStore((s) => s.assets);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const fetchAssets = useLibraryStore((s) => s.fetchAssets);

  // Self-host has no cloud gallery — only local-file import.
  const [activeTab, setActiveTab] = useState<'gallery' | 'import'>(
    IS_SELF_HOST ? 'import' : 'gallery',
  );
  const [filter, setFilter] = useState<'all' | 'VIDEO' | 'IMAGE'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Import states
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importedFiles, setImportedFiles] = useState<LocalFileImport[]>([]);

  // Fetch assets on mount
  useEffect(() => {
    if (isOpen) {
      // No cloud gallery in self-host — don't fetch cloud assets, open Import.
      if (!IS_SELF_HOST) fetchAssets();
      setSelectedIds(new Set());
      setActiveTab(IS_SELF_HOST ? 'import' : 'gallery');
      setIsImporting(false);
      setImportedFiles([]);
    }
  }, [isOpen, fetchAssets]);

  /** Convert file paths to LocalFileImport and dispatch */
  const dispatchLocalFiles = useCallback((filePaths: string[]) => {
    const localFiles: LocalFileImport[] = filePaths
      .map((filePath) => {
        const name = filePath.split(/[/\\]/).pop() || filePath;
        const mediaType = getMediaTypeFromExt(filePath);
        if (!mediaType) return null;
        return { path: filePath, name, type: '', size: 0, mediaType };
      })
      .filter((f): f is LocalFileImport => f !== null);

    if (localFiles.length === 0) return;

    setImportedFiles((prev) => [...prev, ...localFiles]);
    if (onImportLocalFiles) {
      onImportLocalFiles(localFiles);
      onClose();
    }
  }, [onImportLocalFiles, onClose]);

  /** Browse button — use Electron's native file dialog (returns full paths) */
  const handleBrowseFiles = useCallback(async () => {
    try {
      const paths = await window.electronAPI.files.selectFiles({
        filters: [{ name: 'Media Files', extensions: ALL_EXTENSIONS }],
      });
      if (paths && paths.length > 0) {
        dispatchLocalFiles(paths);
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err);
    }
  }, [dispatchLocalFiles]);

  /** Drag-drop — use webUtils.getPathForFile to resolve local path */
  const handleDropFiles = useCallback((files: File[]) => {
    const paths: string[] = [];
    for (const file of files) {
      try {
        const filePath = window.electronAPI.files.getPathForFile(file);
        if (filePath && getMediaTypeFromExt(filePath)) {
          paths.push(filePath);
        }
      } catch {
        // getPathForFile not available — skip
      }
    }
    if (paths.length > 0) {
      dispatchLocalFiles(paths);
    }
  }, [dispatchLocalFiles]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleDropFiles(files);
    }
  }, [handleDropFiles]);

  if (!isOpen) return null;

  const filteredAssets = assets.filter((asset) => {
    if (filter === 'all') return true;
    return asset.assetType === filter;
  });

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleImport = () => {
    const selected = assets.filter((a) => selectedIds.has(a.id));
    onImport(selected);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Import Media
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Tabs: Gallery / Import */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            {!IS_SELF_HOST && (
              <button
                onClick={() => setActiveTab('gallery')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                  activeTab === 'gallery'
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                )}
              >
                <Video className="w-4 h-4" />
                Gallery
              </button>
            )}
            <button
              onClick={() => setActiveTab('import')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                activeTab === 'import'
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              )}
            >
              <FolderOpen className="w-4 h-4" />
              Import
            </button>
          </div>

          {activeTab === 'gallery' && (
            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-zinc-700">
              {([
                { key: 'all', label: 'All', icon: Video },
                { key: 'VIDEO', label: 'Video', icon: FileVideo },
                { key: 'IMAGE', label: 'Image', icon: FileImage },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
                    filter === key
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'import' ? (
            <div
              className={cn(
                'h-full min-h-[300px] border-2 border-dashed rounded-xl transition-colors flex flex-col items-center justify-center',
                isDragging
                  ? 'border-white bg-zinc-800/50'
                  : 'border-zinc-700 hover:border-zinc-500'
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {isImporting ? (
                <div className="w-full max-w-md space-y-3 p-4">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    <p className="text-sm text-zinc-400 text-center">Importing...</p>
                  </div>
                </div>
              ) : (
                <>
                  <FolderOpen className={cn(
                    'w-12 h-12 mb-4 transition-colors',
                    isDragging ? 'text-white' : 'text-zinc-500'
                  )} />
                  <p className={cn(
                    'text-lg font-medium mb-2 transition-colors',
                    isDragging ? 'text-white' : 'text-zinc-300'
                  )}>
                    {isDragging ? 'Drop files here' : 'Drag & drop files here'}
                  </p>
                  <p className="text-sm text-zinc-500 mb-4">
                    or click to browse your local files
                  </p>
                  <button
                    onClick={handleBrowseFiles}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Browse Files
                  </button>
                  <p className="text-xs text-zinc-600 mt-4">
                    Supported: MP4, WebM, MOV, JPG, PNG, GIF, MP3, WAV, and more
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Files will be referenced from their current location, not copied
                  </p>
                </>
              )}

              {importedFiles.length > 0 && !isImporting && (
                <div className="w-full mt-6 pt-6 border-t border-zinc-800">
                  <p className="text-sm text-zinc-400 mb-3 px-4">Recently imported:</p>
                  <div className="grid grid-cols-4 gap-3 px-4">
                    {importedFiles.map((file) => (
                      <div
                        key={file.path}
                        className="relative rounded-lg overflow-hidden border-2 border-zinc-700 bg-zinc-800"
                      >
                        <div className="aspect-video flex items-center justify-center">
                          {file.mediaType === 'video' && <FileVideo className="w-8 h-8 text-zinc-500" />}
                          {file.mediaType === 'image' && <FileImage className="w-8 h-8 text-zinc-500" />}
                          {file.mediaType === 'audio' && <FileAudio className="w-8 h-8 text-zinc-500" />}
                        </div>
                        <div className="p-2">
                          <p className="text-sm text-white truncate">{file.name}</p>
                          <p className="text-xs text-zinc-500 capitalize">{file.mediaType}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                  <Video className="w-12 h-12 mb-3" />
                  <p>No {filter === 'all' ? 'media' : filter.toLowerCase()} assets found</p>
                  <button
                    onClick={() => setActiveTab('import')}
                    className="mt-4 text-sm text-zinc-400 hover:text-white underline"
                  >
                    Import from local files
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {filteredAssets.map((asset) => (
                    <CachedAssetThumbnail
                      key={asset.id}
                      asset={asset}
                      isSelected={selectedIds.has(asset.id)}
                      onSelect={toggleSelect}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-zinc-800">
          <span className="text-sm text-zinc-400">
            {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selectedIds.size === 0}
              className={cn(
                'px-4 py-2 rounded-lg transition-colors flex items-center gap-2 font-medium',
                selectedIds.size > 0
                  ? 'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white'
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              )}
            >
              <Plus className="w-4 h-4" />
              Import Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
