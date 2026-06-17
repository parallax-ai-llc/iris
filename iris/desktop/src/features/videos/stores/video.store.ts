import { create } from 'zustand';
import { IrisAsset } from '@/shared/api/types';
import {
  getVideos,
  getVideo,
  generateVideo,
  uploadVideo,
  deleteVideo as deleteVideoApi,
  downloadVideoUrl,
  getVideoStatus,
  getVideoVersions,
  upscaleVideo as upscaleVideoApi,
  cutVideo as cutVideoApi,
} from '@/shared/api/video.api';
import { getVideoModels, BaseModel } from '@/shared/api/provider.api';
import { invalidateAssetCache } from '@/shared/api/asset.api';
import type { AssetVersion } from '@/shared/api/types';
import { getTokenStorage } from '@/features/auth/lib/token-storage';

const getAuthToken = async (): Promise<string | null> => {
  return getTokenStorage().getToken();
};

// ==================== Types ====================

export interface VideoModel {
  id: string;
  name: string;
  provider: string;
  maxDuration: number;
  supportedDurations?: number[];
  supportedAspectRatios?: string[];
  imageRequired?: boolean;
}

// Fallback models (used when server is unavailable)
const FALLBACK_VIDEO_MODELS: VideoModel[] = [
  { id: 'runway-gen3', name: 'Runway Gen-3', provider: 'runway', maxDuration: 10 },
  { id: 'kling-v1.6', name: 'Kling v1.6', provider: 'kling', maxDuration: 10 },
  { id: 'luma-ray2', name: 'Luma Ray 2', provider: 'luma', maxDuration: 9 },
  { id: 'minimax-video-01', name: 'Minimax Video', provider: 'minimax', maxDuration: 6 },
  { id: 'veo-3', name: 'Google Veo 3', provider: 'google', maxDuration: 8 },
];

export const VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

export const VIDEO_DURATIONS = [5, 10] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export type VideoSortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc';
export type VideoFilterOption = 'all' | 'generated' | 'uploaded';

// Sort/filter option ids — labels are looked up via i18n at the render site
// (see VideosPage.tsx). Keeps non-React code free of i18n imports and lets
// translations live in JSON.
export const VIDEO_SORT_OPTIONS: VideoSortOption[] = [
  'newest',
  'oldest',
  'name-asc',
  'name-desc',
];

export const VIDEO_FILTER_OPTIONS: VideoFilterOption[] = [
  'all',
  'generated',
  'uploaded',
];

export type VideoEditingOperation = 'upscale' | 'cut' | null;

// Upload queue
export interface UploadQueueItem {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number; // 0-100
  status: 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
  abortController?: AbortController;
}

// Tool modal types
export type VideoToolType = 'upscale' | 'motion-control' | 'inpaint' | 'cut' | null;

interface VideoState {
  // Data
  videos: IrisAsset[];
  selectedVideo: IrisAsset | null;
  
  // Models (loaded from server)
  videoModels: VideoModel[];
  isLoadingModels: boolean;

  // Loading states
  isLoading: boolean;
  isGenerating: boolean;
  generationProgress: number;
  error: string | null;

  // Generation form
  prompt: string;
  negativePrompt: string;
  model: string;
  aspectRatio: VideoAspectRatio;
  duration: VideoDuration;
  showNegativePrompt: boolean;

  // Image-to-Video
  referenceImage: IrisAsset | null;
  endFrameImage: IrisAsset | null;
  // Local-only frame files (pasted / picked). Sent inline as base64 at
  // generation time so we don't persist throwaway screenshots to the library.
  referenceFile: File | null;
  referenceFilePreviewUrl: string | null;
  endFrameFile: File | null;
  endFrameFilePreviewUrl: string | null;
  showImg2VidSettings: boolean;

  // Gallery filter & sort
  sortBy: VideoSortOption;
  filterBy: VideoFilterOption;
  searchQuery: string;

  // Detail modal state
  detailModalOpen: boolean;
  detailVideo: IrisAsset | null;
  detailVersions: AssetVersion[];

  // Editing state
  isEditing: boolean;
  editingOperation: VideoEditingOperation;
  editingVideoId: string | null;

  // Tool modal state
  activeToolModal: VideoToolType;

  // Upload queue
  uploadQueue: UploadQueueItem[];
}

interface VideoActions {
  // Data actions
  fetchVideos: () => Promise<void>;
  fetchModels: () => Promise<void>;
  generateVideo: () => Promise<void>;
  deleteVideo: (id: string) => Promise<void>;
  downloadVideo: (id: string, showSaveDialog?: boolean) => Promise<string | null>;
  showInFolder: (filePath: string) => Promise<void>;
  selectVideo: (video: IrisAsset | null) => void;

  // Form actions
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setAspectRatio: (ratio: VideoAspectRatio) => void;
  setDuration: (duration: VideoDuration) => void;
  toggleNegativePrompt: () => void;
  resetForm: () => void;

  // Image-to-Video actions
  setReferenceImage: (image: IrisAsset | null) => void;
  setEndFrameImage: (image: IrisAsset | null) => void;
  /** Set a local-only start frame File (e.g. pasted screenshot). */
  setReferenceFile: (file: File | null) => void;
  /** Set a local-only end frame File. */
  setEndFrameFile: (file: File | null) => void;
  toggleImg2VidSettings: () => void;
  clearReferenceImage: () => void;
  clearEndFrameImage: () => void;

  // Gallery filter & sort actions
  setSortBy: (sort: VideoSortOption) => void;
  setFilterBy: (filter: VideoFilterOption) => void;
  setSearchQuery: (query: string) => void;
  getFilteredVideos: () => IrisAsset[];

  // Error handling
  clearError: () => void;

  // Detail modal actions
  openDetailModal: (video: IrisAsset) => void;
  closeDetailModal: () => void;
  refreshDetailVideo: () => Promise<void>;

  // Editing actions
  upscaleVideo: (id: string) => Promise<void>;
  cutVideo: (id: string, startTime: number, endTime: number) => Promise<void>;

  // Tool modal actions
  openToolModal: (tool: VideoToolType) => void;
  closeToolModal: () => void;

  // Polling
  pollGenerationStatus: (assetId: string) => Promise<IrisAsset | null>;

  // Upload queue actions
  uploadVideoFile: (file: File) => Promise<void>;
  cancelUpload: (id: string) => void;
  removeFromQueue: (id: string) => void;
}

// ==================== Initial States ====================

const initialFormState = {
  prompt: '',
  negativePrompt: '',
  model: 'runway-gen3',
  aspectRatio: '16:9' as VideoAspectRatio,
  duration: 5 as VideoDuration,
  showNegativePrompt: false,
  referenceImage: null as IrisAsset | null,
  endFrameImage: null as IrisAsset | null,
  referenceFile: null as File | null,
  referenceFilePreviewUrl: null as string | null,
  endFrameFile: null as File | null,
  endFrameFilePreviewUrl: null as string | null,
  showImg2VidSettings: false,
};

const initialGalleryState = {
  sortBy: 'newest' as VideoSortOption,
  filterBy: 'all' as VideoFilterOption,
  searchQuery: '',
};

const initialDetailModalState = {
  detailModalOpen: false,
  detailVideo: null as IrisAsset | null,
  detailVersions: [] as AssetVersion[],
};

const initialEditingState = {
  isEditing: false,
  editingOperation: null as VideoEditingOperation,
  editingVideoId: null as string | null,
};

const initialToolModalState = {
  activeToolModal: null as VideoToolType,
};

// ==================== Helper Functions ====================

/**
 * Poll for video processing status until ready or failed
 */
async function pollVideoStatus(
  assetId: string,
  onProgress?: (progress: number) => void,
  maxAttempts = 120, // 4 minutes with 2s interval
  intervalMs = 2000
): Promise<IrisAsset | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getVideoStatus(assetId);
    if (!status) return null;

    // Update progress if available
    if (status.progress !== undefined && onProgress) {
      onProgress(status.progress);
    }

    if (status.status === 'READY') {
      return status.asset || null;
    }

    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Video processing failed');
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Video processing timed out');
}

// ==================== Store ====================

export const useVideoStore = create<VideoState & VideoActions>((set, get) => ({
  // Initial state
  videos: [],
  selectedVideo: null,
  videoModels: FALLBACK_VIDEO_MODELS,
  isLoadingModels: false,
  isLoading: false,
  isGenerating: false,
  generationProgress: 0,
  error: null,
  ...initialFormState,
  ...initialGalleryState,
  ...initialDetailModalState,
  ...initialEditingState,
  ...initialToolModalState,
  uploadQueue: [],

  // Data actions
  fetchVideos: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await getVideos({ sortBy: 'createdAt', sortOrder: 'desc' });
      if (response) {
        set({ videos: response.assets, isLoading: false });
      } else {
        set({ videos: [], isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch videos',
        isLoading: false,
      });
    }
  },

  fetchModels: async () => {
    set({ isLoadingModels: true });
    try {
      const models = await getVideoModels();
      if (models && models.length > 0) {
        const videoModels: VideoModel[] = models.map((m: BaseModel) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          maxDuration: m.supportedDurations?.[m.supportedDurations.length - 1] || 10,
          supportedDurations: m.supportedDurations,
          supportedAspectRatios: m.supportedAspectRatios,
          imageRequired: m.imageRequired,
        }));
        set({ videoModels, isLoadingModels: false });
        
        // Set default model to first available if current model is not in list
        const { model, aspectRatio, duration } = get();
        if (!videoModels.find((m) => m.id === model) && videoModels.length > 0) {
          const firstModel = videoModels[0];
          set({ 
            model: firstModel.id,
            // Also reset aspect ratio and duration if not supported
            aspectRatio: (firstModel.supportedAspectRatios?.includes(aspectRatio) 
              ? aspectRatio 
              : (firstModel.supportedAspectRatios?.[0] as VideoAspectRatio) || '16:9'),
            duration: (firstModel.supportedDurations?.includes(duration)
              ? duration
              : (firstModel.supportedDurations?.[0] as VideoDuration) || 5),
          });
        }
      } else {
        // Keep fallback models if server returns empty
        set({ isLoadingModels: false });
      }
    } catch (error) {
      // Keep fallback models on error
      console.error('Failed to fetch video models:', error);
      set({ isLoadingModels: false });
    }
  },

  generateVideo: async () => {
    const {
      prompt, negativePrompt, model, aspectRatio, duration,
      referenceImage, endFrameImage, referenceFile, endFrameFile,
      videoModels,
    } = get();

    if (!prompt.trim()) {
      set({ error: 'Please enter a prompt' });
      return;
    }

    set({ isGenerating: true, generationProgress: 0, error: null });
    try {
      // Local files take precedence over library assets — they're what the
      // user just attached via paste/upload.
      let startFrameBase64: string | undefined;
      let endFrameBase64: string | undefined;
      if (referenceFile || endFrameFile) {
        const { fileToDataUrl } = await import('@/shared/lib/clipboard/pasteImageAsset');
        if (referenceFile) startFrameBase64 = await fileToDataUrl(referenceFile);
        if (endFrameFile) endFrameBase64 = await fileToDataUrl(endFrameFile);
      }

      const selectedModel = videoModels.find((m) => m.id === model);
      const result = await generateVideo({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        model,
        providerId: selectedModel?.provider,
        aspectRatio,
        duration,
        referenceAssetId: referenceFile ? undefined : referenceImage?.id,
        startFrameAssetId: referenceFile ? undefined : referenceImage?.id,
        endFrameAssetId: endFrameFile ? undefined : endFrameImage?.id,
        startFrameBase64,
        endFrameBase64,
      });

      if (!result) {
        set({
          error: 'Failed to generate video',
          isGenerating: false,
          generationProgress: 0,
        });
        return;
      }

      // Queue accepted — release the generator panel and show the queued asset
      // (in PROCESSING/PENDING state) at the top of the gallery so the user can
      // start a new generation immediately. Revoke any pending local preview URLs.
      const { referenceFilePreviewUrl, endFrameFilePreviewUrl } = get();
      if (referenceFilePreviewUrl) URL.revokeObjectURL(referenceFilePreviewUrl);
      if (endFrameFilePreviewUrl) URL.revokeObjectURL(endFrameFilePreviewUrl);
      set((state) => ({
        videos: [result, ...state.videos.filter((v) => v.id !== result.id)],
        isGenerating: false,
        generationProgress: 0,
        prompt: '',
        negativePrompt: '',
        referenceImage: null,
        endFrameImage: null,
        referenceFile: null,
        referenceFilePreviewUrl: null,
        endFrameFile: null,
        endFrameFilePreviewUrl: null,
        showImg2VidSettings: false,
      }));

      // Asset still pending — keep polling in the background and replace the
      // entry in the videos list when it finishes (or mark it failed). Multiple
      // generations can poll concurrently without blocking each other.
      if (result.processingStatus === 'PROCESSING' || result.processingStatus === 'PENDING') {
        void (async () => {
          try {
            const finalAsset = await pollVideoStatus(result.id);
            if (finalAsset) {
              set((state) => ({
                videos: state.videos.map((v) => (v.id === result.id ? finalAsset : v)),
              }));
            }
          } catch (error) {
            set((state) => ({
              videos: state.videos.map((v) =>
                v.id === result.id
                  ? {
                      ...v,
                      processingStatus: 'FAILED',
                      processingError:
                        error instanceof Error ? error.message : 'Video processing failed',
                    }
                  : v
              ),
            }));
          }
        })();
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to generate video',
        isGenerating: false,
        generationProgress: 0,
      });
    }
  },

  deleteVideo: async (id: string) => {
    try {
      const result = await deleteVideoApi(id);
      if (result.success) {
        // Invalidate cache for deleted video
        await invalidateAssetCache(id);
        set((state) => ({
          videos: state.videos.filter((v) => v.id !== id),
          selectedVideo: state.selectedVideo?.id === id ? null : state.selectedVideo,
        }));
      } else {
        set({ error: result.error || 'Failed to delete video' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete video',
      });
    }
  },

  downloadVideo: async (id: string, showSaveDialog = true) => {
    try {
      const url = await downloadVideoUrl(id);
      if (url) {
        const video = get().videos.find((v) => v.id === id);
        const fileName = video?.name || `video-${id}`;
        const extension = video?.mimeType?.split('/')[1] || 'mp4';

        let savePath: string | null = null;

        if (!window.electronAPI?.files) {
          // Browser environment - download via fetch with auth, then create blob link
          const token = await getAuthToken();
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          const response = await fetch(url, { headers });
          if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `${fileName}.${extension}`;
          link.click();
          
          // Clean up blob URL after download starts (10s to allow slow environments)
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          return null;
        }

        if (showSaveDialog) {
          savePath = await window.electronAPI.files.saveFile({
            defaultPath: `${fileName}.${extension}`,
            filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov'] }],
          });
        } else {
          const downloadsPath = await window.electronAPI.storage?.get('downloadsPath');
          const defaultDownloadsPath = `${process.env.HOME || process.env.USERPROFILE}/Downloads`;
          const basePath = downloadsPath || defaultDownloadsPath;
          savePath = `${basePath}/${fileName}.${extension}`;
        }

        if (savePath) {
          // Get auth token for authenticated download
          const token = await getAuthToken();
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          const response = await fetch(url, { headers });
          if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          await window.electronAPI.files.writeFile(savePath, arrayBuffer);
          return savePath;
        }
      } else {
        set({ error: 'Failed to get download URL' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to download video',
      });
    }
    return null;
  },

  showInFolder: async (filePath: string) => {
    try {
      await window.electronAPI?.files?.showInFolder(filePath);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to open folder',
      });
    }
  },

  selectVideo: (video) => set({ selectedVideo: video }),

  // Form actions
  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setModel: (modelId) => {
    const { videoModels, aspectRatio, duration } = get();
    const selectedModel = videoModels.find((m) => m.id === modelId);
    
    if (selectedModel) {
      // Reset aspect ratio if not supported by new model
      const newAspectRatio = selectedModel.supportedAspectRatios?.includes(aspectRatio)
        ? aspectRatio
        : (selectedModel.supportedAspectRatios?.[0] as VideoAspectRatio) || '16:9';
      
      // Reset duration if not supported by new model
      const newDuration = selectedModel.supportedDurations?.includes(duration)
        ? duration
        : (selectedModel.supportedDurations?.[0] as VideoDuration) || 5;
      
      set({ 
        model: modelId,
        aspectRatio: newAspectRatio,
        duration: newDuration,
      });
    } else {
      set({ model: modelId });
    }
  },
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setDuration: (duration) => set({ duration }),
  toggleNegativePrompt: () =>
    set((state) => ({ showNegativePrompt: !state.showNegativePrompt })),
  resetForm: () => set(initialFormState),

  // Image-to-Video actions
  setReferenceImage: (referenceImage) => {
    // Picking a saved asset clears any pending local file for the same slot.
    const prev = get().referenceFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      referenceImage,
      referenceFile: null,
      referenceFilePreviewUrl: null,
      showImg2VidSettings: !!referenceImage || !!get().endFrameImage || !!get().endFrameFile,
    });
  },
  setEndFrameImage: (endFrameImage) => {
    const prev = get().endFrameFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    set((state) => ({
      endFrameImage,
      endFrameFile: null,
      endFrameFilePreviewUrl: null,
      showImg2VidSettings: endFrameImage ? true : state.showImg2VidSettings,
    }));
  },
  setReferenceFile: (file) => {
    const prev = get().referenceFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    if (!file) {
      set({
        referenceFile: null,
        referenceFilePreviewUrl: null,
      });
      return;
    }
    set({
      referenceImage: null,
      referenceFile: file,
      referenceFilePreviewUrl: URL.createObjectURL(file),
      showImg2VidSettings: true,
    });
  },
  setEndFrameFile: (file) => {
    const prev = get().endFrameFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    if (!file) {
      set({
        endFrameFile: null,
        endFrameFilePreviewUrl: null,
      });
      return;
    }
    set({
      endFrameImage: null,
      endFrameFile: file,
      endFrameFilePreviewUrl: URL.createObjectURL(file),
      showImg2VidSettings: true,
    });
  },
  toggleImg2VidSettings: () =>
    set((state) => ({ showImg2VidSettings: !state.showImg2VidSettings })),
  clearReferenceImage: () => {
    const prev = get().referenceFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    set((state) => ({
      referenceImage: null,
      referenceFile: null,
      referenceFilePreviewUrl: null,
      showImg2VidSettings: state.endFrameImage || state.endFrameFile ? state.showImg2VidSettings : false,
    }));
  },
  clearEndFrameImage: () => {
    const prev = get().endFrameFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      endFrameImage: null,
      endFrameFile: null,
      endFrameFilePreviewUrl: null,
    });
  },

  // Gallery filter & sort actions
  setSortBy: (sortBy) => set({ sortBy }),
  setFilterBy: (filterBy) => set({ filterBy }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  getFilteredVideos: () => {
    const { videos, sortBy, filterBy, searchQuery } = get();

    // Filter
    let filtered = videos.filter((video) => {
      // Filter by type
      if (filterBy !== 'all') {
        const sourceType = video.metadata?.sourceType as string | undefined;
        if (filterBy === 'generated' && sourceType !== 'generated') return false;
        if (filterBy === 'uploaded' && sourceType !== 'uploaded') return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = video.name?.toLowerCase().includes(query);
        const promptMatch = (video.metadata?.prompt as string)?.toLowerCase().includes(query);
        if (!nameMatch && !promptMatch) return false;
      }

      return true;
    });

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name-asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name-desc':
          return (b.name || '').localeCompare(a.name || '');
        default:
          return 0;
      }
    });

    return filtered;
  },

  // Error handling
  clearError: () => set({ error: null }),

  // Detail modal actions
  openDetailModal: async (video) => {
    set({
      detailModalOpen: true,
      detailVideo: video,
      detailVersions: [],
    });

    // Fetch versions in background
    try {
      const versions = await getVideoVersions(video.id);
      if (versions) {
        set({ detailVersions: versions });
      }
    } catch {
      // Silently fail - versions are optional
    }
  },

  closeDetailModal: () =>
    set({
      detailModalOpen: false,
      detailVideo: null,
      detailVersions: [],
      isEditing: false,
      editingOperation: null,
      editingVideoId: null,
    }),

  refreshDetailVideo: async () => {
    const { detailVideo } = get();
    if (!detailVideo) return;

    try {
      const updatedVideo = await getVideo(detailVideo.id);
      if (updatedVideo) {
        set({ detailVideo: updatedVideo });

        // Also update in main videos list
        set((state) => ({
          videos: state.videos.map((v) =>
            v.id === updatedVideo.id ? updatedVideo : v
          ),
        }));
      }
    } catch {
      // Silently fail
    }
  },

  // Editing actions
  upscaleVideo: async (id) => {
    set({
      isEditing: true,
      editingOperation: 'upscale',
      editingVideoId: id,
      error: null,
    });

    try {
      const result = await upscaleVideoApi(id);
      if (result) {
        // Poll for completion if processing
        let finalAsset: IrisAsset = result;
        if (result.processingStatus === 'PROCESSING' || result.processingStatus === 'PENDING') {
          const polledAsset = await pollVideoStatus(result.id);
          if (!polledAsset) {
            throw new Error('Failed to get upscaled video');
          }
          finalAsset = polledAsset;
        }

        // Add new video to the list
        set((state) => ({
          videos: [finalAsset, ...state.videos],
          isEditing: false,
          editingOperation: null,
          editingVideoId: null,
        }));

        // Open the new video in detail modal
        get().openDetailModal(finalAsset);
      } else {
        set({
          error: 'Failed to upscale video',
          isEditing: false,
          editingOperation: null,
          editingVideoId: null,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to upscale video',
        isEditing: false,
        editingOperation: null,
        editingVideoId: null,
      });
    }
  },

  cutVideo: async (id, startTime, endTime) => {
    set({
      isEditing: true,
      editingOperation: 'cut',
      editingVideoId: id,
      error: null,
    });

    try {
      const result = await cutVideoApi(id, startTime, endTime);
      if (result) {
        // Poll for completion if processing
        let finalAsset: IrisAsset = result;
        if (result.processingStatus === 'PROCESSING' || result.processingStatus === 'PENDING') {
          const polledAsset = await pollVideoStatus(result.id);
          if (!polledAsset) {
            throw new Error('Failed to get cut video');
          }
          finalAsset = polledAsset;
        }

        // Add new video to the list
        set((state) => ({
          videos: [finalAsset, ...state.videos],
          isEditing: false,
          editingOperation: null,
          editingVideoId: null,
        }));

        // Open the new video in detail modal
        get().openDetailModal(finalAsset);
      } else {
        set({
          error: 'Failed to cut video',
          isEditing: false,
          editingOperation: null,
          editingVideoId: null,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to cut video',
        isEditing: false,
        editingOperation: null,
        editingVideoId: null,
      });
    }
  },

  // Tool modal actions
  openToolModal: (tool) => set({ activeToolModal: tool }),
  closeToolModal: () => set({ activeToolModal: null }),

  // Polling
  pollGenerationStatus: async (assetId: string) => {
    return pollVideoStatus(assetId, (progress) => set({ generationProgress: progress }));
  },

  // Upload queue actions
  uploadVideoFile: async (file: File) => {
    const itemId = crypto.randomUUID();

    const queueItem: UploadQueueItem = {
      id: itemId,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      status: 'uploading',
    };

    set((state) => ({
      uploadQueue: [...state.uploadQueue, queueItem],
    }));

    try {
      const result = await uploadVideo(file, { name: file.name });

      if (result.asset) {
        // Upload succeeded, now poll for server-side processing
        set((state) => ({
          uploadQueue: state.uploadQueue.map((item) =>
            item.id === itemId ? { ...item, status: 'processing' as const, progress: 100 } : item
          ),
        }));

        if (result.asset.processingStatus === 'PROCESSING' || result.asset.processingStatus === 'PENDING') {
          try {
            const finalAsset = await pollVideoStatus(result.asset.id);
            if (finalAsset) {
              set((state) => ({
                videos: [finalAsset, ...state.videos],
                uploadQueue: state.uploadQueue.map((item) =>
                  item.id === itemId ? { ...item, status: 'done' as const } : item
                ),
              }));
            } else {
              throw new Error('Processing failed');
            }
          } catch (pollError) {
            set((state) => ({
              uploadQueue: state.uploadQueue.map((item) =>
                item.id === itemId
                  ? { ...item, status: 'error' as const, error: pollError instanceof Error ? pollError.message : 'Processing failed' }
                  : item
              ),
            }));
          }
        } else {
          // Already READY
          set((state) => ({
            videos: [result.asset!, ...state.videos],
            uploadQueue: state.uploadQueue.map((item) =>
              item.id === itemId ? { ...item, status: 'done' as const } : item
            ),
          }));
        }

        // Auto-remove from queue after 3 seconds
        setTimeout(() => {
          set((state) => ({
            uploadQueue: state.uploadQueue.filter((item) => item.id !== itemId),
          }));
        }, 3000);
      } else {
        set((state) => ({
          uploadQueue: state.uploadQueue.map((item) =>
            item.id === itemId
              ? { ...item, status: 'error' as const, error: result.error || 'Upload failed' }
              : item
          ),
        }));
      }
    } catch (error) {
      set((state) => ({
        uploadQueue: state.uploadQueue.map((item) =>
          item.id === itemId
            ? { ...item, status: 'error' as const, error: error instanceof Error ? error.message : 'Upload failed' }
            : item
        ),
      }));
    }
  },

  cancelUpload: (id: string) => {
    const item = get().uploadQueue.find((i) => i.id === id);
    if (item?.abortController) {
      item.abortController.abort();
    }
    set((state) => ({
      uploadQueue: state.uploadQueue.filter((i) => i.id !== id),
    }));
  },

  removeFromQueue: (id: string) => {
    set((state) => ({
      uploadQueue: state.uploadQueue.filter((i) => i.id !== id),
    }));
  },
}));
