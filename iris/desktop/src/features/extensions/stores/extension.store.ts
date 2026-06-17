import { create } from 'zustand';
import {
  Extension,
  ExtensionDetail,
  ExtensionSortOption,
  ExtensionType,
  InstallationStatus,
  ExtensionReview,
  ExtensionSubmitData,
  ExtensionUpdateData,
  ReportData,
} from '@/shared/api/extension.types';
import {
  getExtensions,
  getExtension,
  getFeaturedExtensions,
  getInstalledExtensions,
  installExtension as installExtensionApi,
  uninstallExtension as uninstallExtensionApi,
  getExtensionReviews,
  submitReview as submitReviewApi,
  submitExtension as submitExtensionApi,
  getMyExtensions as getMyExtensionsApi,
  updateMyExtension as updateMyExtensionApi,
  deleteMyExtension as deleteMyExtensionApi,
  reportExtension as reportExtensionApi,
  reportReview as reportReviewApi,
} from '@/shared/api/extension.api';

interface ExtensionState {
  // Browsing data
  extensions: Extension[];
  featuredExtensions: Extension[];
  installedExtensionIds: Set<string>;

  // Loading
  isLoading: boolean;
  isFeaturedLoading: boolean;
  error: string | null;

  // Filters
  activeCategory: string;
  activeType: string;
  searchQuery: string;
  sortBy: ExtensionSortOption;

  // Pagination
  page: number;
  totalPages: number;
  totalCount: number;

  // Detail modal
  selectedExtension: ExtensionDetail | null;
  selectedExtensionReviews: ExtensionReview[];
  isDetailOpen: boolean;
  isDetailLoading: boolean;

  // Installation state
  installationStatus: Map<string, InstallationStatus>;

  // My extensions
  myExtensions: Extension[];
  isMyExtensionsLoading: boolean;

  // Submit modal
  isSubmitModalOpen: boolean;

  // Guide
  isGuideOpen: boolean;

  // Report modal
  isReportModalOpen: boolean;
  reportTargetExtensionId: string | null;
  reportTargetReviewId: string | null;
}

interface ExtensionActions {
  fetchExtensions: () => Promise<void>;
  fetchFeaturedExtensions: () => Promise<void>;
  fetchInstalledExtensions: () => Promise<void>;

  setActiveCategory: (category: string) => void;
  setActiveType: (type: string) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: ExtensionSortOption) => void;
  setPage: (page: number) => void;

  installExtension: (id: string) => Promise<void>;
  uninstallExtension: (id: string) => Promise<void>;
  getInstallStatus: (id: string) => InstallationStatus;

  openDetail: (id: string) => Promise<void>;
  closeDetail: () => void;
  fetchReviews: (extensionId: string) => Promise<void>;
  submitReview: (
    extensionId: string,
    rating: number,
    title?: string,
    content?: string
  ) => Promise<void>;

  // My extensions
  fetchMyExtensions: () => Promise<void>;
  submitExtension: (data: ExtensionSubmitData) => Promise<boolean>;
  updateMyExtension: (id: string, data: ExtensionUpdateData) => Promise<boolean>;
  deleteMyExtension: (id: string) => Promise<boolean>;

  // Submit modal
  openSubmitModal: () => void;
  closeSubmitModal: () => void;

  // Guide
  openGuide: () => void;
  closeGuide: () => void;

  // Report
  openReportModal: (extensionId: string, reviewId?: string) => void;
  closeReportModal: () => void;
  submitReport: (data: ReportData) => Promise<boolean>;

  clearError: () => void;
}

export const useExtensionStore = create<ExtensionState & ExtensionActions>((set, get) => ({
  // State
  extensions: [],
  featuredExtensions: [],
  installedExtensionIds: new Set(),
  isLoading: false,
  isFeaturedLoading: false,
  error: null,
  activeCategory: 'all',
  activeType: 'all',
  searchQuery: '',
  sortBy: 'popular',
  page: 1,
  totalPages: 1,
  totalCount: 0,
  selectedExtension: null,
  selectedExtensionReviews: [],
  isDetailOpen: false,
  isDetailLoading: false,
  installationStatus: new Map(),
  myExtensions: [],
  isMyExtensionsLoading: false,
  isSubmitModalOpen: false,
  isGuideOpen: false,
  isReportModalOpen: false,
  reportTargetExtensionId: null,
  reportTargetReviewId: null,

  // Actions
  fetchExtensions: async () => {
    const { activeCategory, activeType, searchQuery, sortBy, page } = get();
    set({ isLoading: true, error: null });
    try {
      const result = await getExtensions({
        category: activeCategory !== 'all' ? activeCategory : undefined,
        type: activeType !== 'all' ? (activeType as ExtensionType) : undefined,
        search: searchQuery || undefined,
        sort: sortBy,
        page,
        limit: 20,
      });
      if (result) {
        set({
          extensions: result.items,
          totalPages: result.totalPages,
          totalCount: result.total,
        });
      }
    } catch {
      set({ error: 'Failed to fetch extensions' });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchFeaturedExtensions: async () => {
    set({ isFeaturedLoading: true });
    try {
      const items = await getFeaturedExtensions();
      set({ featuredExtensions: items });
    } catch {
      // Silent fail for featured
    } finally {
      set({ isFeaturedLoading: false });
    }
  },

  fetchInstalledExtensions: async () => {
    try {
      const items = await getInstalledExtensions();
      const ids = new Set(items.map((i) => i.extensionId));
      set({ installedExtensionIds: ids });
    } catch {
      // Silent fail
    }
  },

  setActiveCategory: (category: string) => {
    set({ activeCategory: category, page: 1 });
    get().fetchExtensions();
  },

  setActiveType: (type: string) => {
    set({ activeType: type, page: 1 });
    get().fetchExtensions();
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query, page: 1 });
    get().fetchExtensions();
  },

  setSortBy: (sort: ExtensionSortOption) => {
    set({ sortBy: sort, page: 1 });
    get().fetchExtensions();
  },

  setPage: (page: number) => {
    set({ page });
    get().fetchExtensions();
  },

  installExtension: async (id: string) => {
    const { installationStatus } = get();
    const newStatus = new Map(installationStatus);
    newStatus.set(id, 'installing');
    set({ installationStatus: newStatus });

    try {
      const success = await installExtensionApi(id);
      if (success) {
        newStatus.set(id, 'installed');
        const { installedExtensionIds } = get();
        const newIds = new Set(installedExtensionIds);
        newIds.add(id);
        set({
          installationStatus: new Map(newStatus),
          installedExtensionIds: newIds,
          extensions: get().extensions.map((ext) =>
            ext.id === id
              ? { ...ext, isInstalled: true, downloadCount: ext.downloadCount + 1 }
              : ext
          ),
        });
      } else {
        newStatus.set(id, 'error');
        set({ installationStatus: new Map(newStatus) });
      }
    } catch {
      newStatus.set(id, 'error');
      set({ installationStatus: new Map(newStatus) });
    }
  },

  uninstallExtension: async (id: string) => {
    const { installationStatus } = get();
    const newStatus = new Map(installationStatus);
    newStatus.set(id, 'uninstalling');
    set({ installationStatus: newStatus });

    try {
      const success = await uninstallExtensionApi(id);
      if (success) {
        newStatus.set(id, 'not_installed');
        const { installedExtensionIds } = get();
        const newIds = new Set(installedExtensionIds);
        newIds.delete(id);
        set({
          installationStatus: new Map(newStatus),
          installedExtensionIds: newIds,
          extensions: get().extensions.map((ext) =>
            ext.id === id
              ? { ...ext, isInstalled: false, downloadCount: Math.max(0, ext.downloadCount - 1) }
              : ext
          ),
        });
      } else {
        newStatus.set(id, 'error');
        set({ installationStatus: new Map(newStatus) });
      }
    } catch {
      newStatus.set(id, 'error');
      set({ installationStatus: new Map(newStatus) });
    }
  },

  getInstallStatus: (id: string): InstallationStatus => {
    const { installationStatus, installedExtensionIds, extensions } = get();
    const status = installationStatus.get(id);
    if (status) return status;
    const ext = extensions.find((e) => e.id === id);
    if (ext?.isInstalled || installedExtensionIds.has(id)) return 'installed';
    return 'not_installed';
  },

  openDetail: async (id: string) => {
    set({ isDetailOpen: true, isDetailLoading: true, selectedExtension: null, selectedExtensionReviews: [] });
    try {
      const detail = await getExtension(id);
      if (detail) {
        set({ selectedExtension: detail });
        // Fetch reviews in parallel
        get().fetchReviews(id);
      }
    } catch {
      set({ error: 'Failed to load extension details' });
    } finally {
      set({ isDetailLoading: false });
    }
  },

  closeDetail: () => {
    set({ isDetailOpen: false, selectedExtension: null, selectedExtensionReviews: [] });
  },

  fetchReviews: async (extensionId: string) => {
    try {
      const result = await getExtensionReviews(extensionId, 1, 20);
      if (result) {
        set({ selectedExtensionReviews: result.items });
      }
    } catch {
      // Silent fail
    }
  },

  submitReview: async (extensionId, rating, title, content) => {
    try {
      const review = await submitReviewApi(extensionId, rating, title, content);
      if (review) {
        set({
          selectedExtensionReviews: [review, ...get().selectedExtensionReviews],
        });
      }
    } catch {
      set({ error: 'Failed to submit review' });
    }
  },

  // My extensions
  fetchMyExtensions: async () => {
    set({ isMyExtensionsLoading: true });
    try {
      const items = await getMyExtensionsApi();
      set({ myExtensions: items });
    } catch {
      set({ error: 'Failed to fetch my extensions' });
    } finally {
      set({ isMyExtensionsLoading: false });
    }
  },

  submitExtension: async (data: ExtensionSubmitData) => {
    try {
      const result = await submitExtensionApi(data);
      if (result) {
        get().fetchMyExtensions();
        get().fetchExtensions();
        return true;
      }
      return false;
    } catch {
      set({ error: 'Failed to submit extension' });
      return false;
    }
  },

  updateMyExtension: async (id: string, data: ExtensionUpdateData) => {
    try {
      const result = await updateMyExtensionApi(id, data);
      if (result) {
        get().fetchMyExtensions();
        return true;
      }
      return false;
    } catch {
      set({ error: 'Failed to update extension' });
      return false;
    }
  },

  deleteMyExtension: async (id: string) => {
    try {
      const success = await deleteMyExtensionApi(id);
      if (success) {
        set({ myExtensions: get().myExtensions.filter((e) => e.id !== id) });
        return true;
      }
      return false;
    } catch {
      set({ error: 'Failed to delete extension' });
      return false;
    }
  },

  // Submit modal
  openSubmitModal: () => set({ isSubmitModalOpen: true }),
  closeSubmitModal: () => set({ isSubmitModalOpen: false }),

  // Guide
  openGuide: () => set({ isGuideOpen: true }),
  closeGuide: () => set({ isGuideOpen: false }),

  // Report
  openReportModal: (extensionId: string, reviewId?: string) =>
    set({
      isReportModalOpen: true,
      reportTargetExtensionId: extensionId,
      reportTargetReviewId: reviewId || null,
    }),

  closeReportModal: () =>
    set({
      isReportModalOpen: false,
      reportTargetExtensionId: null,
      reportTargetReviewId: null,
    }),

  submitReport: async (data: ReportData) => {
    const { reportTargetExtensionId, reportTargetReviewId } = get();
    if (!reportTargetExtensionId) return false;
    try {
      let success: boolean;
      if (reportTargetReviewId) {
        success = await reportReviewApi(reportTargetExtensionId, reportTargetReviewId, data);
      } else {
        success = await reportExtensionApi(reportTargetExtensionId, data);
      }
      if (success) {
        get().closeReportModal();
      }
      return success;
    } catch {
      set({ error: 'Failed to submit report' });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
