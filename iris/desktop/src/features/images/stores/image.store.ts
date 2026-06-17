import { create } from 'zustand';
import { IrisAsset } from '@/shared/api/types';
import {
  getImages,
  getImage,
  generateImage,
  deleteImage as deleteImageApi,
  downloadImageUrl,
  upscaleImage as upscaleImageApi,
  removeBackground as removeBackgroundApi,
  getAssetStatus,
  getImageVersions,
  invalidateAssetCache,
} from '@/shared/api/image.api';
import { getImageModels, BaseModel } from '@/shared/api/provider.api';

// ==================== Interfaces ====================

export interface ImageModel {
  id: string;
  name: string;
  provider: string;
  imageRequired?: boolean;
}

// Fallback models (used when server is unavailable)
const FALLBACK_IMAGE_MODELS: ImageModel[] = [
  { id: 'flux-schnell', name: 'Flux Schnell', provider: 'bfl' },
  { id: 'flux-pro', name: 'Flux Pro', provider: 'bfl' },
  { id: 'sdxl-lightning', name: 'SDXL Lightning', provider: 'replicate' },
  { id: 'ideogram-v2', name: 'Ideogram V2', provider: 'ideogram' },
  { id: 'recraft-v3', name: 'Recraft V3', provider: 'recraft' },
];

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export type EditingOperation = 'upscale' | 'remove-bg' | null;

// Filter & Sort options
export type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc';
export type FilterOption = 'all' | 'generated' | 'uploaded' | 'edited';

// Sort/filter option ids — labels are looked up via i18n at the render site
// (see ImagesPage.tsx). Keeping labels out of the store avoids needing the
// i18n instance inside non-React code and lets translations live in JSON.
export const SORT_OPTIONS: SortOption[] = [
  'newest',
  'oldest',
  'name-asc',
  'name-desc',
];

export const FILTER_OPTIONS: FilterOption[] = [
  'all',
  'generated',
  'uploaded',
  'edited',
];

interface ImageState {
  // Data
  images: IrisAsset[];
  selectedImage: IrisAsset | null;
  
  // Models (loaded from server)
  imageModels: ImageModel[];
  isLoadingModels: boolean;

  // Loading states
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;

  // Generation form
  prompt: string;
  negativePrompt: string;
  model: string;
  aspectRatio: AspectRatio;
  showNegativePrompt: boolean;

  // Image-to-Image settings
  referenceImage: IrisAsset | null;
  // Local (unsaved) reference image — set by paste/upload so we don't persist
  // throwaway screenshots into the user's library. Sent inline as base64 at
  // generation time. Mutually exclusive with referenceImage in practice.
  referenceFile: File | null;
  referenceFilePreviewUrl: string | null;
  imageStrength: number; // 0-1, higher = more original image preserved
  showImg2ImgSettings: boolean;

  // Gallery filter & sort
  sortBy: SortOption;
  filterBy: FilterOption;
  searchQuery: string;

  // Detail modal state
  detailModalOpen: boolean;
  detailImage: IrisAsset | null;
  detailVersions: import('@/shared/api/types').AssetVersion[];

  // Editing state
  isEditing: boolean;
  editingOperation: EditingOperation;
  editingImageId: string | null;
}

interface ImageActions {
  // Data actions
  fetchImages: () => Promise<void>;
  fetchModels: () => Promise<void>;
  generateImage: () => Promise<void>;
  deleteImage: (id: string) => Promise<void>;
  downloadImage: (id: string, showSaveDialog?: boolean) => Promise<string | null>;
  showInFolder: (filePath: string) => Promise<void>;
  selectImage: (image: IrisAsset | null) => void;

  // Form actions
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  toggleNegativePrompt: () => void;
  resetForm: () => void;

  // Image-to-Image actions
  setReferenceImage: (image: IrisAsset | null) => void;
  /** Set a local-only reference image File (e.g. pasted screenshot). */
  setReferenceFile: (file: File | null) => void;
  setImageStrength: (strength: number) => void;
  toggleImg2ImgSettings: () => void;
  clearReferenceImage: () => void;

  // Gallery filter & sort actions
  setSortBy: (sort: SortOption) => void;
  setFilterBy: (filter: FilterOption) => void;
  setSearchQuery: (query: string) => void;
  getFilteredImages: () => IrisAsset[];

  // Error handling
  clearError: () => void;

  // Detail modal actions
  openDetailModal: (image: IrisAsset) => void;
  closeDetailModal: () => void;
  refreshDetailImage: () => Promise<void>;

  // Editing actions
  upscaleImage: (id: string, scale: 2 | 4) => Promise<void>;
  removeBackground: (id: string) => Promise<void>;
}

// ==================== Store ====================

const initialFormState = {
  prompt: '',
  negativePrompt: '',
  model: 'flux-schnell',
  aspectRatio: '1:1' as AspectRatio,
  showNegativePrompt: false,
  referenceImage: null as IrisAsset | null,
  referenceFile: null as File | null,
  referenceFilePreviewUrl: null as string | null,
  imageStrength: 0.7, // Default: 70% original image influence
  showImg2ImgSettings: false,
};

const initialGalleryState = {
  sortBy: 'newest' as SortOption,
  filterBy: 'all' as FilterOption,
  searchQuery: '',
};

const initialDetailModalState = {
  detailModalOpen: false,
  detailImage: null as IrisAsset | null,
  detailVersions: [] as import('@/shared/api/types').AssetVersion[],
};

const initialEditingState = {
  isEditing: false,
  editingOperation: null as EditingOperation,
  editingImageId: null as string | null,
};

/**
 * Poll for asset status until it's ready or failed
 */
async function pollAssetStatus(
  assetId: string,
  maxAttempts = 60,
  intervalMs = 2000
): Promise<IrisAsset | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getAssetStatus(assetId);
    if (!status) return null;

    if (status.status === 'READY') {
      return status.asset || null;
    }

    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Processing failed');
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Processing timed out');
}

export const useImageStore = create<ImageState & ImageActions>((set, get) => ({
  // Initial state
  images: [],
  selectedImage: null,
  imageModels: FALLBACK_IMAGE_MODELS,
  isLoadingModels: false,
  isLoading: false,
  isGenerating: false,
  error: null,
  ...initialFormState,
  ...initialGalleryState,
  ...initialDetailModalState,
  ...initialEditingState,

  // Data actions
  fetchImages: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await getImages({ sortBy: 'createdAt', sortOrder: 'desc' });
      if (response) {
        set({ images: response.assets, isLoading: false });
      } else {
        set({ images: [], isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch images',
        isLoading: false,
      });
    }
  },

  fetchModels: async () => {
    set({ isLoadingModels: true });
    try {
      const models = await getImageModels();
      if (models && models.length > 0) {
        const imageModels: ImageModel[] = models.map((m: BaseModel) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          imageRequired: m.imageRequired,
        }));
        set({ imageModels, isLoadingModels: false });
        
        // Set default model to first available if current model is not in list
        const { model } = get();
        if (!imageModels.find((m) => m.id === model) && imageModels.length > 0) {
          set({ model: imageModels[0].id });
        }
      } else {
        // Keep fallback models if server returns empty
        set({ isLoadingModels: false });
      }
    } catch (error) {
      // Keep fallback models on error
      console.error('Failed to fetch image models:', error);
      set({ isLoadingModels: false });
    }
  },

  generateImage: async () => {
    const { prompt, negativePrompt, model, aspectRatio, referenceImage, referenceFile, imageStrength, imageModels } = get();

    if (!prompt.trim()) {
      set({ error: 'Please enter a prompt' });
      return;
    }

    set({ isGenerating: true, error: null });
    try {
      // Local file (pasted / picked) takes precedence over a library asset —
      // both shouldn't be set, but if they are, the local file is what the
      // user just touched.
      let referenceImageBase64: string | undefined;
      if (referenceFile) {
        const { fileToDataUrl } = await import('@/shared/lib/clipboard/pasteImageAsset');
        referenceImageBase64 = await fileToDataUrl(referenceFile);
      }

      const hasReference = !!referenceFile || !!referenceImage;
      const selectedModel = imageModels.find((m) => m.id === model);
      const result = await generateImage({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        model,
        providerId: selectedModel?.provider,
        aspectRatio,
        // Image-to-Image settings
        referenceAssetId: referenceFile ? undefined : referenceImage?.id,
        referenceImageBase64,
        imageStrength: hasReference ? imageStrength : undefined,
      });

      if (result) {
        // Add new image to the beginning of the list
        set((state) => ({
          images: [result, ...state.images],
          isGenerating: false,
          prompt: '',
          negativePrompt: '',
        }));
      } else {
        set({
          error: 'Failed to generate image',
          isGenerating: false,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to generate image',
        isGenerating: false,
      });
    }
  },

  deleteImage: async (id: string) => {
    try {
      const success = await deleteImageApi(id);
      if (success) {
        // Invalidate cache for deleted image
        await invalidateAssetCache(id);
        set((state) => ({
          images: state.images.filter((img) => img.id !== id),
          selectedImage: state.selectedImage?.id === id ? null : state.selectedImage,
        }));
      } else {
        set({ error: 'Failed to delete image' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete image',
      });
    }
  },

  downloadImage: async (id: string, showSaveDialog = true) => {
    try {
      const url = await downloadImageUrl(id);
      if (url) {
        // Get image from list for filename
        const image = get().images.find((img) => img.id === id);
        const fileName = image?.name || `image-${id}`;
        const extension = image?.mimeType?.split('/')[1] || 'png';
        
        let savePath: string | null = null;

        if (!window.electronAPI?.files) {
          // Browser environment - download via link
          const link = document.createElement('a');
          link.href = url;
          link.download = `${fileName}.${extension}`;
          link.click();
          return null;
        }

        if (showSaveDialog) {
          // Prompt user to select save location
          savePath = await window.electronAPI.files.saveFile({
            defaultPath: `${fileName}.${extension}`,
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
          });
        } else {
          // Quick download to Downloads folder
          // Get downloads path from app or use default
          const downloadsPath = await window.electronAPI.storage?.get('downloadsPath');
          const defaultDownloadsPath = `${process.env.HOME || process.env.USERPROFILE}/Downloads`;
          const basePath = downloadsPath || defaultDownloadsPath;
          savePath = `${basePath}/${fileName}.${extension}`;
        }
        
        if (savePath) {
          // Fetch the image and save it
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          await window.electronAPI.files.writeFile(savePath, arrayBuffer);
          
          // Return the saved path for "show in folder" functionality
          return savePath;
        }
      } else {
        set({ error: 'Failed to get download URL' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to download image',
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

  selectImage: (image) => set({ selectedImage: image }),

  // Form actions
  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setModel: (model) => set({ model }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  toggleNegativePrompt: () =>
    set((state) => ({ showNegativePrompt: !state.showNegativePrompt })),
  resetForm: () => set(initialFormState),

  // Image-to-Image actions
  setReferenceImage: (referenceImage) => {
    // Picking a saved asset replaces any pending local file (revoke preview URL).
    const prev = get().referenceFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      referenceImage,
      referenceFile: null,
      referenceFilePreviewUrl: null,
      showImg2ImgSettings: !!referenceImage,
    });
  },
  setReferenceFile: (file) => {
    const prev = get().referenceFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    if (!file) {
      set({
        referenceFile: null,
        referenceFilePreviewUrl: null,
        showImg2ImgSettings: !!get().referenceImage,
      });
      return;
    }
    // Setting a local file clears any previously selected library asset so
    // there's a single source of truth for the reference image preview.
    set({
      referenceImage: null,
      referenceFile: file,
      referenceFilePreviewUrl: URL.createObjectURL(file),
      showImg2ImgSettings: true,
    });
  },
  setImageStrength: (imageStrength) => set({ imageStrength }),
  toggleImg2ImgSettings: () =>
    set((state) => ({ showImg2ImgSettings: !state.showImg2ImgSettings })),
  clearReferenceImage: () => {
    const prev = get().referenceFilePreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      referenceImage: null,
      referenceFile: null,
      referenceFilePreviewUrl: null,
      showImg2ImgSettings: false,
    });
  },

  // Gallery filter & sort actions
  setSortBy: (sortBy) => set({ sortBy }),
  setFilterBy: (filterBy) => set({ filterBy }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  getFilteredImages: () => {
    const { images, sortBy, filterBy, searchQuery } = get();

    // Filter
    let filtered = images.filter((image) => {
      // Filter by type
      if (filterBy !== 'all') {
        const sourceType = image.metadata?.sourceType as string | undefined;
        if (filterBy === 'generated' && sourceType !== 'generated') return false;
        if (filterBy === 'uploaded' && sourceType !== 'uploaded') return false;
        if (filterBy === 'edited' && !['upscaled', 'background-removed'].includes(sourceType || '')) return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = image.name?.toLowerCase().includes(query);
        const promptMatch = (image.metadata?.prompt as string)?.toLowerCase().includes(query);
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
  openDetailModal: async (image) => {
    set({
      detailModalOpen: true,
      detailImage: image,
      detailVersions: [],
    });

    // Fetch versions in background
    try {
      const versions = await getImageVersions(image.id);
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
      detailImage: null,
      detailVersions: [],
      isEditing: false,
      editingOperation: null,
      editingImageId: null,
    }),

  refreshDetailImage: async () => {
    const { detailImage } = get();
    if (!detailImage) return;

    try {
      const updatedImage = await getImage(detailImage.id);
      if (updatedImage) {
        set({ detailImage: updatedImage });

        // Also update in main images list
        set((state) => ({
          images: state.images.map((img) =>
            img.id === updatedImage.id ? updatedImage : img
          ),
        }));
      }
    } catch {
      // Silently fail
    }
  },

  // Editing actions
  upscaleImage: async (id, scale) => {
    set({
      isEditing: true,
      editingOperation: 'upscale',
      editingImageId: id,
      error: null,
    });

    try {
      const result = await upscaleImageApi(id, scale);
      if (result) {
        // Poll for completion if processing
        let finalAsset: IrisAsset = result;
        if (result.processingStatus === 'PROCESSING') {
          const polledAsset = await pollAssetStatus(result.id);
          if (!polledAsset) {
            throw new Error('Failed to get upscaled image');
          }
          finalAsset = polledAsset;
        }

        // Add new image to the list
        set((state) => ({
          images: [finalAsset, ...state.images],
          isEditing: false,
          editingOperation: null,
          editingImageId: null,
        }));

        // Open the new image in detail modal
        get().openDetailModal(finalAsset);
      } else {
        set({
          error: 'Failed to upscale image',
          isEditing: false,
          editingOperation: null,
          editingImageId: null,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to upscale image',
        isEditing: false,
        editingOperation: null,
        editingImageId: null,
      });
    }
  },

  removeBackground: async (id) => {
    set({
      isEditing: true,
      editingOperation: 'remove-bg',
      editingImageId: id,
      error: null,
    });

    try {
      const result = await removeBackgroundApi(id);
      if (result) {
        // Poll for completion if processing
        let finalAsset: IrisAsset = result;
        if (result.processingStatus === 'PROCESSING') {
          const polledAsset = await pollAssetStatus(result.id);
          if (!polledAsset) {
            throw new Error('Failed to get processed image');
          }
          finalAsset = polledAsset;
        }

        // Add new image to the list
        set((state) => ({
          images: [finalAsset, ...state.images],
          isEditing: false,
          editingOperation: null,
          editingImageId: null,
        }));

        // Open the new image in detail modal
        get().openDetailModal(finalAsset);
      } else {
        set({
          error: 'Failed to remove background',
          isEditing: false,
          editingOperation: null,
          editingImageId: null,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove background',
        isEditing: false,
        editingOperation: null,
        editingImageId: null,
      });
    }
  },
}));
