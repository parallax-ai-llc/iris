/**
 * StoragePage — Cloud storage with Iris design tokens
 */

import { memo, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  HardDrive,
  Search,
  Grid,
  List,
  ChevronDown,
  Trash2,
  RefreshCw,
  ChevronRight,
  Home,
  X,
  Check,
  Upload,
  FolderPlus,
  FolderOpen,
  File,
  FileText,
  Image,
  Video,
  Music,
  Download,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';
import {
  useStorageStore,
  STORAGE_SORT_OPTIONS,
} from '@/features/storage/stores/storage.store';
import type { StorageFile } from '@/shared/api/storage.api';
import { useRequiresServer } from '@/shared/hooks/useRequiresServer';
import { ServerRequiredOverlay } from '@/shared/components/common/ServerRequiredOverlay';
import { ConfirmDialog } from '@/shared/components/ui/Modal';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(file: StorageFile) {
  if (file.isDirectory) return FolderOpen;
  const ct = file.contentType || '';
  if (ct.startsWith('image/')) return Image;
  if (ct.startsWith('video/')) return Video;
  if (ct.startsWith('audio/')) return Music;
  if (ct.startsWith('text/') || ct.includes('pdf') || ct.includes('document')) return FileText;
  return File;
}

function getFileIconClass(file: StorageFile): string {
  if (file.isDirectory) return 'dt-file-icon folder';
  const ct = file.contentType || '';
  if (ct.startsWith('image/')) return 'dt-file-icon image';
  if (ct.startsWith('video/')) return 'dt-file-icon video';
  if (ct.startsWith('audio/')) return 'dt-file-icon audio';
  return 'dt-file-icon';
}

const Breadcrumb = memo(function Breadcrumb({
  currentPath,
  onNavigate,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const parts = useMemo(
    () => (currentPath ? currentPath.split('/').filter(Boolean) : []),
    [currentPath]
  );

  return (
    <div className="dt-bread">
      <button onClick={() => onNavigate('')} className="dt-bread-chip">
        <Home className="w-3.5 h-3.5" />
        Root
      </button>
      {parts.map((part, index) => {
        const path = parts.slice(0, index + 1).join('/');
        return (
          <div key={path} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-4)' }} />
            <button onClick={() => onNavigate(path)} className="dt-bread-chip">
              {part}
            </button>
          </div>
        );
      })}
    </div>
  );
});

const QuotaChip = memo(function QuotaChip({
  storageInfo,
}: {
  storageInfo: {
    totalSize: number;
    quota?: number;
    quotaUsagePercent?: number;
    fileCount: number;
  } | null;
}) {
  if (!storageInfo) return null;
  const percent = storageInfo.quotaUsagePercent ?? 0;

  return (
    <div className="dt-quota">
      <HardDrive className="w-3.5 h-3.5" />
      <span>
        {formatFileSize(storageInfo.totalSize)}
        {storageInfo.quota && ` / ${formatFileSize(storageInfo.quota)}`}
      </span>
      {storageInfo.quota && (
        <div className="dt-quota-bar">
          <div className="dt-quota-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      )}
      <span style={{ color: 'var(--text-4)' }}>{storageInfo.fileCount} files</span>
    </div>
  );
});

const SortDropdown = memo(function SortDropdown({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value)?.label || 'Sort';

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)} className="btn btn-sm">
        {selected}
        <ChevronDown className="w-3 h-3" />
      </button>
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-20 py-1 glass-strong"
          style={{ borderRadius: 10, minWidth: 180 }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className="flex items-center gap-2 w-full text-left"
              style={{
                padding: '8px 12px',
                fontSize: 12,
                color: option.value === value ? 'var(--text-1)' : 'var(--text-2)',
                background: option.value === value ? 'var(--surf-2)' : 'transparent',
              }}
            >
              {option.value === value && <Check className="w-3 h-3" />}
              <span className={option.value === value ? '' : 'ml-[18px]'}>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

interface FileItemProps {
  file: StorageFile;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  onNavigate: (path: string) => void;
  onToggleSelect: (path: string) => void;
  onDownload: (file: StorageFile) => void;
  onDelete: (file: StorageFile) => void;
  onRename: (file: StorageFile) => void;
}

const FileItem = memo(function FileItem({
  file,
  isSelected,
  viewMode,
  onNavigate,
  onToggleSelect,
  onDownload,
  onDelete,
  onRename,
}: FileItemProps) {
  const [showActions, setShowActions] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const Icon = getFileIcon(file);
  const iconClass = getFileIconClass(file);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (file.isDirectory) onNavigate(file.path);
  }, [file, onNavigate]);

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleSelect(file.path);
    },
    [file.path, onToggleSelect]
  );

  if (viewMode === 'grid') {
    return (
      <div
        className="dt-file relative"
        onDoubleClick={handleDoubleClick}
        style={
          isSelected
            ? { background: 'var(--iris-grad-soft)', borderColor: 'rgba(167,139,250,0.32)' }
            : undefined
        }
      >
        <button
          onClick={handleCheckboxClick}
          className="absolute top-2 left-2 flex items-center justify-center transition-all"
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: '1px solid var(--line-3)',
            background: isSelected ? 'var(--iris-violet)' : 'transparent',
            opacity: isSelected ? 1 : 0,
          }}
        >
          {isSelected && <Check className="w-3 h-3" style={{ color: '#0a0a0c' }} />}
        </button>

        <div className="absolute top-2 right-2" ref={actionsRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowActions(!showActions);
            }}
            style={{
              padding: 4,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-4)',
              cursor: 'pointer',
            }}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {showActions && (
            <div
              className="absolute right-0 top-full mt-1 z-30 glass-strong"
              style={{ borderRadius: 10, minWidth: 140 }}
            >
              {!file.isDirectory && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(file);
                    setShowActions(false);
                  }}
                  className="flex items-center gap-2 w-full text-left"
                  style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-2)' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRename(file);
                  setShowActions(false);
                }}
                className="flex items-center gap-2 w-full text-left"
                style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-2)' }}
              >
                <Pencil className="w-3.5 h-3.5" />
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(file);
                  setShowActions(false);
                }}
                className="flex items-center gap-2 w-full text-left"
                style={{ padding: '8px 12px', fontSize: 12, color: 'var(--err)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>

        <div className={iconClass}>
          <Icon className="w-7 h-7" />
        </div>
        <span className="dt-file-name" title={file.name}>
          {file.name}
        </span>
        {!file.isDirectory && (
          <span className="dt-file-size">{formatFileSize(file.size)}</span>
        )}
      </div>
    );
  }

  return (
    <button
      className="dt-file-row"
      onDoubleClick={handleDoubleClick}
      onClick={handleCheckboxClick}
      style={
        isSelected
          ? { background: 'var(--iris-grad-soft)' }
          : undefined
      }
    >
      <div className="dt-file-row-name">
        <div className={iconClass}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="dt-file-row-name-text" title={file.name}>
          {file.name}
        </span>
      </div>
      <div className="dt-file-row-kind">
        {file.isDirectory ? 'FOLDER' : (file.contentType || 'FILE').split('/')[0]}
      </div>
      <div className="dt-file-row-size">
        {file.isDirectory ? '—' : formatFileSize(file.size)}
      </div>
      <div className="dt-file-row-modified">
        {new Date(file.updated).toLocaleDateString()}
      </div>
      <div className="dt-file-row-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(file);
          }}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </button>
  );
});

const CreateFolderDialog = memo(function CreateFolderDialog({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    if (isOpen) setFolderName('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (folderName.trim()) {
      onCreate(folderName.trim());
      onClose();
    }
  };

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div className="dt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-head">
          <div className="dt-modal-title">New Folder</div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Folder name"
            className="iris-input"
            autoFocus
          />
          <div className="dt-modal-actions mt-4">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={!folderName.trim()} className="btn btn-primary">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

const RenameDialog = memo(function RenameDialog({
  isOpen,
  file,
  onClose,
  onRename,
}: {
  isOpen: boolean;
  file: StorageFile | null;
  onClose: () => void;
  onRename: (oldPath: string, newName: string) => void;
}) {
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (isOpen && file) setNewName(file.name);
  }, [isOpen, file]);

  if (!isOpen || !file) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName.trim() !== file.name) {
      onRename(file.path, newName.trim());
      onClose();
    }
  };

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div className="dt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-head">
          <div className="dt-modal-title">Rename</div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New name"
            className="iris-input"
            autoFocus
          />
          <div className="dt-modal-actions mt-4">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newName.trim() || newName.trim() === file.name}
              className="btn btn-primary"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

function StoragePageContent() {
  const files = useStorageStore((s) => s.files);
  const currentPath = useStorageStore((s) => s.currentPath);
  const storageInfo = useStorageStore((s) => s.storageInfo);
  const selectedFiles = useStorageStore((s) => s.selectedFiles);
  const isLoading = useStorageStore((s) => s.isLoading);
  const isUploading = useStorageStore((s) => s.isUploading);
  const error = useStorageStore((s) => s.error);
  const viewMode = useStorageStore((s) => s.viewMode);
  const searchQuery = useStorageStore((s) => s.searchQuery);
  const sortBy = useStorageStore((s) => s.sortBy);
  const isDragOver = useStorageStore((s) => s.isDragOver);

  const fetchFiles = useStorageStore((s) => s.fetchFiles);
  const fetchStorageInfo = useStorageStore((s) => s.fetchStorageInfo);
  const refresh = useStorageStore((s) => s.refresh);
  const uploadFiles = useStorageStore((s) => s.uploadFiles);
  const downloadFile = useStorageStore((s) => s.downloadFile);
  const deleteFile = useStorageStore((s) => s.deleteFile);
  const deleteSelectedFiles = useStorageStore((s) => s.deleteSelectedFiles);
  const createDirectory = useStorageStore((s) => s.createDirectory);
  const renameFile = useStorageStore((s) => s.renameFile);
  const navigateTo = useStorageStore((s) => s.navigateTo);
  const toggleFileSelection = useStorageStore((s) => s.toggleFileSelection);
  const selectAll = useStorageStore((s) => s.selectAll);
  const clearSelection = useStorageStore((s) => s.clearSelection);
  const setViewMode = useStorageStore((s) => s.setViewMode);
  const setSearchQuery = useStorageStore((s) => s.setSearchQuery);
  const setSortBy = useStorageStore((s) => s.setSortBy);
  const setDragOver = useStorageStore((s) => s.setDragOver);
  const getFilteredFiles = useStorageStore((s) => s.getFilteredFiles);
  const clearError = useStorageStore((s) => s.clearError);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState<StorageFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageFile | null>(null);

  useEffect(() => {
    fetchFiles();
    fetchStorageInfo();
  }, [fetchFiles, fetchStorageInfo]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredFiles = useMemo(() => getFilteredFiles(), [files, searchQuery, sortBy, getFilteredFiles]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (fileList && fileList.length > 0) {
        uploadFiles(Array.from(fileList));
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const fileList = e.dataTransfer.files;
      if (fileList.length > 0) uploadFiles(Array.from(fileList));
    },
    [uploadFiles, setDragOver]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    [setDragOver]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
    },
    [setDragOver]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) deleteFile(deleteTarget.path, deleteTarget.isDirectory);
  }, [deleteTarget, deleteFile]);

  return (
    <div
      className="dt-page-wide"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      <div className="dt-page-head">
        <div>
          <div className="dt-page-eyebrow">Storage</div>
          <h1 className="dt-page-title">
            Cloud <em>storage</em>
          </h1>
          <QuotaChip storageInfo={storageInfo} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="dt-seg">
            <button
              onClick={() => setViewMode('grid')}
              className="dt-seg-item"
              data-active={viewMode === 'grid'}
              title="Grid"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="dt-seg-item"
              data-active={viewMode === 'list'}
              title="List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Breadcrumb currentPath={currentPath} onNavigate={navigateTo} />
        <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
          <div className="relative" style={{ width: 220 }}>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: 'var(--text-4)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files…"
              className="iris-input"
              style={{ paddingLeft: 32, paddingRight: 32, height: 32 }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <SortDropdown options={STORAGE_SORT_OPTIONS} value={sortBy} onChange={(v) => setSortBy(v as typeof sortBy)} />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="btn btn-primary"
        >
          <Upload className="w-4 h-4" />
          {isUploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        <button onClick={() => setShowCreateFolder(true)} className="btn">
          <FolderPlus className="w-4 h-4" />
          New folder
        </button>

        {selectedFiles.size > 0 && (
          <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
            <span className="t-eyebrow">
              {selectedFiles.size}/{files.length} selected
            </span>
            <button
              onClick={selectedFiles.size === files.length ? clearSelection : selectAll}
              className="btn btn-sm"
            >
              {selectedFiles.size === files.length ? 'Deselect' : 'Select all'}
            </button>
            <button onClick={deleteSelectedFiles} className="btn btn-sm btn-danger">
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {isDragOver && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'var(--iris-grad-soft)',
            border: '2px dashed rgba(167,139,250,0.5)',
            borderRadius: 16,
            margin: 16,
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-10 h-10" style={{ color: 'var(--iris-violet)' }} />
            <span style={{ color: 'var(--iris-violet)', fontWeight: 500 }}>Drop files to upload</span>
          </div>
        </div>
      )}

      {error && (
        <div
          className="flex items-center justify-between mb-4"
          style={{
            padding: '10px 14px',
            background: 'var(--err-bg)',
            border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 12,
          }}
        >
          <span style={{ color: 'var(--err)', fontSize: 13 }}>{error}</span>
          <button onClick={clearError} style={{ color: 'var(--err)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div
          className={viewMode === 'grid' ? 'dt-file-grid' : 'dt-file-list'}
          style={viewMode === 'grid' ? undefined : { padding: 0 }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="img-ph"
              style={{
                height: viewMode === 'grid' ? 110 : 44,
                borderRadius: viewMode === 'grid' ? 12 : 0,
              }}
            />
          ))}
        </div>
      ) : filteredFiles.length === 0 ? (
        <div
          className="iris-card flex flex-col items-center justify-center text-center"
          style={{ padding: 48 }}
        >
          <HardDrive className="w-10 h-10 mb-3" style={{ color: 'var(--text-4)' }} />
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', fontWeight: 500 }}>
            {searchQuery ? 'No files match your search' : 'No files yet'}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 4 }}>
            {searchQuery ? 'Try a different search term' : 'Upload files or create a folder to get started'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="dt-file-grid">
          {filteredFiles.map((file) => (
            <FileItem
              key={file.path}
              file={file}
              isSelected={selectedFiles.has(file.path)}
              viewMode="grid"
              onNavigate={navigateTo}
              onToggleSelect={toggleFileSelection}
              onDownload={downloadFile}
              onDelete={(f) => setDeleteTarget(f)}
              onRename={(f) => setRenameTarget(f)}
            />
          ))}
        </div>
      ) : (
        <div className="dt-file-list">
          <div className="dt-file-list-head">
            <span>Name</span>
            <span>Kind</span>
            <span style={{ textAlign: 'right' }}>Size</span>
            <span>Modified</span>
            <span />
          </div>
          {filteredFiles.map((file) => (
            <FileItem
              key={file.path}
              file={file}
              isSelected={selectedFiles.has(file.path)}
              viewMode="list"
              onNavigate={navigateTo}
              onToggleSelect={toggleFileSelection}
              onDownload={downloadFile}
              onDelete={(f) => setDeleteTarget(f)}
              onRename={(f) => setRenameTarget(f)}
            />
          ))}
        </div>
      )}

      <CreateFolderDialog
        isOpen={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onCreate={createDirectory}
      />
      <RenameDialog
        isOpen={!!renameTarget}
        file={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={renameFile}
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          handleDeleteConfirm();
          setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.isDirectory ? 'folder' : 'file'}`}
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"?${
                deleteTarget.isDirectory ? ' This will delete all contents inside.' : ''
              }`
            : ''
        }
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}

export const StoragePage = memo(function StoragePage() {
  const { isServerConnected } = useRequiresServer();
  if (!isServerConnected) return <ServerRequiredOverlay pageName="Storage" />;
  return <StoragePageContent />;
});

export default StoragePage;
