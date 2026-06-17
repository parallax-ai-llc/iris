import { useEffect, useCallback, memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Video,
  Loader2,
  Settings2,
  ChevronDown,
  ChevronUp,
  Wand2,
  Upload,
  Film,
  AlertCircle,
  X,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ImageIcon,
  Clock,
  Coins,
  FolderOpen,
  Plus,
  Check,
  ClipboardPaste,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useVideoStore,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VIDEO_SORT_OPTIONS,
  VIDEO_FILTER_OPTIONS,
  type VideoAspectRatio,
  type VideoDuration,
  type VideoSortOption,
  type VideoFilterOption,
  type VideoToolType,
} from '@/features/videos/stores/video.store';
import type { UploadQueueItem } from '@/features/videos/stores/video.store';
import { getTokenCosts, calculateModelTokenCost } from '@/shared/api/token.api';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { VideoCard, VideoCardSkeleton } from '@/features/videos/components/VideoCard';
import { ModelSelector } from '@/shared/components/common';
import { StorageAssetPickerModal } from '@/features/storage/components';
import { IS_SELF_HOST } from '@/config/self-host';
import { ErrorModal } from '@/shared/components/ui/ErrorModal';
import { SelectionBar } from '@/shared/components/common/SelectionBar';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore, PROVISIONAL_TIMELINE_DATA } from '@/features/video-editor/stores/videoProject.store';
import { useUIStore } from '@/shared/stores/ui.store';
import { useRequiresServer } from '@/shared/hooks/useRequiresServer';
import { useCachedAssetUrl } from '@/shared/hooks/useCachedAssetUrl';
import type { IrisAsset, TokenCostsResponse } from '@/shared/api/types';
import type { VideoProjectListItem } from '@/types/videoProject.types';
import { supportsEndFrame, supportsImageToVideo } from '@/features/video-editor/lib/imageToVideoSupport';
import {
  imageFileFromPasteEvent,
  imageFileFromClipboardApi,
  pickImageFile,
} from '@/shared/lib/clipboard/pasteImageAsset';
import { toast } from '@/shared/lib/toast';

// ==================== Sub-components ====================

// Empty state component
const EmptyState = memo(function EmptyState() {
  const { t } = useTranslation('videos');
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
        <Video className="w-8 h-8 text-zinc-500" />
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

// Thumbnail tile for a chosen frame asset — uses authenticated/cached blob URL
// so the preview actually shows (raw /api/iris/assets/:id/thumbnail needs auth
// and won't load through a plain <img src>).
interface FrameThumbnailProps {
  image: IrisAsset;
  removeTitle: string;
  onClear: () => void;
}

const FrameThumbnail = memo(function FrameThumbnail({ image, removeTitle, onClear }: FrameThumbnailProps) {
  const { url } = useCachedAssetUrl(image, { type: 'thumbnail' });
  const fallback = image.thumbnailUrl || image.previewUrl || image.publicUrl || '';
  const isDirectUrl = (s: string) =>
    !!s && (s.startsWith('http') || s.startsWith('blob:') || s.startsWith('file:') || s.startsWith('data:'));
  const src = url || (isDirectUrl(fallback) ? fallback : '');

  return (
    <div className="relative rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700">
      {src ? (
        <img src={src} alt={image.name} className="w-full h-32 object-cover" />
      ) : (
        <div className="w-full h-32 flex items-center justify-center text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="text-xs text-white truncate max-w-[60%]">{image.name}</span>
        <button
          onClick={onClear}
          className="p-1 rounded bg-zinc-900/80 text-zinc-400 hover:text-white transition-colors"
          title={removeTitle}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

// Local-only thumbnail for a pasted/picked frame File — uses an object URL.
interface LocalFrameThumbnailProps {
  file: File;
  previewUrl: string | null;
  removeTitle: string;
  onClear: () => void;
}

const LocalFrameThumbnail = memo(function LocalFrameThumbnail({
  file,
  previewUrl,
  removeTitle,
  onClear,
}: LocalFrameThumbnailProps) {
  return (
    <div className="relative rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700">
      {previewUrl ? (
        <img src={previewUrl} alt={file.name} className="w-full h-32 object-cover" />
      ) : (
        <div className="w-full h-32 flex items-center justify-center text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="text-xs text-white truncate max-w-[60%]">{file.name}</span>
        <button
          onClick={onClear}
          className="p-1 rounded bg-zinc-900/80 text-zinc-400 hover:text-white transition-colors"
          title={removeTitle}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

// Frame slot — shared UI for start and end frame selection.
// Picked/pasted files stay local (passed up via onFileSelected); only the
// "Select from Library" path resolves to an IrisAsset.
interface FrameSlotProps {
  label: string;
  optional?: boolean;
  image: IrisAsset | null;
  file: File | null;
  filePreviewUrl: string | null;
  onClear: () => void;
  onPickFromLibrary: () => void;
  onFileSelected: (file: File) => void;
  isGenerating: boolean;
  removeTitle: string;
  selectLabel: string;
  uploadLabel: string;
  pasteLabel: string;
  uploadNamePrefix: string;
}

const FrameSlot = memo(function FrameSlot({
  label,
  optional = false,
  image,
  file,
  filePreviewUrl,
  onClear,
  onPickFromLibrary,
  onFileSelected,
  isGenerating,
  removeTitle,
  selectLabel,
  uploadLabel,
  pasteLabel,
  uploadNamePrefix,
}: FrameSlotProps) {
  const { t } = useTranslation('videos');
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        {optional && <span className="text-[10px] text-zinc-500">{t('generate.optional')}</span>}
      </div>
      {image ? (
        <FrameThumbnail image={image} removeTitle={removeTitle} onClear={onClear} />
      ) : file ? (
        <LocalFrameThumbnail
          file={file}
          previewUrl={filePreviewUrl}
          removeTitle={removeTitle}
          onClear={onClear}
        />
      ) : (
        <div className="space-y-2">
          {/* Select from Library — cloud only, hidden in self-host */}
          {!IS_SELF_HOST && (
          <button
            onClick={onPickFromLibrary}
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
            <span className="text-sm font-medium">{selectLabel}</span>
          </button>
          )}
          <button
            onClick={async () => {
              try {
                const picked = await pickImageFile({ namePrefix: uploadNamePrefix });
                if (picked) onFileSelected(picked);
              } catch (error) {
                console.error('Pick error:', error);
                toast.error(t('toasts.attachFrameFailed'));
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
            <span className="text-xs">{uploadLabel}</span>
          </button>
          <button
            onClick={async () => {
              try {
                const picked = await imageFileFromClipboardApi({ namePrefix: uploadNamePrefix });
                if (picked) {
                  onFileSelected(picked);
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
            <span className="text-xs">{pasteLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
});

// Progress bar for video generation
interface GenerationProgressProps {
  progress: number;
}

const GenerationProgress = memo(function GenerationProgress({ progress }: GenerationProgressProps) {
  const { t } = useTranslation('videos');
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-400">{t('generate.generatingProgress')}</span>
        <span className="text-xs text-zinc-500">{Math.round(progress)}%</span>
      </div>
      <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-slate-300 via-white to-slate-300 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
});

// Upload queue panel
interface UploadQueuePanelProps {
  queue: UploadQueueItem[];
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}

const UploadQueuePanel = memo(function UploadQueuePanel({ queue, onCancel, onRemove }: UploadQueuePanelProps) {
  const { t } = useTranslation('videos');
  if (queue.length === 0) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
        <Upload className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-300">
          {t('gallery.uploadingCount', { count: queue.filter((i) => i.status === 'uploading' || i.status === 'processing').length })}
        </span>
      </div>
      <div className="max-h-60 overflow-auto divide-y divide-zinc-800">
        {queue.map((item) => (
          <div key={item.id} className="px-3 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-300 truncate max-w-[200px]">{item.fileName}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">{formatSize(item.fileSize)}</span>
                {(item.status === 'uploading' || item.status === 'processing') && (
                  <button
                    onClick={() => onCancel(item.id)}
                    className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                {(item.status === 'done' || item.status === 'error') && (
                  <button
                    onClick={() => onRemove(item.id)}
                    className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {item.status === 'uploading' && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
                <span className="text-[10px] text-zinc-500">{t('gallery.statusUploading')}</span>
              </div>
            )}
            {item.status === 'processing' && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
                <span className="text-[10px] text-zinc-500">{t('gallery.statusProcessing')}</span>
              </div>
            )}
            {item.status === 'done' && (
              <div className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-green-400" />
                <span className="text-[10px] text-green-400">{t('gallery.statusComplete')}</span>
              </div>
            )}
            {item.status === 'error' && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-red-400 truncate">{item.error || t('gallery.uploadFailed')}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

// Add to Project Modal
interface AddToProjectModalProps {
  isOpen: boolean;
  video: IrisAsset | null;
  projects: VideoProjectListItem[];
  isLoading: boolean;
  onClose: () => void;
  onSelectProject: (projectId: string) => void;
  onCreateNewProject: () => void;
}

const AddToProjectModal = memo(function AddToProjectModal({
  isOpen,
  video,
  projects,
  isLoading,
  onClose,
  onSelectProject,
  onCreateNewProject,
}: AddToProjectModalProps) {
  const { t } = useTranslation('videos');
  if (!isOpen || !video) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">{t('addToProject.title')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-zinc-400 mb-4">
            {t('addToProject.description', { name: video.name })}
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 mb-4">{t('addToProject.empty')}</p>
              <button
                onClick={onCreateNewProject}
                className="flex items-center gap-2 px-4 py-2 mx-auto rounded-lg bg-white text-black font-medium hover:bg-zinc-200"
              >
                <Plus className="w-4 h-4" />
                {t('addToProject.create')}
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="flex items-center gap-3 w-full p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors text-left"
                >
                  <div className="w-16 h-10 rounded bg-zinc-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-5 h-5 text-zinc-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{project.name}</p>
                    <p className="text-xs text-zinc-500">
                      {project.mediaCount} {t('addToProject.mediaSuffix')} • {project.status}
                    </p>
                  </div>
                  <Check className="w-4 h-4 text-zinc-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        {projects.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-800">
            <button
              onClick={onCreateNewProject}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <Plus className="w-4 h-4" />
              {t('addToProject.create')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

// ==================== Main Component ====================

// Map kebab-case VideoSortOption ids to camelCase i18n keys under `common.sort.*`.
const SORT_I18N_KEY: Record<VideoSortOption, string> = {
  newest: 'newest',
  oldest: 'oldest',
  'name-asc': 'nameAsc',
  'name-desc': 'nameDesc',
};

export function VideosPage() {
  const { t } = useTranslation('videos');
  const { t: tCommon } = useTranslation('common');
  const { isDisabled: isServerDisabled } = useRequiresServer();
  // Pending tool mode from ToolsPage
  const pendingToolMode = useUIStore((state) => state.pendingToolMode);
  const clearPendingToolMode = useUIStore((state) => state.clearPendingToolMode);

  // Store state
  const videos = useVideoStore((state) => state.videos);
  const videoModels = useVideoStore((state) => state.videoModels);
  const isLoading = useVideoStore((state) => state.isLoading);
  const isGenerating = useVideoStore((state) => state.isGenerating);
  const generationProgress = useVideoStore((state) => state.generationProgress);
  const error = useVideoStore((state) => state.error);
  const prompt = useVideoStore((state) => state.prompt);
  const negativePrompt = useVideoStore((state) => state.negativePrompt);
  const model = useVideoStore((state) => state.model);
  const aspectRatio = useVideoStore((state) => state.aspectRatio);
  const duration = useVideoStore((state) => state.duration);
  const showNegativePrompt = useVideoStore((state) => state.showNegativePrompt);
  const referenceImage = useVideoStore((state) => state.referenceImage);
  const endFrameImage = useVideoStore((state) => state.endFrameImage);
  const referenceFile = useVideoStore((state) => state.referenceFile);
  const referenceFilePreviewUrl = useVideoStore((state) => state.referenceFilePreviewUrl);
  const endFrameFile = useVideoStore((state) => state.endFrameFile);
  const endFrameFilePreviewUrl = useVideoStore((state) => state.endFrameFilePreviewUrl);
  const showImg2VidSettings = useVideoStore((state) => state.showImg2VidSettings);
  const sortBy = useVideoStore((state) => state.sortBy);
  const filterBy = useVideoStore((state) => state.filterBy);
  const searchQuery = useVideoStore((state) => state.searchQuery);

  // Store actions
  const fetchVideos = useVideoStore((state) => state.fetchVideos);
  const fetchModels = useVideoStore((state) => state.fetchModels);
  const generateVideoAction = useVideoStore((state) => state.generateVideo);
  const deleteVideo = useVideoStore((state) => state.deleteVideo);
  const downloadVideo = useVideoStore((state) => state.downloadVideo);
  const setPrompt = useVideoStore((state) => state.setPrompt);
  const setNegativePrompt = useVideoStore((state) => state.setNegativePrompt);
  const setModel = useVideoStore((state) => state.setModel);
  const setAspectRatio = useVideoStore((state) => state.setAspectRatio);
  const setDuration = useVideoStore((state) => state.setDuration);
  const toggleNegativePrompt = useVideoStore((state) => state.toggleNegativePrompt);
  const setReferenceImage = useVideoStore((state) => state.setReferenceImage);
  const setEndFrameImage = useVideoStore((state) => state.setEndFrameImage);
  const setReferenceFile = useVideoStore((state) => state.setReferenceFile);
  const setEndFrameFile = useVideoStore((state) => state.setEndFrameFile);
  const toggleImg2VidSettings = useVideoStore((state) => state.toggleImg2VidSettings);
  const clearReferenceImage = useVideoStore((state) => state.clearReferenceImage);
  const clearEndFrameImage = useVideoStore((state) => state.clearEndFrameImage);
  const clearError = useVideoStore((state) => state.clearError);
  const setSortBy = useVideoStore((state) => state.setSortBy);
  const setFilterBy = useVideoStore((state) => state.setFilterBy);
  const setSearchQuery = useVideoStore((state) => state.setSearchQuery);
  const getFilteredVideos = useVideoStore((state) => state.getFilteredVideos);
  const uploadQueue = useVideoStore((state) => state.uploadQueue);
  const uploadVideoFile = useVideoStore((state) => state.uploadVideoFile);
  const cancelUpload = useVideoStore((state) => state.cancelUpload);
  const removeFromQueue = useVideoStore((state) => state.removeFromQueue);

  // Editor store
  const openEditor = useEditorStore((state) => state.openEditor);

  // Video project store
  const videoProjects = useVideoProjectStore((state) => state.projects);
  const videoProjectsLoading = useVideoProjectStore((state) => state.projectsLoading);
  const fetchVideoProjects = useVideoProjectStore((state) => state.fetchProjects);
  const addMediaToProject = useVideoProjectStore((state) => state.addMedia);
  const loadProject = useVideoProjectStore((state) => state.loadProject);
  const createProject = useVideoProjectStore((state) => state.createProject);
  const initProvisionalProject = useVideoProjectStore((state) => state.initProvisionalProject);

  // Get filtered videos — selector closure reads videos/sortBy/filterBy/searchQuery
  // from the store, listed here so the memo re-evaluates on any change.
  const filteredVideos = useMemo(
    () => getFilteredVideos(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videos, sortBy, filterBy, searchQuery, getFilteredVideos]
  );

  // Token costs state
  const [tokenCosts, setTokenCosts] = useState<TokenCostsResponse | null>(null);
  
  // Storage picker modal state
  const [isStoragePickerOpen, setIsStoragePickerOpen] = useState(false);
  const [storagePickerTarget, setStoragePickerTarget] = useState<'start' | 'end'>('start');

  // Whether the currently selected model supports end frame (Seedance, Kling 2.1, etc.)
  const endFrameSupported = useMemo(() => supportsEndFrame(model), [model]);

  // When the user is in image-to-video mode (section expanded or a frame picked),
  // restrict the model list to models that support image-to-video.
  const imageToVideoActive = showImg2VidSettings || !!referenceImage || !!endFrameImage;
  const availableVideoModels = useMemo(() => {
    if (!imageToVideoActive) return videoModels;
    return videoModels.filter((m) => supportsImageToVideo(m.id, m.provider));
  }, [videoModels, imageToVideoActive]);

  // If image-to-video becomes active and the current model isn't supported,
  // switch to the first supported model so the user isn't stuck on an unusable choice.
  useEffect(() => {
    if (!imageToVideoActive) return;
    if (availableVideoModels.length === 0) return;
    if (availableVideoModels.some((m) => m.id === model)) return;
    setModel(availableVideoModels[0].id);
  }, [imageToVideoActive, availableVideoModels, model, setModel]);

  // Add to project modal state
  const [addToProjectModalOpen, setAddToProjectModalOpen] = useState(false);
  const [selectedVideoForProject, setSelectedVideoForProject] = useState<IrisAsset | null>(null);

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
      return calculateModelTokenCost(
        model, 
        'GEN_TEXT_TO_VIDEO', 
        tokenCosts.modelPricing, 
        tokenCosts.costs,
        { durationSeconds: duration }
      );
    }
    
    // Fallback: multiply base cost by duration
    const baseCost = tokenCosts.costs['GEN_TEXT_TO_VIDEO'] ?? 0;
    return baseCost * duration;
  }, [tokenCosts, model, duration]);

  // Get supported options for selected model
  const selectedModel = videoModels.find((m) => m.id === model);
  const maxDuration = selectedModel?.maxDuration || 10;
  const supportedAspectRatios = selectedModel?.supportedAspectRatios || VIDEO_ASPECT_RATIOS;
  const supportedDurations =
    selectedModel?.supportedDurations?.length
      ? selectedModel.supportedDurations
      : Array.from(VIDEO_DURATIONS);

  // Fetch videos, models, and token costs on mount
  useEffect(() => {
    fetchVideos();
    fetchModels();
    getTokenCosts().then(costs => costs && setTokenCosts(costs));
  }, [fetchVideos, fetchModels]);

  // Fetch video projects when modal opens
  useEffect(() => {
    if (addToProjectModalOpen) {
      fetchVideoProjects();
    }
  }, [addToProjectModalOpen, fetchVideoProjects]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // Drop end frame selection if the active model no longer supports it
  useEffect(() => {
    if (!endFrameSupported && endFrameImage) {
      clearEndFrameImage();
    }
  }, [endFrameSupported, endFrameImage, clearEndFrameImage]);

  // Ctrl+V to paste a clipboard image as the img2vid start frame (or end frame
  // when the start frame slot is already filled and end frames are supported).
  // Skipped while generating; the store auto-opens the img2vid collapsible on
  // setReferenceFile / setEndFrameFile. The pasted image stays local — no
  // upload happens here, base64 is sent inline at generation time.
  useEffect(() => {
    if (isGenerating) return;

    let setSlot: ((file: File) => void) | null = null;
    let namePrefix = 'ref';
    const startFilled = !!referenceImage || !!referenceFile;
    const endFilled = !!endFrameImage || !!endFrameFile;
    if (!startFilled) {
      setSlot = setReferenceFile;
      namePrefix = 'ref';
    } else if (endFrameSupported && !endFilled) {
      setSlot = setEndFrameFile;
      namePrefix = 'end';
    }
    if (!setSlot) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (!setSlot) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const file = imageFileFromPasteEvent(e, { namePrefix });
      if (!file) return;
      e.preventDefault();
      setSlot(file);
      toast.success(t('toasts.clipboardAttached'));
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [
    isGenerating,
    referenceImage,
    referenceFile,
    endFrameImage,
    endFrameFile,
    endFrameSupported,
    setReferenceFile,
    setEndFrameFile,
    t,
  ]);

  // Handlers
  const handleGenerate = useCallback(() => {
    generateVideoAction();
  }, [generateVideoAction]);

  const handleUpload = useCallback(async () => {
    // Electron: use native file dialog
    if (window.electronAPI?.files?.selectFile) {
      try {
        const filePath = await window.electronAPI.files.selectFile({
          filters: [
            { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
          ],
        });
        if (!filePath) return;

        const fileData = await window.electronAPI.files.readFile(filePath);
        if (!fileData) {
          useVideoStore.setState({ error: t('toasts.readFileFailed') });
          return;
        }

        const fileName = filePath.split(/[/\\]/).pop() || 'video';
        const ext = fileName.split('.').pop()?.toLowerCase() || 'mp4';
        const mimeMap: Record<string, string> = {
          mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
          avi: 'video/x-msvideo', mkv: 'video/x-matroska',
        };
        const file = new File([fileData], fileName, { type: mimeMap[ext] || 'video/mp4' });
        uploadVideoFile(file);
      } catch (error) {
        console.error('Video upload error:', error);
        useVideoStore.setState({ error: t('toasts.uploadVideoFailed') });
      }
      return;
    }

    // Browser fallback: use HTML file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm,video/quicktime,video/x-msvideo,.mkv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) uploadVideoFile(file);
    };
    input.click();
  }, [uploadVideoFile, t]);

  const handleOpenLocalVideo = useCallback(async () => {
    const openWithFileUrl = async (fileUrl: string, fileName: string) => {
      const projectName = fileName.replace(/\.[^/.]+$/, '');

      // HTML5 video 요소로 메타데이터만 추출
      const { duration, width, height } = await new Promise<{ duration: number; width: number; height: number }>(
        (resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          const onMeta = () => {
            resolve({ duration: video.duration || 0, width: video.videoWidth || 1920, height: video.videoHeight || 1080 });
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('error', onErr);
          };
          const onErr = () => {
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('error', onErr);
            resolve({ duration: 0, width: 1920, height: 1080 });
          };
          video.addEventListener('loadedmetadata', onMeta);
          video.addEventListener('error', onErr);
          video.src = fileUrl;
        }
      );

      // 임시 프로젝트 생성 (DB 저장 없음, 사용자가 저장할 때만 DB에 기록)
      initProvisionalProject(projectName, width || 1920, height || 1080, 30);

      // 미디어 풀에 로컬 파일 추가 (provisional이므로 로컬 전용)
      const media = await addMediaToProject({
        mediaType: 'video',
        name: fileName,
        fileUrl,
        duration,
        width: width || 1920,
        height: height || 1080,
      });

      // 비디오 에디터 열기
      const editorStore = useEditorStore.getState();
      editorStore.loadFromTimelineData(PROVISIONAL_TIMELINE_DATA as Parameters<typeof editorStore.loadFromTimelineData>[0], duration || 10);

      // 타임라인에 비디오 트랙이 없으면 추가
      const { tracks } = useEditorStore.getState();
      let videoTrack = tracks.find((t) => t.type === 'video');
      if (!videoTrack) {
        videoTrack = editorStore.addTrack('video');
      }

      // 타임라인에 클립 추가
      // assetId에 fileUrl을 직접 사용 → useCachedAssetUrlById가 blob:/file:// URL을 직접 반환
      if (media) {
        editorStore.addClip(videoTrack.id, {
          type: 'video',
          assetId: fileUrl,
          name: fileName,
          startTime: 0,
          endTime: duration || 10,
          sourceStartTime: 0,
          sourceEndTime: duration || 10,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          volume: 1,
          muted: false,
          speed: 1,
          blendMode: 'normal',
          effects: [],
          keyframes: [],
        } as unknown as Parameters<typeof editorStore.addClip>[1]);
      }
    };

    // Electron: use native file dialog + file:// URL (파일 전체 읽기 불필요)
    if (window.electronAPI?.files?.selectFile) {
      try {
        const filePath = await window.electronAPI.files.selectFile({
          filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }],
        });
        if (!filePath) return;

        const fileName = filePath.split(/[/\\]/).pop() || 'local-video';
        const normalizedPath = filePath.replace(/\\/g, '/');
        const fileUrl = `file:///${normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath}`;
        await openWithFileUrl(fileUrl, fileName);
      } catch (err) {
        console.error('Failed to open local video:', err);
        useVideoStore.setState({ error: t('toasts.openVideoFailed', { error: err instanceof Error ? err.message : String(err) }) });
      }
      return;
    }

    // Browser fallback: use HTML file input + blob URL
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm,video/quicktime,video/x-msvideo,.mkv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const blobUrl = URL.createObjectURL(file);
        await openWithFileUrl(blobUrl, file.name);
      } catch (err) {
        console.error('Failed to open local video:', err);
        useVideoStore.setState({ error: t('toasts.openVideoFailed', { error: err instanceof Error ? err.message : String(err) }) });
      }
    };
    input.click();
  }, [initProvisionalProject, addMediaToProject, t]);

  const handleDownload = useCallback(
    (id: string) => {
      downloadVideo(id);
    },
    [downloadVideo]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setPendingDeleteId(id);
      setShowDeleteConfirm(true);
    },
    []
  );

  const handleVideoClick = useCallback(
    (video: IrisAsset) => {
      // Show error modal for failed assets
      if (video.processingStatus === 'FAILED') {
        setErrorModalState({
          isOpen: true,
          errorMessage: video.processingError || tCommon('errors.unknown'),
          assetName: video.name,
        });
        return;
      }
      // If pending video tool mode, open editor then auto-open tool modal
      if (pendingToolMode && pendingToolMode.category === 'video' && pendingToolMode.mode) {
        openEditor(video);
        const mode = pendingToolMode.mode as VideoToolType;
        clearPendingToolMode();
        setTimeout(() => {
          useVideoStore.getState().openToolModal(mode);
        }, 300);
        return;
      }
      // Open editor directly instead of detail modal
      openEditor(video);
    },
    [openEditor, pendingToolMode, clearPendingToolMode, tCommon]
  );

  // Add to project handlers
  const handleAddToProject = useCallback((video: IrisAsset) => {
    setSelectedVideoForProject(video);
    setAddToProjectModalOpen(true);
  }, []);

  const handleSelectProject = useCallback(async (projectId: string) => {
    if (!selectedVideoForProject) return;

    // Load the project first to add media
    await loadProject(projectId);

    // Add the video to the project's media pool
    const duration = (selectedVideoForProject.metadata?.duration as number) || 0;
    const width = (selectedVideoForProject.metadata?.width as number) || 1920;
    const height = (selectedVideoForProject.metadata?.height as number) || 1080;

    await addMediaToProject({
      mediaType: 'video',
      name: selectedVideoForProject.name,
      externalId: selectedVideoForProject.id,
      fileUrl: selectedVideoForProject.publicUrl || selectedVideoForProject.previewUrl,
      thumbnailUrl: selectedVideoForProject.thumbnailUrl,
      duration,
      width,
      height,
      fileSize: (selectedVideoForProject.metadata?.fileSize as number) || undefined,
    });

    // Close modal
    setAddToProjectModalOpen(false);
    setSelectedVideoForProject(null);
  }, [selectedVideoForProject, loadProject, addMediaToProject]);

  const handleCreateNewProject = useCallback(async () => {
    if (!selectedVideoForProject) return;

    // Create a new project with the video name
    const project = await createProject({
      name: t('addToProject.namePrefix', { name: selectedVideoForProject.name }),
    });

    if (project) {
      // Add the video to the new project
      const duration = (selectedVideoForProject.metadata?.duration as number) || 0;
      const width = (selectedVideoForProject.metadata?.width as number) || 1920;
      const height = (selectedVideoForProject.metadata?.height as number) || 1080;

      await addMediaToProject({
        mediaType: 'video',
        name: selectedVideoForProject.name,
        externalId: selectedVideoForProject.id,
        fileUrl: selectedVideoForProject.publicUrl || selectedVideoForProject.previewUrl,
        thumbnailUrl: selectedVideoForProject.thumbnailUrl,
        duration,
        width,
        height,
        fileSize: (selectedVideoForProject.metadata?.fileSize as number) || undefined,
      });
    }

    // Close modal
    setAddToProjectModalOpen(false);
    setSelectedVideoForProject(null);
  }, [selectedVideoForProject, createProject, addMediaToProject, t]);

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
    setSelectedIds(new Set(filteredVideos.map((vid) => vid.id)));
  }, [filteredVideos]);

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
        // Single video delete
        await deleteVideo(pendingDeleteId);
      } else {
        // Batch delete
        await Promise.all(Array.from(selectedIds).map((id) => deleteVideo(id)));
        setSelectedIds(new Set());
        setIsSelectionMode(false);
      }
    } finally {
      setIsDeletingSelected(false);
      setShowDeleteConfirm(false);
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, selectedIds, deleteVideo]);

  return (
    <div className="dt-split">
      {/* Left Panel - Generation Settings */}
      <div className="dt-sidepanel" style={{ width: 340 }}>
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

          {/* Image-to-Video (Collapsible) */}
          <div>
            <button
              onClick={toggleImg2VidSettings}
              className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              {t('generate.img2vid')}
              {(referenceImage || endFrameImage) && (
                <span className="px-1.5 py-0.5 bg-white/10 text-white rounded text-xs">
                  {t('generate.active')}
                </span>
              )}
              {showImg2VidSettings ? (
                <ChevronUp className="w-4 h-4 ml-auto" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-auto" />
              )}
            </button>

            {showImg2VidSettings && (
              <div className="mt-3 space-y-4">
                {/* Start Frame */}
                <FrameSlot
                  label={t('generate.startFrame')}
                  image={referenceImage}
                  file={referenceFile}
                  filePreviewUrl={referenceFilePreviewUrl}
                  onClear={clearReferenceImage}
                  onPickFromLibrary={() => {
                    setStoragePickerTarget('start');
                    setIsStoragePickerOpen(true);
                  }}
                  onFileSelected={setReferenceFile}
                  isGenerating={isGenerating}
                  removeTitle={t('generate.removeReference')}
                  selectLabel={t('generate.selectFromLibrary')}
                  uploadLabel={t('generate.uploadFromComputer')}
                  pasteLabel={t('generate.pasteFromClipboard')}
                  uploadNamePrefix="ref"
                />

                {/* End Frame — only for models that support last-frame (Seedance, Kling 2.1, ...) */}
                {endFrameSupported && (
                  <FrameSlot
                    label={t('generate.endFrame')}
                    optional
                    image={endFrameImage}
                    file={endFrameFile}
                    filePreviewUrl={endFrameFilePreviewUrl}
                    onClear={clearEndFrameImage}
                    onPickFromLibrary={() => {
                      setStoragePickerTarget('end');
                      setIsStoragePickerOpen(true);
                    }}
                    onFileSelected={setEndFrameFile}
                    isGenerating={isGenerating}
                    removeTitle={t('generate.removeEndFrame')}
                    selectLabel={t('generate.selectFromLibrary')}
                    uploadLabel={t('generate.uploadFromComputer')}
                    pasteLabel={t('generate.pasteFromClipboard')}
                    uploadNamePrefix="end"
                  />
                )}

                <p className="text-xs text-zinc-500">
                  {endFrameSupported
                    ? t('generate.startEndFrameHint')
                    : t('generate.firstFrameHint')}
                </p>
              </div>
            )}
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              {t('generate.model')}
            </label>
            <ModelSelector
              value={model}
              options={availableVideoModels}
              onChange={setModel}
              disabled={isGenerating || availableVideoModels.length === 0}
              placeholder={availableVideoModels.length === 0 ? t('generate.loadingModels') : t('generate.selectModel')}
            />
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              {t('generate.aspectRatio')}
            </label>
            <div className="dt-ar-grid">
              {VIDEO_ASPECT_RATIOS.map((ratio) => {
                const isSupported = supportedAspectRatios.includes(ratio);
                return (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio as VideoAspectRatio)}
                    disabled={isGenerating || !isSupported}
                    className="dt-ar-tile"
                    data-active={ratio === aspectRatio}
                    style={!isSupported ? { opacity: 0.3 } : undefined}
                    title={!isSupported ? t('generate.notSupported') : undefined}
                  >
                    {ratio}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              {t('generate.duration')}
            </label>
            <div className="dt-ar-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {VIDEO_DURATIONS.map((d) => {
                const isSupported = supportedDurations.includes(d) && d <= maxDuration;
                return (
                  <button
                    key={d}
                    onClick={() => setDuration(d as VideoDuration)}
                    disabled={isGenerating || !isSupported}
                    className="dt-ar-tile"
                    data-active={d === duration}
                    style={!isSupported ? { opacity: 0.3 } : undefined}
                    title={!isSupported ? t('generate.notSupported') : undefined}
                  >
                    <Clock className="w-3 h-3 mr-1" />
                    {d}s
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="p-4 border-t border-zinc-800 space-y-3">
          {isGenerating && <GenerationProgress progress={generationProgress} />}

          {/* Token cost indicator */}
          {!isGenerating && generationTokenCost > 0 && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-zinc-400">
                <Coins className="w-3 h-3" />
                <span>{t('generate.estimatedTokens')}</span>
              </div>
              <span className="text-zinc-300">{formatTokenCost(generationTokenCost)} credits</span>
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
                <Video className="w-5 h-5" />
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
            <Film className="w-5 h-5" style={{ color: 'var(--iris-blue)' }} />
            <h1 className="t-display" style={{ fontSize: 22 }}>{t('gallery.title')}</h1>
            {videos.length > 0 && (
              <span className="pill">
                {filteredVideos.length === videos.length
                  ? videos.length
                  : `${filteredVideos.length} / ${videos.length}`}
              </span>
            )}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
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
                onClick={handleOpenLocalVideo}
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
                onChange={(e) => setFilterBy(e.target.value as VideoFilterOption)}
                className={cn(
                  'appearance-none pl-9 pr-8 py-2 rounded-lg cursor-pointer',
                  'bg-zinc-800 border border-zinc-700 text-white',
                  'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                  'text-sm'
                )}
              >
                {VIDEO_FILTER_OPTIONS.map((value) => (
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
                onChange={(e) => setSortBy(e.target.value as VideoSortOption)}
                className={cn(
                  'appearance-none pl-9 pr-8 py-2 rounded-lg cursor-pointer',
                  'bg-zinc-800 border border-zinc-700 text-white',
                  'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                  'text-sm'
                )}
              >
                {VIDEO_SORT_OPTIONS.map((value) => (
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
              totalCount={filteredVideos.length}
              onToggleSelectionMode={handleToggleSelectionMode}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onDeleteSelected={handleDeleteSelected}
            />
          </div>
        </div>

        {/* Pending Tool Mode Banner */}
        {pendingToolMode && pendingToolMode.category === 'video' && (
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <VideoCardSkeleton key={i} />
              ))}
            </div>
          ) : videos.length === 0 ? (
            // Empty state - no videos at all
            <EmptyState />
          ) : filteredVideos.length === 0 ? (
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
            // Video grid
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredVideos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onClick={handleVideoClick}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onSetReference={setReferenceImage}
                  onAddToProject={handleAddToProject}
                  isReference={referenceImage?.id === video.id}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(video.id)}
                  onToggleSelection={handleToggleSelection}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error Toast */}
      {error && <ErrorToast message={error} onClose={clearError} />}

      {/* Upload Queue */}
      <UploadQueuePanel queue={uploadQueue} onCancel={cancelUpload} onRemove={removeFromQueue} />

      {/* Storage Asset Picker Modal — cloud library, unavailable in self-host */}
      {!IS_SELF_HOST && (
        <StorageAssetPickerModal
          isOpen={isStoragePickerOpen}
          onClose={() => setIsStoragePickerOpen(false)}
          onSelect={(asset) => {
            if (storagePickerTarget === 'end') {
              setEndFrameImage(asset);
            } else {
              setReferenceImage(asset);
            }
          }}
          assetType="IMAGE"
          title={t('generate.img2vid')}
          description={
            storagePickerTarget === 'end'
              ? t('generate.endFrameHint')
              : t('generate.firstFrameHint')
          }
        />
      )}

      {/* Add to Project Modal */}
      <AddToProjectModal
        isOpen={addToProjectModalOpen}
        video={selectedVideoForProject}
        projects={videoProjects}
        isLoading={videoProjectsLoading}
        onClose={() => {
          setAddToProjectModalOpen(false);
          setSelectedVideoForProject(null);
        }}
        onSelectProject={handleSelectProject}
        onCreateNewProject={handleCreateNewProject}
      />

      {/* Error Modal for Failed Assets */}
      <ErrorModal
        isOpen={errorModalState.isOpen}
        onClose={() => setErrorModalState({ isOpen: false, errorMessage: '', assetName: '' })}
        title={t('gallery.generationFailed')}
        message={`${errorModalState.assetName}\n\n${errorModalState.errorMessage}`}
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
