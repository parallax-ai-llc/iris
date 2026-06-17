import { create } from 'zustand';
import { IrisAsset, AssetVersion, AssetType } from '@/shared/api/types';
import {
  getAssets,
  getAsset,
  deleteAsset as deleteAssetApi,
  deleteAssets as deleteAssetsApi,
  renameAsset,
  moveAsset,
  getAssetVersions,
  downloadAsset,
  getDownloadUrl,
  getFolders,
  getStorageStats,
  uploadAsset,
} from '@/shared/api/asset.api';

// ==================== Types ====================

export type LibrarySortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-asc' | 'size-desc';
export type LibraryFilterOption = 'all' | 'image' | 'video';
export type LibraryViewMode = 'grid' | 'list';

export const LIBRARY_SORT_OPTIONS: { value: LibrarySortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'size-asc', label: 'Size (Small first)' },
  { value: 'size-desc', label: 'Size (Large first)' },
];

export const LIBRARY_FILTER_OPTIONS: { value: LibraryFilterOption; label: string }[] = [
  { value: 'all', label: 'All Files' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
];

interface StorageStats {
  totalBytes: number;
  imageBytes: number;
  videoBytes: number;
  assetCount: number;
}

interface LibraryState {
  // Data
  assets: IrisAsset[];
  folders: string[];
  currentFolder: string;
  selectedAssets: Set<string>;
  storageStats: StorageStats | null;

  // Loading states
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;

  // View options
  viewMode: LibraryViewMode;
  sortBy: LibrarySortOption;
  filterBy: LibraryFilterOption;
  searchQuery: string;

  // Detail modal state
  previewAsset: IrisAsset | null;
  previewVersions: AssetVersion[];

  // Pagination
  page: number;
  totalPages: number;
  totalCount: number;
}

interface LibraryActions {
  // Data fetching
  fetchAssets: (folder?: string) => Promise<void>;
  fetchFolders: () => Promise<void>;
  fetchStorageStats: () => Promise<void>;
  refreshAsset: (assetId: string) => Promise<void>;

  // CRUD operations
  uploadFile: (file: File, assetType: AssetType) => Promise<IrisAsset | null>;
  deleteAsset: (assetId: string) => Promise<void>;
  deleteSelectedAssets: () => Promise<void>;
  renameAsset: (assetId: string, newName: string) => Promise<void>;
  moveAsset: (assetId: string, newPath: string) => Promise<void>;

  // Download
  downloadAsset: (asset: IrisAsset) => Promise<string | null>;
  getDownloadUrl: (assetId: string) => Promise<string | null>;
  showInFolder: (filePath: string) => Promise<void>;

  // Selection
  selectAsset: (assetId: string) => void;
  deselectAsset: (assetId: string) => void;
  toggleAssetSelection: (assetId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (assetId: string) => boolean;

  // Navigation
  setCurrentFolder: (folder: string) => void;
  navigateUp: () => void;

  // View options
  setViewMode: (mode: LibraryViewMode) => void;
  setSortBy: (sort: LibrarySortOption) => void;
  setFilterBy: (filter: LibraryFilterOption) => void;
  setSearchQuery: (query: string) => void;
  getFilteredAssets: () => IrisAsset[];

  // Preview modal
  openPreview: (asset: IrisAsset) => void;
  closePreview: () => void;

  // Pagination
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;

  // Error handling
  clearError: () => void;
}

// ==================== Initial States ====================

const initialViewState = {
  viewMode: 'grid' as LibraryViewMode,
  sortBy: 'newest' as LibrarySortOption,
  filterBy: 'all' as LibraryFilterOption,
  searchQuery: '',
};

const initialPaginationState = {
  page: 1,
  totalPages: 1,
  totalCount: 0,
};

const initialPreviewState = {
  previewAsset: null as IrisAsset | null,
  previewVersions: [] as AssetVersion[],
};

// ==================== Store ====================

export const useLibraryStore = create<LibraryState & LibraryActions>((set, get) => ({
  // Initial state
  assets: [],
  folders: [],
  currentFolder: '/',
  selectedAssets: new Set<string>(),
  storageStats: null,
  isLoading: false,
  isUploading: false,
  uploadProgress: 0,
  error: null,
  ...initialViewState,
  ...initialPaginationState,
  ...initialPreviewState,

  // Data fetching
  fetchAssets: async (folder) => {
    const targetFolder = folder ?? get().currentFolder;
    set({ isLoading: true, error: null, currentFolder: targetFolder });

    try {
      const { sortBy, filterBy, page } = get();

      // Map sort options to API params
      let apiSortBy: 'name' | 'createdAt' | 'updatedAt' | 'sizeBytes' = 'createdAt';
      let apiSortOrder: 'asc' | 'desc' = 'desc';

      switch (sortBy) {
        case 'newest':
          apiSortBy = 'createdAt';
          apiSortOrder = 'desc';
          break;
        case 'oldest':
          apiSortBy = 'createdAt';
          apiSortOrder = 'asc';
          break;
        case 'name-asc':
          apiSortBy = 'name';
          apiSortOrder = 'asc';
          break;
        case 'name-desc':
          apiSortBy = 'name';
          apiSortOrder = 'desc';
          break;
        case 'size-asc':
          apiSortBy = 'sizeBytes';
          apiSortOrder = 'asc';
          break;
        case 'size-desc':
          apiSortBy = 'sizeBytes';
          apiSortOrder = 'desc';
          break;
      }

      const response = await getAssets({
        type: filterBy === 'all' ? undefined : (filterBy.toUpperCase() as AssetType),
        sortBy: apiSortBy,
        sortOrder: apiSortOrder,
        page,
        limit: 50,
      });

      if (response) {
        set({
          assets: response.assets,
          totalPages: response.totalPages,
          totalCount: response.total,
          isLoading: false,
        });
      } else {
        set({ assets: [], isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch assets',
        isLoading: false,
      });
    }
  },

  fetchFolders: async () => {
    try {
      const folders = await getFolders();
      if (folders) {
        set({ folders });
      }
    } catch {
      // Silently fail - folders are optional
    }
  },

  fetchStorageStats: async () => {
    try {
      const stats = await getStorageStats();
      if (stats) {
        set({ storageStats: stats });
      }
    } catch {
      // Silently fail
    }
  },

  refreshAsset: async (assetId) => {
    try {
      const asset = await getAsset(assetId);
      if (asset) {
        set((state) => ({
          assets: state.assets.map((a) => (a.id === assetId ? asset : a)),
          previewAsset: state.previewAsset?.id === assetId ? asset : state.previewAsset,
        }));
      }
    } catch {
      // Silently fail
    }
  },

  // CRUD operations
  uploadFile: async (file, assetType) => {
    set({ isUploading: true, uploadProgress: 0, error: null });

    try {
      const asset = await uploadAsset(file, assetType, undefined, {
        onProgress: percent => set({ uploadProgress: percent }),
      });
      if (asset) {
        set((state) => ({
          assets: [asset, ...state.assets],
          isUploading: false,
          uploadProgress: 100,
        }));
        // Refresh stats
        get().fetchStorageStats();
        return asset;
      } else {
        set({ error: 'Failed to upload file', isUploading: false });
        return null;
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to upload file',
        isUploading: false,
      });
      return null;
    }
  },

  deleteAsset: async (assetId) => {
    try {
      const result = await deleteAssetApi(assetId);
      if (result.success) {
        set((state) => ({
          assets: state.assets.filter((a) => a.id !== assetId),
          selectedAssets: new Set([...state.selectedAssets].filter((id) => id !== assetId)),
          previewAsset: state.previewAsset?.id === assetId ? null : state.previewAsset,
        }));
        get().fetchStorageStats();
      } else {
        set({ error: result.error || 'Failed to delete asset' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete asset',
      });
    }
  },

  deleteSelectedAssets: async () => {
    const { selectedAssets } = get();
    if (selectedAssets.size === 0) return;

    try {
      const result = await deleteAssetsApi([...selectedAssets]);
      if (result.deleted > 0) {
        set((state) => ({
          assets: state.assets.filter((a) => !selectedAssets.has(a.id)),
          selectedAssets: new Set(),
        }));
        get().fetchStorageStats();
      }
      if (result.failed > 0) {
        set({ error: `Failed to delete ${result.failed} asset(s)` });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete assets',
      });
    }
  },

  renameAsset: async (assetId, newName) => {
    try {
      const updated = await renameAsset(assetId, newName);
      if (updated) {
        set((state) => ({
          assets: state.assets.map((a) => (a.id === assetId ? updated : a)),
          previewAsset: state.previewAsset?.id === assetId ? updated : state.previewAsset,
        }));
      } else {
        set({ error: 'Failed to rename asset' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to rename asset',
      });
    }
  },

  moveAsset: async (assetId, newPath) => {
    try {
      const updated = await moveAsset(assetId, newPath);
      if (updated) {
        // Remove from current view if moved to different folder
        const { currentFolder } = get();
        if (!newPath.startsWith(currentFolder)) {
          set((state) => ({
            assets: state.assets.filter((a) => a.id !== assetId),
          }));
        } else {
          set((state) => ({
            assets: state.assets.map((a) => (a.id === assetId ? updated : a)),
          }));
        }
        get().fetchFolders();
      } else {
        set({ error: 'Failed to move asset' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to move asset',
      });
    }
  },

  // Download
  downloadAsset: async (asset) => {
    try {
      const savedPath = await downloadAsset(asset);
      return savedPath;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to download asset',
      });
      return null;
    }
  },

  getDownloadUrl: async (assetId) => {
    return getDownloadUrl(assetId);
  },

  showInFolder: async (filePath) => {
    try {
      await window.electronAPI?.files?.showInFolder(filePath);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to open folder',
      });
    }
  },

  // Selection
  selectAsset: (assetId) => {
    set((state) => ({
      selectedAssets: new Set([...state.selectedAssets, assetId]),
    }));
  },

  deselectAsset: (assetId) => {
    set((state) => ({
      selectedAssets: new Set([...state.selectedAssets].filter((id) => id !== assetId)),
    }));
  },

  toggleAssetSelection: (assetId) => {
    const { selectedAssets } = get();
    if (selectedAssets.has(assetId)) {
      get().deselectAsset(assetId);
    } else {
      get().selectAsset(assetId);
    }
  },

  selectAll: () => {
    const { assets } = get();
    set({ selectedAssets: new Set(assets.map((a) => a.id)) });
  },

  clearSelection: () => {
    set({ selectedAssets: new Set() });
  },

  isSelected: (assetId) => {
    return get().selectedAssets.has(assetId);
  },

  // Navigation
  setCurrentFolder: (folder) => {
    set({ currentFolder: folder, page: 1 });
    get().fetchAssets(folder);
  },

  navigateUp: () => {
    const { currentFolder } = get();
    if (currentFolder === '/') return;

    const parts = currentFolder.split('/').filter(Boolean);
    parts.pop();
    const parentFolder = parts.length === 0 ? '/' : `/${parts.join('/')}`;
    get().setCurrentFolder(parentFolder);
  },

  // View options
  setViewMode: (mode) => set({ viewMode: mode }),

  setSortBy: (sortBy) => {
    set({ sortBy });
    get().fetchAssets();
  },

  setFilterBy: (filterBy) => {
    set({ filterBy, page: 1 });
    get().fetchAssets();
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  getFilteredAssets: () => {
    const { assets, searchQuery } = get();

    if (!searchQuery.trim()) return assets;

    const query = searchQuery.toLowerCase();
    return assets.filter((asset) => {
      const nameMatch = asset.name?.toLowerCase().includes(query);
      const pathMatch = asset.path?.toLowerCase().includes(query);
      return nameMatch || pathMatch;
    });
  },

  // Preview modal
  openPreview: async (asset) => {
    set({ previewAsset: asset, previewVersions: [] });

    // Fetch versions in background
    try {
      const versions = await getAssetVersions(asset.id);
      if (versions) {
        set({ previewVersions: versions });
      }
    } catch {
      // Silently fail
    }
  },

  closePreview: () => {
    set({ previewAsset: null, previewVersions: [] });
  },

  // Pagination
  setPage: (page) => {
    set({ page });
    get().fetchAssets();
  },

  nextPage: () => {
    const { page, totalPages } = get();
    if (page < totalPages) {
      get().setPage(page + 1);
    }
  },

  prevPage: () => {
    const { page } = get();
    if (page > 1) {
      get().setPage(page - 1);
    }
  },

  // Error handling
  clearError: () => set({ error: null }),
}));
