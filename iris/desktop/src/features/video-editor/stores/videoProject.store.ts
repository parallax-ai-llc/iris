/**
 * Video Project Store
 * State management for video project CRUD and media pool
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  VideoProject,
  VideoProjectListItem,
  ProjectMedia,
  CreateVideoProjectInput,
  UpdateVideoProjectInput,
  SaveTimelineInput,
  AddMediaInput,
  MediaType,
  TimelineData,
  ExportOptions,
  ExportProgress,
} from '@/types/videoProject.types';
import * as videoProjectApi from '@/shared/api/videoProject.api';
import { rehydrateLocalMediaUrl } from '@/features/video-editor/components/modals/localMediaUrl';

// ==================== State Types ====================

interface VideoProjectState {
  // Projects List
  projects: VideoProjectListItem[];
  projectsTotal: number;
  projectsLoading: boolean;
  projectsError: string | null;

  // Current Project
  currentProject: VideoProject | null;
  currentProjectLoading: boolean;
  currentProjectError: string | null;

  // Provisional = opened from video but not yet saved to DB
  isProvisional: boolean;

  // Dirty State (unsaved changes)
  isDirty: boolean;
  lastSavedAt: string | null;

  // Auto-save
  autoSaveEnabled: boolean;
  autoSaveInterval: number; // milliseconds

  // Export
  isExporting: boolean;
  exportProgress: ExportProgress | null;
}

interface VideoProjectActions {
  // Projects List
  fetchProjects: (options?: { limit?: number; offset?: number; status?: string }) => Promise<void>;
  clearProjects: () => void;

  // Project CRUD
  initProvisionalProject: (name: string, width: number, height: number, frameRate: number) => void;
  createProject: (input: CreateVideoProjectInput) => Promise<VideoProject | null>;
  loadProject: (projectId: string) => Promise<VideoProject | null>;
  updateProject: (input: UpdateVideoProjectInput) => Promise<VideoProject | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  duplicateProject: (projectId: string) => Promise<VideoProject | null>;
  closeProject: () => void;

  // Timeline
  saveTimeline: (input?: SaveTimelineInput) => Promise<boolean>;
  updateTimelineData: (timelineData: TimelineData) => void;
  markDirty: () => void;
  markClean: () => void;

  // Media Pool
  addMedia: (input: AddMediaInput) => Promise<ProjectMedia | null>;
  removeMedia: (mediaId: string) => Promise<boolean>;
  refreshMediaPool: () => Promise<void>;

  // Auto-save
  setAutoSave: (enabled: boolean, interval?: number) => void;

  // Export
  startExport: (options: ExportOptions) => Promise<boolean>;
  pollExportStatus: () => Promise<ExportProgress | null>;
  clearExportState: () => void;
}

type VideoProjectStore = VideoProjectState & VideoProjectActions;

// ==================== Initial State ====================

const initialState: VideoProjectState = {
  projects: [],
  projectsTotal: 0,
  projectsLoading: false,
  projectsError: null,

  currentProject: null,
  currentProjectLoading: false,
  currentProjectError: null,

  isProvisional: false,

  isDirty: false,
  lastSavedAt: null,

  autoSaveEnabled: true,
  autoSaveInterval: 30000, // 30 seconds

  isExporting: false,
  exportProgress: null,
};

export const PROVISIONAL_TIMELINE_DATA: TimelineData = {
  version: 1,
  settings: { backgroundColor: '#000000', defaultTransitionDuration: 0.5, audioFadeDefault: 0.3 },
  tracks: [
    { id: 'track-video-1', type: 'video', name: 'Video 1', locked: false, muted: false, visible: true, height: 80, clips: [] },
    { id: 'track-audio-1', type: 'audio', name: 'Audio 1', locked: false, muted: false, visible: true, height: 60, clips: [] },
    { id: 'track-subtitle-1', type: 'subtitle', name: 'Subtitles', locked: false, muted: false, visible: true, height: 50, clips: [] },
  ],
};

// ==================== Helpers ====================

/**
 * Re-point every persisted local-media URL in a loaded project at the current
 * Electron media-server port. Local imports store `fileUrl`/`thumbnailUrl` (and
 * the timeline clips' `sourceUrl`) as `http://127.0.0.1:<port>/?path=...`, but
 * that port is reassigned on every app launch — so a reopened project's URLs
 * point at a dead port and the media renders as a placeholder. Rebuilding them
 * against the live port (keeping the `?path=` payload) restores the references.
 */
async function rehydrateProjectLocalMedia(project: VideoProject): Promise<VideoProject> {
  const mediaPool = await Promise.all(
    project.mediaPool.map(async (m) => ({
      ...m,
      fileUrl: await rehydrateLocalMediaUrl(m.fileUrl),
      thumbnailUrl: await rehydrateLocalMediaUrl(m.thumbnailUrl),
    })),
  );

  let timelineData = project.timelineData;
  if (timelineData?.tracks) {
    const tracks = await Promise.all(
      timelineData.tracks.map(async (track) => ({
        ...track,
        clips: await Promise.all(
          track.clips.map(async (clip) => ({
            ...clip,
            sourceUrl: await rehydrateLocalMediaUrl(clip.sourceUrl),
          })),
        ),
      })),
    );
    timelineData = { ...timelineData, tracks };
  }

  return { ...project, mediaPool, timelineData };
}

// ==================== Store ====================

export const useVideoProjectStore = create<VideoProjectStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ==================== Projects List ====================

    initProvisionalProject: (name, width, height, frameRate) => {
      set({
        currentProject: {
          id: `provisional-${Date.now()}`,
          userId: '',
          name,
          description: null,
          width,
          height,
          frameRate,
          timelineData: PROVISIONAL_TIMELINE_DATA,
          duration: 0,
          thumbnailUrl: null,
          status: 'draft',
          lastExportedAt: null,
          exportedVideoId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          mediaPool: [],
        },
        isProvisional: true,
        isDirty: false,
        lastSavedAt: null,
      });
    },

    fetchProjects: async (options) => {
      set({ projectsLoading: true, projectsError: null });

      const result = await videoProjectApi.getProjects(options);

      if (result.success && result.data) {
        set({
          projects: result.data.projects,
          projectsTotal: result.data.total,
          projectsLoading: false,
        });
      } else {
        set({
          projectsError: result.error || 'Failed to fetch projects',
          projectsLoading: false,
        });
      }
    },

    clearProjects: () => {
      set({ projects: [], projectsTotal: 0, projectsError: null });
    },

    // ==================== Project CRUD ====================

    createProject: async (input) => {
      set({ currentProjectLoading: true, currentProjectError: null });

      const result = await videoProjectApi.createProject(input);

      if (result.success && result.data) {
        const project = result.data;
        set({
          currentProject: project,
          currentProjectLoading: false,
          isDirty: false,
          lastSavedAt: project.updatedAt,
        });
        // Refresh projects list
        get().fetchProjects();
        return project;
      } else {
        set({
          currentProjectError: result.error || 'Failed to create project',
          currentProjectLoading: false,
        });
        return null;
      }
    },

    loadProject: async (projectId) => {
      set({ currentProjectLoading: true, currentProjectError: null });

      const result = await videoProjectApi.getProject(projectId);

      if (result.success && result.data) {
        // Re-point persisted local-media URLs at the live media-server port
        // (the port changes every app launch, so stale URLs render as placeholders).
        const project = await rehydrateProjectLocalMedia(result.data);
        set({
          currentProject: project,
          currentProjectLoading: false,
          isDirty: false,
          lastSavedAt: project.updatedAt,
        });
        return project;
      } else {
        set({
          currentProjectError: result.error || 'Failed to load project',
          currentProjectLoading: false,
        });
        return null;
      }
    },

    updateProject: async (input) => {
      const { currentProject } = get();
      if (!currentProject) return null;

      const result = await videoProjectApi.updateProject(currentProject.id, input);

      if (result.success && result.data) {
        const project = result.data;
        set({
          currentProject: project,
          lastSavedAt: project.updatedAt,
        });
        // Refresh projects list
        get().fetchProjects();
        return project;
      } else {
        set({ currentProjectError: result.error || 'Failed to update project' });
        return null;
      }
    },

    deleteProject: async (projectId) => {
      const result = await videoProjectApi.deleteProject(projectId);

      if (result.success) {
        const { currentProject } = get();
        if (currentProject?.id === projectId) {
          set({ currentProject: null, isDirty: false, lastSavedAt: null });
        }
        // Refresh projects list
        get().fetchProjects();
        return true;
      }
      return false;
    },

    duplicateProject: async (projectId) => {
      const result = await videoProjectApi.duplicateProject(projectId);

      if (result.success && result.data) {
        // Refresh projects list
        get().fetchProjects();
        return result.data;
      }
      return null;
    },

    closeProject: () => {
      set({
        currentProject: null,
        currentProjectError: null,
        isProvisional: false,
        isDirty: false,
        lastSavedAt: null,
      });
    },

    // ==================== Timeline ====================

    saveTimeline: async (input) => {
      const { currentProject, isProvisional } = get();
      if (!currentProject) return false;

      let projectId = currentProject.id;

      // Provisional project: persist to DB first
      if (isProvisional) {
        const createResult = await videoProjectApi.createProject({
          name: currentProject.name,
          width: currentProject.width,
          height: currentProject.height,
          frameRate: currentProject.frameRate,
        });
        if (!createResult.success || !createResult.data) return false;

        projectId = createResult.data.id;

        // Persist media pool items
        for (const media of currentProject.mediaPool) {
          await videoProjectApi.addMedia(projectId, {
            mediaType: media.mediaType as MediaType,
            name: media.name,
            externalId: media.externalId ?? undefined,
            fileUrl: media.fileUrl ?? undefined,
            thumbnailUrl: media.thumbnailUrl,
            duration: media.duration ?? undefined,
            width: media.width ?? undefined,
            height: media.height ?? undefined,
            fileSize: media.fileSize ?? undefined,
          });
        }

        set({ isProvisional: false });
      }

      const saveInput: SaveTimelineInput = input || {
        timelineData: currentProject.timelineData,
        duration: currentProject.duration,
      };

      const result = await videoProjectApi.saveTimeline(projectId, saveInput);

      if (result.success && result.data) {
        set({
          currentProject: result.data,
          isDirty: false,
          lastSavedAt: result.data.updatedAt,
        });
        get().fetchProjects();
        return true;
      }
      return false;
    },

    updateTimelineData: (timelineData) => {
      const { currentProject } = get();
      if (!currentProject) return;

      // Calculate duration from timeline
      let maxEndTime = 0;
      for (const track of timelineData.tracks) {
        for (const clip of track.clips) {
          if (clip.endTime > maxEndTime) {
            maxEndTime = clip.endTime;
          }
        }
      }

      set({
        currentProject: {
          ...currentProject,
          timelineData,
          duration: maxEndTime,
        },
        isDirty: true,
      });
    },

    markDirty: () => {
      set({ isDirty: true });
    },

    markClean: () => {
      set({ isDirty: false });
    },

    // ==================== Media Pool ====================

    addMedia: async (input) => {
      const { currentProject, isProvisional } = get();
      if (!currentProject) return null;

      // Check locally first to avoid unnecessary API call for duplicates
      if (input.externalId) {
        const existing = currentProject.mediaPool.find(
          (m) => m.externalId === input.externalId
        );
        if (existing) return existing;
      }

      // Provisional project: store locally, will be persisted on save
      if (isProvisional) {
        const localMedia: ProjectMedia = {
          id: `local-media-${Date.now()}`,
          projectId: currentProject.id,
          mediaType: input.mediaType,
          externalId: input.externalId ?? null,
          fileUrl: input.fileUrl ?? null,
          name: input.name,
          thumbnailUrl: input.thumbnailUrl ?? null,
          duration: input.duration ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          fileSize: input.fileSize ?? null,
          addedAt: new Date().toISOString(),
        };
        set({
          currentProject: { ...currentProject, mediaPool: [localMedia, ...currentProject.mediaPool] },
        });
        return localMedia;
      }

      const result = await videoProjectApi.addMedia(currentProject.id, input);

      if (result.success && result.data) {
        const media = result.data;
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, mediaPool: [media, ...state.currentProject.mediaPool] }
            : null,
        }));
        // Auto-enqueue background proxy generation if proxy mode is on.
        // Lazy import to avoid a circular dep with editor.store via proxyQueue.
        if (media.mediaType === 'video') {
          import('@/features/video-editor/stores/editor.store').then(({ useEditorStore }) => {
            if (useEditorStore.getState().proxyMode) {
              import('@/features/video-editor/stores/proxyQueue.store').then(({ useProxyQueueStore }) => {
                useProxyQueueStore.getState().enqueue(media, currentProject.id);
              });
            }
          });
        }
        return media;
      }

      return null;
    },

    removeMedia: async (mediaId) => {
      const { currentProject } = get();
      if (!currentProject) return false;

      const result = await videoProjectApi.removeMedia(currentProject.id, mediaId);

      if (result.success) {
        set({
          currentProject: {
            ...currentProject,
            mediaPool: currentProject.mediaPool.filter((m) => m.id !== mediaId),
          },
        });
        return true;
      }
      return false;
    },

    refreshMediaPool: async () => {
      const { currentProject } = get();
      if (!currentProject) return;

      const result = await videoProjectApi.getMediaPool(currentProject.id);

      if (result.success && result.data) {
        set({
          currentProject: {
            ...currentProject,
            mediaPool: result.data,
          },
        });
      }
    },

    // ==================== Auto-save ====================

    setAutoSave: (enabled, interval) => {
      set({
        autoSaveEnabled: enabled,
        ...(interval && { autoSaveInterval: interval }),
      });
    },

    // ==================== Export ====================

    startExport: async (options) => {
      const { currentProject } = get();
      if (!currentProject) return false;

      set({ isExporting: true, exportProgress: { status: 'preparing', progress: 0, message: 'Starting export...' } });

      const result = await videoProjectApi.startExport(currentProject.id, options);

      if (result.success && result.data) {
        set({ exportProgress: result.data });
        return true;
      } else {
        set({
          isExporting: false,
          exportProgress: { status: 'failed', progress: 0, message: result.error || 'Failed to start export', error: result.error },
        });
        return false;
      }
    },

    pollExportStatus: async () => {
      const { currentProject } = get();
      if (!currentProject) return null;

      const result = await videoProjectApi.getExportStatus(currentProject.id);

      if (result.success && result.data) {
        const progress = result.data;
        set({ exportProgress: progress });

        if (progress.status === 'completed' || progress.status === 'failed') {
          set({ isExporting: false });

          // Reload project to get updated exportedVideoId
          if (progress.status === 'completed') {
            get().loadProject(currentProject.id);
          }
        }

        return progress;
      }
      return null;
    },

    clearExportState: () => {
      set({ isExporting: false, exportProgress: null });
    },
  }))
);

// ==================== Selectors ====================

// Stable empty array to prevent infinite re-renders
const EMPTY_MEDIA_POOL: ProjectMedia[] = [];

export const selectCurrentProject = (state: VideoProjectStore) => state.currentProject;
export const selectProjects = (state: VideoProjectStore) => state.projects;
export const selectMediaPool = (state: VideoProjectStore) => state.currentProject?.mediaPool ?? EMPTY_MEDIA_POOL;
export const selectTimelineData = (state: VideoProjectStore) => state.currentProject?.timelineData;
export const selectIsDirty = (state: VideoProjectStore) => state.isDirty;
export const selectIsLoading = (state: VideoProjectStore) => state.currentProjectLoading || state.projectsLoading;

// ==================== Auto-save Hook ====================

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function setupAutoSave() {
  const unsubscribe = useVideoProjectStore.subscribe(
    (state) => ({ isDirty: state.isDirty, autoSaveEnabled: state.autoSaveEnabled }),
    ({ isDirty, autoSaveEnabled }) => {
      const { autoSaveInterval } = useVideoProjectStore.getState();

      // Clear existing timer
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }

      // Set up new timer if enabled and dirty
      if (autoSaveEnabled && isDirty) {
        const scheduleNext = () => {
          autoSaveTimer = setTimeout(async () => {
            const state = useVideoProjectStore.getState();
            if (state.isDirty && state.currentProject) {
              await state.saveTimeline();
            }
            // Re-check and schedule next only if still dirty and enabled
            const current = useVideoProjectStore.getState();
            if (current.autoSaveEnabled && current.isDirty) {
              scheduleNext();
            } else {
              autoSaveTimer = null;
            }
          }, autoSaveInterval);
        };
        scheduleNext();
      }
    }
  );

  return () => {
    unsubscribe();
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
  };
}
