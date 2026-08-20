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
  ExtensionBundleInfo,
  ExtensionBundleManifest,
  InstalledExtension,
  ReportData,
} from '@/shared/api/extension.types';
import {
  getExtensions,
  getExtension,
  getFeaturedExtensions,
  getInstalledExtensions,
  installExtension as installExtensionApi,
  uninstallExtension as uninstallExtensionApi,
  getExtensionBundle,
  uploadExtensionBundle,
  getExtensionReviews,
  submitReview as submitReviewApi,
  submitExtension as submitExtensionApi,
  getMyExtensions as getMyExtensionsApi,
  updateMyExtension as updateMyExtensionApi,
  deleteMyExtension as deleteMyExtensionApi,
  reportExtension as reportExtensionApi,
  reportReview as reportReviewApi,
} from '@/shared/api/extension.api';
import { isNewerVersion } from '@/features/extensions/lib/semver';
import { toast } from '@/shared/lib/toast';
import i18n from '@/shared/lib/i18n';
import type { ExtensionRuntimeInfoData } from '@/types/electron';

// ─── Local (Electron) runtime helpers ───

type DesktopTrustTier = 'official' | 'verified' | 'community';

const getDesktopExtensionsApi = () =>
  typeof window !== 'undefined' ? window.electronAPI?.extensions : undefined;

/**
 * Map the server catalog's trust markers onto the runtime trust tier.
 * The Extension model only carries `isOfficial` (no verified flag), so
 * everything else installs as 'community' — deny-by-default.
 */
const trustTierFor = (
  ext: Pick<Extension, 'isOfficial'> | undefined | null
): DesktopTrustTier => (ext?.isOfficial ? 'official' : 'community');

/** Runtime extension id (`publisher.name`) from server-stored manifest data. */
const manifestIdOf = (
  manifest: ExtensionBundleManifest | null | undefined
): string | null => {
  if (!manifest) return null;
  if (typeof manifest.id === 'string' && manifest.id) return manifest.id;
  if (
    typeof manifest.publisher === 'string' &&
    manifest.publisher &&
    typeof manifest.name === 'string' &&
    manifest.name
  ) {
    return `${manifest.publisher}.${manifest.name}`;
  }
  return null;
};

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

  // Local (Electron) install state, keyed by marketplace extension id
  /** marketplace id → locally installed runtime id (`publisher.name`) */
  localExtensionIds: Map<string, string>;
  /** marketplace id → locally installed manifest version */
  localVersions: Map<string, string>;
  /** marketplace ids whose server currentVersion is newer than the local install */
  updatableExtensionIds: Set<string>;

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
  updateExtension: (id: string) => Promise<void>;
  getInstallStatus: (id: string) => InstallationStatus;
  /** Reconcile server install records with the local Electron runtime. */
  syncLocalInstallState: (installed: InstalledExtension[]) => Promise<void>;

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
  submitExtension: (data: ExtensionSubmitData) => Promise<Extension | null>;
  uploadBundle: (
    extensionId: string,
    file: File,
    onProgress?: (percent: number) => void
  ) => Promise<{ success: boolean; error?: string }>;
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
  localExtensionIds: new Map(),
  localVersions: new Map(),
  updatableExtensionIds: new Set(),
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
      await get().syncLocalInstallState(items);
    } catch {
      // Silent fail
    }
  },

  syncLocalInstallState: async (installed: InstalledExtension[]) => {
    const api = getDesktopExtensionsApi();
    if (!api || installed.length === 0) {
      set({
        localExtensionIds: new Map(),
        localVersions: new Map(),
        updatableExtensionIds: new Set(),
      });
      return;
    }

    try {
      const localInfos = (await api.getInstalled()) as ExtensionRuntimeInfoData[];
      const localById = new Map<string, ExtensionRuntimeInfoData>();
      for (const info of localInfos) localById.set(info.id, info);

      const localExtensionIds = new Map<string, string>();
      const localVersions = new Map<string, string>();
      const updatableExtensionIds = new Set<string>();

      await Promise.all(
        installed.map(async (item) => {
          let bundle: ExtensionBundleInfo | null = null;
          try {
            bundle = await getExtensionBundle(item.extensionId);
          } catch {
            return; // network hiccup — skip this entry, keep the rest
          }
          const localId = manifestIdOf(bundle?.manifestData);
          if (!localId) return;
          const local = localById.get(localId);
          if (!local) return; // recorded on the server but not installed on this machine

          localExtensionIds.set(item.extensionId, localId);
          const localVersion = local.manifest?.version;
          if (typeof localVersion === 'string' && localVersion) {
            localVersions.set(item.extensionId, localVersion);
            const serverVersion = item.extension?.currentVersion;
            if (serverVersion && isNewerVersion(serverVersion, localVersion)) {
              updatableExtensionIds.add(item.extensionId);
            }
          }
        })
      );

      set({ localExtensionIds, localVersions, updatableExtensionIds });
    } catch {
      // Silent fail — the marketplace still works from the server records alone
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
    const setStatus = (status: InstallationStatus) => {
      const statusMap = new Map(get().installationStatus);
      statusMap.set(id, status);
      set({ installationStatus: statusMap });
    };
    setStatus('installing');

    try {
      // 1) Record the install on the server (download count, user library).
      const recorded = await installExtensionApi(id);
      if (!recorded) {
        setStatus('error');
        return;
      }

      // 2) Download + install the .iex bundle into the local Electron runtime.
      const api = getDesktopExtensionsApi();
      if (api) {
        const bundle = await getExtensionBundle(id);
        if (bundle?.bundleUrl) {
          const catalogEntry =
            get().extensions.find((e) => e.id === id) ??
            get().featuredExtensions.find((e) => e.id === id) ??
            (get().selectedExtension?.id === id ? get().selectedExtension : null);
          const result = await api.installFromIex(
            bundle.bundleUrl,
            trustTierFor(catalogEntry),
            { upgrade: false }
          );
          if (!result.success) {
            // Local install failed — roll back the server record so both
            // sides stay consistent and the user can retry cleanly.
            try {
              await uninstallExtensionApi(id);
            } catch {
              // Rollback is best-effort; the retry path re-records the install.
            }
            setStatus('error');
            toast.error(
              i18n.t('extensions:local.installError', {
                error: result.error ?? 'unknown',
              })
            );
            return;
          }

          const localId = result.extensionId ?? manifestIdOf(bundle.manifestData);
          const localExtensionIds = new Map(get().localExtensionIds);
          if (localId) localExtensionIds.set(id, localId);
          const localVersions = new Map(get().localVersions);
          const bundleVersion = bundle.manifestData?.version;
          if (typeof bundleVersion === 'string' && bundleVersion) {
            localVersions.set(id, bundleVersion);
          }
          const updatableExtensionIds = new Set(get().updatableExtensionIds);
          updatableExtensionIds.delete(id);
          set({ localExtensionIds, localVersions, updatableExtensionIds });
        }
        // No bundleUrl: metadata-only listing (no runtime code uploaded yet).
        // Keep the server install record — there is nothing to run locally.
      }

      setStatus('installed');
      const newIds = new Set(get().installedExtensionIds);
      newIds.add(id);
      set({
        installedExtensionIds: newIds,
        extensions: get().extensions.map((ext) =>
          ext.id === id
            ? { ...ext, isInstalled: true, downloadCount: ext.downloadCount + 1 }
            : ext
        ),
      });
    } catch {
      setStatus('error');
    }
  },

  uninstallExtension: async (id: string) => {
    const setStatus = (status: InstallationStatus) => {
      const statusMap = new Map(get().installationStatus);
      statusMap.set(id, status);
      set({ installationStatus: statusMap });
    };
    setStatus('uninstalling');

    try {
      // 1) Remove the local runtime install (best-effort id resolution — the
      //    runtime is keyed by the manifest id, not the marketplace id).
      const api = getDesktopExtensionsApi();
      if (api) {
        let localId = get().localExtensionIds.get(id) ?? null;
        if (!localId) {
          try {
            const bundle = await getExtensionBundle(id);
            localId = manifestIdOf(bundle?.manifestData);
          } catch {
            localId = null;
          }
        }
        if (localId) {
          try {
            await api.uninstall(localId);
          } catch {
            // Not installed locally (or already removed) — server removal still applies.
          }
        }
      }

      // 2) Remove the server install record.
      const success = await uninstallExtensionApi(id);
      if (success) {
        setStatus('not_installed');
        const newIds = new Set(get().installedExtensionIds);
        newIds.delete(id);
        const localExtensionIds = new Map(get().localExtensionIds);
        localExtensionIds.delete(id);
        const localVersions = new Map(get().localVersions);
        localVersions.delete(id);
        const updatableExtensionIds = new Set(get().updatableExtensionIds);
        updatableExtensionIds.delete(id);
        set({
          installedExtensionIds: newIds,
          localExtensionIds,
          localVersions,
          updatableExtensionIds,
          extensions: get().extensions.map((ext) =>
            ext.id === id
              ? { ...ext, isInstalled: false, downloadCount: Math.max(0, ext.downloadCount - 1) }
              : ext
          ),
        });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  },

  updateExtension: async (id: string) => {
    const api = getDesktopExtensionsApi();
    if (!api) return;

    const setStatus = (status: InstallationStatus) => {
      const statusMap = new Map(get().installationStatus);
      statusMap.set(id, status);
      set({ installationStatus: statusMap });
    };
    setStatus('updating');

    // A failed update leaves the previous version installed and running.
    const failBackToInstalled = (error: string) => {
      setStatus('installed');
      toast.error(i18n.t('extensions:update.error', { error }));
    };

    try {
      const bundle = await getExtensionBundle(id);
      if (!bundle?.bundleUrl) {
        failBackToInstalled('bundle unavailable');
        return;
      }
      const catalogEntry =
        get().extensions.find((e) => e.id === id) ??
        get().featuredExtensions.find((e) => e.id === id) ??
        (get().selectedExtension?.id === id ? get().selectedExtension : null);
      const result = await api.installFromIex(
        bundle.bundleUrl,
        trustTierFor(catalogEntry),
        { upgrade: true }
      );
      if (!result.success) {
        failBackToInstalled(result.error ?? 'unknown');
        return;
      }

      const localId = result.extensionId ?? manifestIdOf(bundle.manifestData);
      const localExtensionIds = new Map(get().localExtensionIds);
      if (localId) localExtensionIds.set(id, localId);
      const localVersions = new Map(get().localVersions);
      const bundleVersion = bundle.manifestData?.version;
      if (typeof bundleVersion === 'string' && bundleVersion) {
        localVersions.set(id, bundleVersion);
      }
      const updatableExtensionIds = new Set(get().updatableExtensionIds);
      updatableExtensionIds.delete(id);
      set({ localExtensionIds, localVersions, updatableExtensionIds });
      setStatus('installed');
      toast.success(i18n.t('extensions:update.success'));
    } catch {
      failBackToInstalled('unknown');
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
        return result;
      }
      return null;
    } catch {
      set({ error: 'Failed to submit extension' });
      return null;
    }
  },

  uploadBundle: async (extensionId, file, onProgress) => {
    try {
      const result = await uploadExtensionBundle(extensionId, file, onProgress);
      if (result.success) {
        // Version/status changed server-side (back to pending review).
        get().fetchMyExtensions();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      };
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
