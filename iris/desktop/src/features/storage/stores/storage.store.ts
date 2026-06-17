import { create } from 'zustand';
import {
  StorageFile,
  StorageInfo,
  listStorageFiles,
  uploadStorageFile,
  downloadStorageFile,
  deleteStorageFile,
  createStorageDirectory,
  moveStorageFile,
  getStorageInfo,
} from '@/shared/api/storage.api';

// ==================== Types ====================

export type StorageSortOption = 'name-asc' | 'name-desc' | 'size-asc' | 'size-desc' | 'newest' | 'oldest';
export type StorageViewMode = 'grid' | 'list';

export const STORAGE_SORT_OPTIONS: { value: StorageSortOption; label: string }[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'size-asc', label: 'Size (Small first)' },
  { value: 'size-desc', label: 'Size (Large first)' },
];

interface StorageState {
  files: StorageFile[];
  currentPath: string;
  storageInfo: StorageInfo | null;
  selectedFiles: Set<string>;
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  viewMode: StorageViewMode;
  searchQuery: string;
  sortBy: StorageSortOption;
  isDragOver: boolean;
}

interface StorageActions {
  fetchFiles: (path?: string) => Promise<void>;
  fetchStorageInfo: () => Promise<void>;
  refresh: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  downloadFile: (file: StorageFile) => Promise<void>;
  deleteFile: (path: string, recursive?: boolean) => Promise<void>;
  deleteSelectedFiles: () => Promise<void>;
  createDirectory: (folderName: string) => Promise<void>;
  renameFile: (oldPath: string, newName: string) => Promise<void>;
  navigateTo: (path: string) => void;
  navigateUp: () => void;
  toggleFileSelection: (path: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setViewMode: (mode: StorageViewMode) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: StorageSortOption) => void;
  setDragOver: (isDragOver: boolean) => void;
  getFilteredFiles: () => StorageFile[];
  clearError: () => void;
}

// ==================== Store ====================

export const useStorageStore = create<StorageState & StorageActions>((set, get) => ({
  // Initial state
  files: [],
  currentPath: '',
  storageInfo: null,
  selectedFiles: new Set<string>(),
  isLoading: false,
  isUploading: false,
  error: null,
  viewMode: 'grid',
  searchQuery: '',
  sortBy: 'name-asc',
  isDragOver: false,

  fetchFiles: async (path?) => {
    const targetPath = path ?? get().currentPath;
    set({ isLoading: true, error: null, currentPath: targetPath });

    try {
      const response = await listStorageFiles(targetPath);
      if (response) {
        // Sort: directories first, then by name
        const sorted = [...response.items].sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        set({ files: sorted, isLoading: false });
      } else {
        set({ files: [], isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch files',
        isLoading: false,
      });
    }
  },

  fetchStorageInfo: async () => {
    try {
      const info = await getStorageInfo();
      if (info) {
        set({ storageInfo: info });
      }
    } catch {
      // Silently fail
    }
  },

  refresh: async () => {
    await Promise.all([get().fetchFiles(), get().fetchStorageInfo()]);
  },

  uploadFiles: async (files) => {
    set({ isUploading: true, error: null });
    const { currentPath } = get();

    try {
      for (const file of files) {
        await uploadStorageFile(file, currentPath);
      }
      set({ isUploading: false });
      await get().refresh();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to upload files',
        isUploading: false,
      });
    }
  },

  downloadFile: async (file) => {
    try {
      const success = await downloadStorageFile(file.path, file.name);
      if (!success) {
        set({ error: 'Failed to download file' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to download file',
      });
    }
  },

  deleteFile: async (path, recursive) => {
    try {
      const result = await deleteStorageFile(path, recursive);
      if (result?.success) {
        set((state) => ({
          selectedFiles: new Set([...state.selectedFiles].filter((p) => p !== path)),
        }));
        await get().refresh();
      } else {
        set({ error: 'Failed to delete file' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete file',
      });
    }
  },

  deleteSelectedFiles: async () => {
    const { selectedFiles } = get();
    if (selectedFiles.size === 0) return;

    try {
      for (const path of selectedFiles) {
        await deleteStorageFile(path);
      }
      set({ selectedFiles: new Set() });
      await get().refresh();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete files',
      });
    }
  },

  createDirectory: async (folderName) => {
    const { currentPath } = get();
    try {
      const result = await createStorageDirectory(currentPath, folderName);
      if (result?.success) {
        await get().refresh();
      } else {
        set({ error: 'Failed to create directory' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create directory',
      });
    }
  },

  renameFile: async (oldPath, newName) => {
    try {
      // Build destination path by replacing the file/folder name
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const destinationPath = parts.join('/');

      const result = await moveStorageFile(oldPath, destinationPath);
      if (result?.success) {
        await get().refresh();
      } else {
        set({ error: 'Failed to rename file' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to rename file',
      });
    }
  },

  navigateTo: (path) => {
    set({ selectedFiles: new Set(), searchQuery: '' });
    get().fetchFiles(path);
  },

  navigateUp: () => {
    const { currentPath } = get();
    if (!currentPath) return;

    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.join('/');
    get().navigateTo(parentPath);
  },

  toggleFileSelection: (path) => {
    set((state) => {
      const next = new Set(state.selectedFiles);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { selectedFiles: next };
    });
  },

  selectAll: () => {
    const { files } = get();
    set({ selectedFiles: new Set(files.map((f) => f.path)) });
  },

  clearSelection: () => {
    set({ selectedFiles: new Set() });
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  setSortBy: (sortBy) => {
    set({ sortBy });
  },

  setDragOver: (isDragOver) => set({ isDragOver }),

  getFilteredFiles: () => {
    const { files, searchQuery, sortBy } = get();

    let filtered = files;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = files.filter((f) => f.name.toLowerCase().includes(query));
    }

    // Apply sort (directories always first)
    const sorted = [...filtered].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'newest':
          return new Date(b.updated).getTime() - new Date(a.updated).getTime();
        case 'oldest':
          return new Date(a.updated).getTime() - new Date(b.updated).getTime();
        case 'size-asc':
          return a.size - b.size;
        case 'size-desc':
          return b.size - a.size;
        default:
          return 0;
      }
    });

    return sorted;
  },

  clearError: () => set({ error: null }),
}));
