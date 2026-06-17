import { useEffect, useCallback, memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ImagePlus,
  Download,
  Trash2,
  Loader2,
  Settings2,
  ChevronDown,
  ChevronUp,
  Wand2,
  Upload,
  ImageIcon,
  AlertCircle,
  X,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Layers,
  Coins,
  FolderOpen,
  Check,
  Plus,
  ClipboardPaste,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useImageStore,
  ASPECT_RATIOS,
  SORT_OPTIONS,
  FILTER_OPTIONS,
  type AspectRatio,
  type SortOption,
  type FilterOption,
} from '@/features/images/stores/image.store';
import { uploadImage } from '@/shared/api/image.api';
import {
  imageFileFromPasteEvent,
  imageFileFromClipboardApi,
  pickImageFile,
} from '@/shared/lib/clipboard/pasteImageAsset';
import { getTokenCosts, calculateModelTokenCost } from '@/shared/api/token.api';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { CachedImage, ModelSelector } from '@/shared/components/common';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { useUIStore } from '@/shared/stores/ui.store';
import { importPsd } from '@/features/image-editor/psd/importPsd';
import { useRequiresServer } from '@/shared/hooks/useRequiresServer';
import { toast } from '@/shared/lib/toast';
import { StorageAssetPickerModal } from '@/features/storage/components';
import { IS_SELF_HOST } from '@/config/self-host';
import { ErrorModal } from '@/shared/components/ui/ErrorModal';
import { SelectionBar } from '@/shared/components/common/SelectionBar';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import { NewProjectModal } from '@/features/image-editor/components/modals/NewProjectModal';
import type { IrisAsset, TokenCostsResponse } from '@/shared/api/types';

// ==================== Sub-components ====================

interface ImageCardProps {
  image: IrisAsset;
  onClick: (image: IrisAsset) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onSetReference: (image: IrisAsset) => void;
  isReference?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
}

const ImageCard = memo(function ImageCard({
  image,
  onClick,
  onDownload,
  onDelete,
  onSetReference,
  isReference,
  isSelectionMode,
  isSelected,
  onToggleSelection,
}: ImageCardProps) {
  const { t } = useTranslation('images');
  const isProcessing = image.processingStatus === 'PROCESSING' || image.processingStatus === 'PENDING';
  const isFailed = image.processingStatus === 'FAILED';
  const isPsd = image.mimeType === 'application/x-photoshop'
    || image.mimeType === 'application/octet-stream' && image.name.endsWith('.psd')
    || image.name.toLowerCase().endsWith('.psd');

  const handleClick = (e: React.MouseEvent) => {
    // In selection mode, toggle selection
    if (isSelectionMode && onToggleSelection) {
      onToggleSelection(image.id);
      return;
    }
    // Shift+click to set as reference
    if (e.shiftKey) {
      e.preventDefault();
      onSetReference(image);
      return;
    }
    onClick(image);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onSetReference(image);
  };

  // Failed state
  if (isFailed) {
    return (
      <div
        onClick={handleClick}
        className={cn(
          'group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border cursor-pointer',
          isSelectionMode && isSelected
            ? 'border-white/30 ring-2 ring-white/20'
            : 'border-zinc-700'
        )}
      >
        <div className="w-full h-full flex flex-col items-center justify-center">
          <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
          <span className="text-xs text-red-400 font-medium">{t('gallery.generationFailed')}</span>
          {image.processingError && (
            <span className="text-xs text-zinc-500 mt-1 px-4 text-center line-clamp-2">
              {image.processingError}
            </span>
          )}
        </div>
        {/* Selection checkbox */}
        {isSelectionMode && (
          <div
            className={cn(
              'absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all',
              isSelected
                ? 'bg-white border-white'
                : 'bg-black/30 border-white/50 backdrop-blur-sm'
            )}
          >
            {isSelected && <Check size={14} className="text-black" />}
          </div>
        )}
        {/* Delete button for failed items - hidden in selection mode */}
        {!isSelectionMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(image.id);
            }}
            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 rounded-lg backdrop-blur-sm transition-colors"
            title={t('gallery.tooltipDelete')}
          >
            <X size={14} className="text-white" />
          </button>
        )}
      </div>
    );
  }

  // Processing state
  if (isProcessing) {
    return (
      <div className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-700">
        <div className="w-full h-full flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-white/70 animate-spin mb-2" />
          <span className="text-xs text-zinc-400">{t('gallery.processing')}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative aspect-square rounded-xl overflow-hidden bg-zinc-800 border transition-colors cursor-pointer',
        isSelectionMode && isSelected
          ? 'border-white/30 ring-2 ring-white/20'
          : isReference
            ? 'border-white/30 ring-2 ring-white/20'
            : 'border-zinc-700 hover:border-zinc-600'
      )}
    >
      {isPsd ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
          <Layers className="w-10 h-10 text-zinc-500 mb-2" />
          <span className="text-xs font-bold text-zinc-400 tracking-wider">PSD</span>
          <span className="text-[10px] text-zinc-600 mt-1 truncate max-w-[80%]">{image.name}</span>
        </div>
      ) : (
        <CachedImage
          asset={image}
          type="thumbnail"
          className="w-full h-full object-cover"
          fallback={<ImageIcon className="w-12 h-12 text-zinc-600" />}
        />
      )}

      {/* Selection checkbox */}
      {isSelectionMode && (
        <div
          className={cn(
            'absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all z-10',
            isSelected
              ? 'bg-white border-white'
              : 'bg-black/30 border-white/50 backdrop-blur-sm'
          )}
        >
          {isSelected && <Check size={14} className="text-black" />}
        </div>
      )}

      {/* Reference badge */}
      {isReference && !isSelectionMode && (
        <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-white/10 rounded-md text-xs font-medium text-white flex items-center gap-1">
          <Layers className="w-3 h-3" />
          {t('gallery.referenceBadge')}
        </div>
      )}

      {/* Overlay on hover - hidden in selection mode */}
      {!isSelectionMode && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Info */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-sm font-medium text-white truncate">{image.name}</p>
            <p className="text-xs text-zinc-400">
              {new Date(image.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Actions */}
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetReference(image);
              }}
              className={cn(
                'p-2 rounded-lg',
                'bg-zinc-900/80 text-zinc-300 hover:text-white/70 hover:bg-zinc-800',
                'transition-colors'
              )}
              title={t('gallery.tooltipUseAsReference')}
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(image.id);
              }}
              className={cn(
                'p-2 rounded-lg',
                'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800',
                'transition-colors'
              )}
              title={t('gallery.tooltipDownload')}
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(image.id);
              }}
              className={cn(
                'p-2 rounded-lg',
                'bg-zinc-900/80 text-zinc-300 hover:text-red-400 hover:bg-zinc-800',
                'transition-colors'
              )}
              title={t('gallery.tooltipDelete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// Skeleton loader for image cards
const ImageCardSkeleton = memo(function ImageCardSkeleton() {
  return (
    <div className="aspect-square rounded-xl bg-zinc-800 animate-pulse">
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-12 h-12 rounded-lg bg-zinc-700" />
      </div>
    </div>
  );
});

// Empty state component
const EmptyState = memo(function EmptyState() {
  const { t } = useTranslation('images');
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
        <ImagePlus className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{t('gallery.emptyTitle')}</h3>
      <p className="text-sm text-zinc-400 max-w-sm">
        {t('gallery.emptyHint')}
      </p>
    </div>
  );
});

// Error toast component
interface ErrorToastProps {
  message: string;
  onClose: () => void;
}

const ErrorToast = memo(function ErrorToast({ message, onClose }: ErrorToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-red-900/90 border border-red-700 text-white shadow-lg animate-in slide-in-from-bottom-5 fade-in">
      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
      <p className="text-sm">{message}</p>
      <button
        onClick={onClose}
        className="p-1 hover:bg-red-800 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});

// ==================== Main Component ====================

// Map kebab-case SortOption ids to camelCase i18n keys under `common.sort.*`.
const SORT_I18N_KEY: Record<SortOption, string> = {
  newest: 'newest',
  oldest: 'oldest',
  'name-asc': 'nameAsc',
  'name-desc': 'nameDesc',
};

export function ImagesPage() {
  const { t } = useTranslation('images');
  const { t: tCommon } = useTranslation('common');
  const { isDisabled: isServerDisabled } = useRequiresServer();
  // Pending tool mode from ToolsPage
  const pendingToolMode = useUIStore((state) => state.pendingToolMode);
  const clearPendingToolMode = useUIStore((state) => state.clearPendingToolMode);

  // Store state
  const images = useImageStore((state) => state.images);
  const imageModels = useImageStore((state) => state.imageModels);
  const isLoading = useImageStore((state) => state.isLoading);
  const isGenerating = useImageStore((state) => state.isGenerating);
  const error = useImageStore((state) => state.error);
  const prompt = useImageStore((state) => state.prompt);
  const negativePrompt = useImageStore((state) => state.negativePrompt);
  const model = useImageStore((state) => state.model);
  const aspectRatio = useImageStore((state) => state.aspectRatio);
  const showNegativePrompt = useImageStore((state) => state.showNegativePrompt);
  const referenceImage = useImageStore((state) => state.referenceImage);
  const referenceFile = useImageStore((state) => state.referenceFile);
  const referenceFilePreviewUrl = useImageStore((state) => state.referenceFilePreviewUrl);
  const imageStrength = useImageStore((state) => state.imageStrength);
  const showImg2ImgSettings = useImageStore((state) => state.showImg2ImgSettings);
  const sortBy = useImageStore((state) => state.sortBy);
  const filterBy = useImageStore((state) => state.filterBy);
  const searchQuery = useImageStore((state) => state.searchQuery);

  // Store actions
  const fetchImages = useImageStore((state) => state.fetchImages);
  const fetchModels = useImageStore((state) => state.fetchModels);
  const generateImageAction = useImageStore((state) => state.generateImage);
  const deleteImage = useImageStore((state) => state.deleteImage);
  const downloadImage = useImageStore((state) => state.downloadImage);
  const setPrompt = useImageStore((state) => state.setPrompt);
  const setNegativePrompt = useImageStore((state) => state.setNegativePrompt);
  const setModel = useImageStore((state) => state.setModel);
  const setAspectRatio = useImageStore((state) => state.setAspectRatio);
  const toggleNegativePrompt = useImageStore((state) => state.toggleNegativePrompt);
  const setReferenceImage = useImageStore((state) => state.setReferenceImage);
  const setReferenceFile = useImageStore((state) => state.setReferenceFile);
  const setImageStrength = useImageStore((state) => state.setImageStrength);
  const toggleImg2ImgSettings = useImageStore((state) => state.toggleImg2ImgSettings);
  const clearReferenceImage = useImageStore((state) => state.clearReferenceImage);
  const clearError = useImageStore((state) => state.clearError);
  const setSortBy = useImageStore((state) => state.setSortBy);

  // Image Editor tabs
  const openImageEditor = useEditorTabsStore((state) => state.openTab);
  const openTabWithLayers = useEditorTabsStore((state) => state.openTabWithLayers);

  // New Project modal
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [clipboardImageSize, setClipboardImageSize] = useState<{ width: number; height: number } | null>(null);
  const setFilterBy = useImageStore((state) => state.setFilterBy);
  const setSearchQuery = useImageStore((state) => state.setSearchQuery);
  const getFilteredImages = useImageStore((state) => state.getFilteredImages);

  // Get filtered images — the selector closure reads images/sortBy/filterBy/searchQuery,
  // so listing them as deps re-evaluates the memo whenever any of those change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredImages = useMemo(() => getFilteredImages(), [images, sortBy, filterBy, searchQuery, getFilteredImages]);

  // Token costs state
  const [tokenCosts, setTokenCosts] = useState<TokenCostsResponse | null>(null);
  
  // Storage picker modal state
  const [isStoragePickerOpen, setIsStoragePickerOpen] = useState(false);

  // Error modal state for failed assets
  const [errorModalState, setErrorModalState] = useState<{
    isOpen: boolean;
    errorMessage: string;
    assetName: string;
  }>({ isOpen: false, errorMessage: '', assetName: '' });

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Calculate estimated token cost for generation
  const generationTokenCost = useMemo(() => {
    if (!tokenCosts?.costs || !model) return 0;
    
    if (tokenCosts.modelPricing) {
      return calculateModelTokenCost(model, 'GEN_TEXT_TO_IMAGE', tokenCosts.modelPricing, tokenCosts.costs);
    }
    
    return tokenCosts.costs['GEN_TEXT_TO_IMAGE'] ?? 0;
  }, [tokenCosts, model]);

  // Fetch images, models, and token costs on mount
  useEffect(() => {
    fetchImages();
    fetchModels();
    getTokenCosts().then(costs => costs && setTokenCosts(costs));
  }, [fetchImages, fetchModels]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // Poll for processing assets
  useEffect(() => {
    const hasProcessing = images.some(
      (img) => img.processingStatus === 'PROCESSING' || img.processingStatus === 'PENDING'
    );
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchImages();
    }, 3000);
    return () => clearInterval(interval);
  }, [images, fetchImages]);

  // Ctrl+V to paste a clipboard image as the img2img reference. Skip when a
  // reference is already set or while generating; setReferenceFile auto-opens
  // the img2img collapsible. Text paste still passes through because we only
  // preventDefault when clipboardData actually has an image item.
  //
  // The pasted image is kept as a local File only — no upload to the user's
  // library. It's converted to base64 inline at generation time.
  useEffect(() => {
    if (referenceImage || referenceFile || isGenerating) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const file = imageFileFromPasteEvent(e, { namePrefix: 'ref' });
      if (!file) return;
      e.preventDefault();
      setReferenceFile(file);
      toast.success(t('toasts.clipboardAttached'));
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [referenceImage, referenceFile, isGenerating, setReferenceFile, t]);

  // Handlers
  const handleGenerate = useCallback(() => {
    generateImageAction();
  }, [generateImageAction]);

  const handleUpload = useCallback(async () => {
    const doUpload = async (file: File) => {
      try {
        const result = await uploadImage(file, { name: file.name });
        if (result) {
          fetchImages();
          toast.success(t('toasts.uploadOk'));
        } else {
          toast.error(t('toasts.uploadFailed'));
        }
      } catch (error) {
        console.error('Upload error:', error);
        toast.error(t('toasts.uploadFileFailed'));
      }
    };

    // Electron: use native file dialog
    if (window.electronAPI?.files?.selectFile) {
      try {
        const filePath = await window.electronAPI.files.selectFile({
          filters: [
            { name: 'Images & PSD', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'psd'] },
          ],
        });
        if (!filePath) return;

        const fileData = await window.electronAPI.files.readFile(filePath);
        if (!fileData) {
          toast.error(t('toasts.readFileFailed'));
          return;
        }

        const fileName = filePath.split(/[/\\]/).pop() || 'image';
        const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          webp: 'image/webp', gif: 'image/gif', psd: 'image/vnd.adobe.photoshop',
        };
        const file = new File([fileData], fileName, { type: mimeMap[ext] || 'image/png' });
        await doUpload(file);
      } catch (error) {
        console.error('Upload error:', error);
        toast.error(t('toasts.uploadFileFailed'));
      }
      return;
    }

    // Browser fallback: use HTML file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,.psd';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await doUpload(file);
    };
    input.click();
  }, [fetchImages, t]);

  const handleOpenLocal = useCallback(async () => {
    const openWithFile = (file: File) => {
      const blobUrl = URL.createObjectURL(file);
      const fakeAsset = {
        id: `local-${Date.now()}`,
        name: file.name,
        publicUrl: blobUrl,
        previewUrl: blobUrl,
        assetType: 'image',
        status: 'ready',
        processingStatus: 'READY',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as IrisAsset;
      openImageEditor(fakeAsset);
    };

    // Electron: use native file dialog
    if (window.electronAPI?.files?.selectFile) {
      try {
        const filePath = await window.electronAPI.files.selectFile({
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        });
        if (!filePath) return;

        const fileData = await window.electronAPI.files.readFile(filePath);
        if (!fileData) {
          toast.error(t('toasts.readFileFailed'));
          return;
        }

        const fileName = filePath.split(/[/\\]/).pop() || 'local-image';
        const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          webp: 'image/webp', gif: 'image/gif',
        };
        openWithFile(new File([fileData], fileName, { type: mimeMap[ext] || 'image/png' }));
      } catch (err) {
        console.error('Failed to open local image:', err);
        toast.error(t('toasts.openFileFailed', { error: err instanceof Error ? err.message : String(err) }));
      }
      return;
    }

    // Browser fallback: use HTML file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) openWithFile(file);
    };
    input.click();
  }, [openImageEditor, t]);

  const handleDownload = useCallback(
    (id: string) => {
      downloadImage(id);
    },
    [downloadImage]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setPendingDeleteId(id);
      setShowDeleteConfirm(true);
    },
    []
  );

  const handleCreateProject = useCallback((name: string, width: number, height: number, bgColor: string | null) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    if (bgColor) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
      }
    }
    const dataUrl = canvas.toDataURL('image/png');
    const layer = {
      id: Math.random().toString(36).substring(2, 10),
      name: 'Background',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal' as const,
      imageData: dataUrl,
      x: 0,
      y: 0,
      width,
      height,
    };
    const newAsset = {
      id: `local-${Date.now()}`, userId: '', name, storagePath: '',
      currentVersion: 1, assetType: 'IMAGE' as const, mimeType: 'application/x-photoshop',
      sizeBytes: 0, isPublic: false, previewUrl: dataUrl,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    openTabWithLayers(newAsset, [layer], dataUrl, width, height);
  }, [openTabWithLayers]);

  const handleImageClick = useCallback(
    async (image: IrisAsset) => {
      // Show error modal for failed assets
      if (image.processingStatus === 'FAILED') {
        setErrorModalState({
          isOpen: true,
          errorMessage: image.processingError || tCommon('errors.unknown'),
          assetName: image.name,
        });
        return;
      }
      // PSD files: fetch, parse layers, open with layer data
      const isPsdFile = image.mimeType === 'application/x-photoshop'
        || (image.mimeType === 'application/octet-stream' && image.name.endsWith('.psd'))
        || image.name.toLowerCase().endsWith('.psd');

      if (isPsdFile) {
        const url = image.previewUrl || image.publicUrl || '';
        if (!url) {
          toast.error(t('toasts.psdUrlMissing'));
          return;
        }
        try {
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          const result = importPsd(buffer);
          useImageEditorStore.getState().openEditorWithLayers(image, result.layers, result.compositeDataUrl || '', result.width, result.height, result.textLayers);
          toast.success(t('toasts.psdOpened', { name: image.name, count: result.layers.length }));
        } catch (error) {
          console.error('PSD open error:', error);
          toast.error(t('toasts.psdOpenFailed'));
        }
        return;
      }

      // Open editor - pendingToolMode will be consumed by ImageEditorPage
      openImageEditor(image);
    },
    [openImageEditor, t, tCommon]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  // Selection handlers
  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredImages.map((img) => img.id)));
  }, [filteredImages]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size > 0) {
      setShowDeleteConfirm(true);
    }
  }, [selectedIds]);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeletingSelected(true);
    try {
      if (pendingDeleteId) {
        // Single image delete
        await deleteImage(pendingDeleteId);
      } else {
        // Batch delete
        await Promise.all(Array.from(selectedIds).map((id) => deleteImage(id)));
        setSelectedIds(new Set());
        setIsSelectionMode(false);
      }
    } finally {
      setIsDeletingSelected(false);
      setShowDeleteConfirm(false);
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, selectedIds, deleteImage]);

  return (
    <div className="dt-split">
      {/* Left Panel - Generation Settings */}
      <div className="dt-sidepanel" style={{ width: 340 }}>
        {/* Panel Header */}
        <div className="dt-sidepanel-head">
          <Wand2 className="w-4 h-4" style={{ color: 'var(--iris-violet)' }} />
          {t('generate.title')}
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              {t('generate.prompt')} <span className="text-red-400">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('generate.promptPlaceholder')}
              disabled={isGenerating}
              className={cn(
                'w-full h-32 px-3 py-2.5 rounded-lg resize-none',
                'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500',
                'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'text-sm leading-relaxed'
              )}
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              {t('generate.promptHint')}
            </p>
          </div>

          {/* Negative Prompt (Collapsible) */}
          <div>
            <button
              onClick={toggleNegativePrompt}
              className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              {t('generate.negativePrompt')}
              {showNegativePrompt ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {showNegativePrompt && (
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder={t('generate.negativePromptPlaceholder')}
                disabled={isGenerating}
                className={cn(
                  'w-full h-20 px-3 py-2.5 mt-2 rounded-lg resize-none',
                  'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500',
                  'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'text-sm'
                )}
              />
            )}
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              {t('generate.model')}
            </label>
            <ModelSelector
              value={model}
              options={imageModels}
              onChange={setModel}
              disabled={isGenerating}
              placeholder={t('generate.selectModel')}
            />
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              {t('generate.aspectRatio')}
            </label>
            <div className="dt-ar-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio as AspectRatio)}
                  disabled={isGenerating}
                  className="dt-ar-tile"
                  data-active={ratio === aspectRatio}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Image-to-Image (Collapsible) */}
          <div>
            <button
              onClick={toggleImg2ImgSettings}
              className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              <Layers className="w-4 h-4" />
              {t('generate.img2img')}
              {(referenceImage || referenceFile) && (
                <span className="px-1.5 py-0.5 bg-white/10 text-white rounded text-xs">
                  {t('generate.active')}
                </span>
              )}
              {showImg2ImgSettings ? (
                <ChevronUp className="w-4 h-4 ml-auto" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-auto" />
              )}
            </button>

            {showImg2ImgSettings && (
              <div className="mt-3 space-y-3">
                {/* Reference Image — picked library asset or pending local file */}
                {referenceImage || referenceFile ? (
                  <div className="relative rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700">
                    <img
                      src={
                        referenceFile
                          ? referenceFilePreviewUrl ?? undefined
                          : referenceImage?.thumbnailUrl || referenceImage?.previewUrl || referenceImage?.publicUrl
                      }
                      alt={referenceFile ? referenceFile.name : referenceImage?.name}
                      className="w-full h-32 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <span className="text-xs text-white truncate max-w-[60%]">
                        {referenceFile ? referenceFile.name : referenceImage?.name}
                      </span>
                      <button
                        onClick={clearReferenceImage}
                        className="p-1 rounded bg-zinc-900/80 text-zinc-400 hover:text-white transition-colors"
                        title={t('generate.removeReference')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Select from Library button — cloud only, hidden in self-host */}
                    {!IS_SELF_HOST && (
                    <button
                      onClick={() => setIsStoragePickerOpen(true)}
                      disabled={isGenerating}
                      className={cn(
                        'w-full py-3 rounded-lg border border-zinc-700',
                        'flex items-center justify-center gap-2',
                        'bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-white',
                        'transition-colors cursor-pointer',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <FolderOpen className="w-5 h-5" />
                      <span className="text-sm font-medium">{t('generate.selectFromLibrary')}</span>
                    </button>
                    )}

                    {/* Upload from Computer button — keeps file local, no library upload */}
                    <button
                      onClick={async () => {
                        try {
                          const file = await pickImageFile({ namePrefix: 'ref' });
                          if (file) setReferenceFile(file);
                        } catch (error) {
                          console.error('Pick error:', error);
                          toast.error(t('toasts.attachRefFailed'));
                        }
                      }}
                      disabled={isGenerating}
                      className={cn(
                        'w-full py-2.5 rounded-lg border-2 border-dashed border-zinc-700',
                        'flex items-center justify-center gap-2',
                        'text-zinc-500 hover:text-zinc-400 hover:border-zinc-600',
                        'transition-colors cursor-pointer',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <Upload className="w-4 h-4" />
                      <span className="text-xs">{t('generate.uploadFromComputer')}</span>
                    </button>

                    {/* Paste from Clipboard button — keeps file local, no library upload */}
                    <button
                      onClick={async () => {
                        try {
                          const file = await imageFileFromClipboardApi({ namePrefix: 'ref' });
                          if (file) {
                            setReferenceFile(file);
                            toast.success(t('toasts.clipboardAttached'));
                          } else {
                            toast.error(t('toasts.noClipboardImage'));
                          }
                        } catch (error) {
                          const err = error as Error;
                          if (err.name === 'NotAllowedError') {
                            toast.error(t('toasts.clipboardDenied'));
                          } else {
                            console.error('Paste error:', err);
                            toast.error(t('toasts.clipboardReadFailed'));
                          }
                        }
                      }}
                      disabled={isGenerating}
                      className={cn(
                        'w-full py-2.5 rounded-lg border-2 border-dashed border-zinc-700',
                        'flex items-center justify-center gap-2',
                        'text-zinc-500 hover:text-zinc-400 hover:border-zinc-600',
                        'transition-colors cursor-pointer',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <ClipboardPaste className="w-4 h-4" />
                      <span className="text-xs">{t('generate.pasteFromClipboard')}</span>
                    </button>
                  </div>
                )}

                {/* Image Strength Slider */}
                {(referenceImage || referenceFile) && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-zinc-400">
                        {t('generate.imageStrength')}
                      </label>
                      <span className="text-xs text-zinc-500">
                        {Math.round(imageStrength * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={imageStrength * 100}
                      onChange={(e) => setImageStrength(Number(e.target.value) / 100)}
                      disabled={isGenerating}
                      className={cn(
                        'w-full h-2 rounded-lg appearance-none cursor-pointer',
                        'bg-zinc-700',
                        '[&::-webkit-slider-thumb]:appearance-none',
                        '[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4',
                        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/70',
                        '[&::-webkit-slider-thumb]:cursor-pointer',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      {t('generate.imageStrengthHint')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Generate Button */}
        <div className="dt-gen-bar">
          {generationTokenCost > 0 && (
            <div className="dt-gen-cost">
              <div className="flex items-center gap-1">
                <Coins className="w-3 h-3" />
                <span>{t('generate.estimatedTokens')}</span>
              </div>
              <span style={{ color: 'var(--text-2)' }}>{formatTokenCost(generationTokenCost)} credits</span>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating || isServerDisabled}
            title={isServerDisabled ? t('generate.serverRequired') : undefined}
            className="dt-gen-cta"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('generate.generating')}
              </>
            ) : (
              <>
                <ImagePlus className="w-5 h-5" />
                {t('generate.title')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Panel - Gallery */}
      <div className="dt-gallery">
        {/* Gallery Header */}
        <div className="dt-gallery-head" style={{ flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3">
            <ImageIcon className="w-5 h-5" style={{ color: 'var(--iris-violet)' }} />
            <h1 className="t-display" style={{ fontSize: 22 }}>{t('gallery.title')}</h1>
            {images.length > 0 && (
              <span className="pill">
                {filteredImages.length === images.length
                  ? images.length
                  : `${filteredImages.length} / ${images.length}`}
              </span>
            )}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  let detectedSize: { width: number; height: number } | null = null;

                  // Try to read clipboard image size
                  try {
                    const items = await navigator.clipboard.read();
                    for (const item of items) {
                      const imageTypes = item.types.filter(type => type.startsWith('image/'));
                      if (imageTypes.length > 0) {
                        const blob = await item.getType(imageTypes[0]);
                        const img = new Image();
                        img.onload = () => {
                          detectedSize = { width: img.naturalWidth, height: img.naturalHeight };
                          setClipboardImageSize(detectedSize);
                          setShowNewProjectModal(true);
                        };
                        img.onerror = () => {
                          setClipboardImageSize(null);
                          setShowNewProjectModal(true);
                        };
                        img.src = URL.createObjectURL(blob);
                        return; // Exit early, we'll set the modal in the onload callback
                      }
                    }
                  } catch (error) {
                    console.error('Failed to read clipboard:', error);
                  }

                  // If no image found or error occurred, just open modal
                  setClipboardImageSize(null);
                  setShowNewProjectModal(true);
                }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-white text-zinc-900 hover:bg-zinc-200',
                  'transition-colors text-sm font-medium'
                )}
              >
                <Plus className="w-4 h-4" />
                {tCommon('buttons.new')}
              </button>
              <button
                onClick={handleUpload}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white',
                  'transition-colors text-sm font-medium'
                )}
              >
                <Upload className="w-4 h-4" />
                {t('gallery.upload')}
              </button>
              <button
                onClick={handleOpenLocal}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white',
                  'transition-colors text-sm font-medium'
                )}
              >
                <FolderOpen className="w-4 h-4" />
                {t('gallery.open')}
              </button>
            </div>
          </div>

          {/* Bottom row: Search, Filter, Sort */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('gallery.searchPlaceholder')}
                className={cn(
                  'w-full pl-9 pr-3 py-2 rounded-lg',
                  'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500',
                  'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                  'text-sm'
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-700 rounded"
                >
                  <X className="w-3 h-3 text-zinc-400" />
                </button>
              )}
            </div>

            {/* Filter dropdown */}
            <div className="relative">
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                className={cn(
                  'appearance-none pl-9 pr-8 py-2 rounded-lg cursor-pointer',
                  'bg-zinc-800 border border-zinc-700 text-white',
                  'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                  'text-sm'
                )}
              >
                {FILTER_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`filter.${value}`)}
                  </option>
                ))}
              </select>
              <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className={cn(
                  'appearance-none pl-9 pr-8 py-2 rounded-lg cursor-pointer',
                  'bg-zinc-800 border border-zinc-700 text-white',
                  'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                  'text-sm'
                )}
              >
                {SORT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {tCommon(`sort.${SORT_I18N_KEY[value]}`)}
                  </option>
                ))}
              </select>
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            </div>

            {/* Selection Bar */}
            <SelectionBar
              isSelectionMode={isSelectionMode}
              selectedCount={selectedIds.size}
              totalCount={filteredImages.length}
              onToggleSelectionMode={handleToggleSelectionMode}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onDeleteSelected={handleDeleteSelected}
            />
          </div>
        </div>

        {/* Pending Tool Mode Banner */}
        {pendingToolMode && pendingToolMode.category === 'image' && (
          <div className="mx-4 mt-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wand2 className="w-5 h-5 text-white/60" />
              <span className="text-sm text-white">
                {t('gallery.selectForTool')} <strong>{pendingToolMode.title}</strong>
              </span>
            </div>
            <button
              onClick={clearPendingToolMode}
              className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
            >
              {tCommon('buttons.cancel')}
            </button>
          </div>
        )}

        {/* Gallery Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            // Loading state
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <ImageCardSkeleton key={i} />
              ))}
            </div>
          ) : images.length === 0 ? (
            // Empty state - no images at all
            <EmptyState />
          ) : filteredImages.length === 0 ? (
            // No results after filtering
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-zinc-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{t('gallery.noResults')}</h3>
              <p className="text-sm text-zinc-400 max-w-sm mb-4">
                {t('gallery.noResultsHint')}
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterBy('all');
                }}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium',
                  'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white',
                  'transition-colors'
                )}
              >
                {t('gallery.clearFilters')}
              </button>
            </div>
          ) : (
            // Image grid
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {filteredImages.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  onClick={handleImageClick}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onSetReference={setReferenceImage}
                  isReference={referenceImage?.id === image.id}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(image.id)}
                  onToggleSelection={handleToggleSelection}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error Toast */}
      {error && <ErrorToast message={error} onClose={clearError} />}

      {/* Storage Asset Picker Modal — cloud library, unavailable in self-host */}
      {!IS_SELF_HOST && (
        <StorageAssetPickerModal
          isOpen={isStoragePickerOpen}
          onClose={() => setIsStoragePickerOpen(false)}
          onSelect={setReferenceImage}
          assetType="IMAGE"
          title={t('reference.title')}
          description={t('reference.description')}
        />
      )}

      {/* Error Modal for Failed Assets */}
      <ErrorModal
        isOpen={errorModalState.isOpen}
        onClose={() => setErrorModalState({ isOpen: false, errorMessage: '', assetName: '' })}
        title={t('gallery.generationFailed')}
        message={`${errorModalState.assetName}\n\n${errorModalState.errorMessage}`}
      />

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreate={handleCreateProject}
        clipboardImageSize={clipboardImageSize}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setPendingDeleteId(null);
        }}
        onConfirm={handleConfirmDelete}
        title={t('delete.title')}
        message={pendingDeleteId
          ? t('delete.message', { count: 1 })
          : t('delete.message', { count: selectedIds.size })
        }
        confirmText={t('delete.confirm')}
        variant="danger"
        isLoading={isDeletingSelected}
      />
    </div>
  );
}
