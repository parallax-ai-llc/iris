/**
 * Workspace snapshot — what the assistant needs to know when no editor is
 * open (home, galleries, projects, workflows …): where the user is, which
 * generation models exist, and recent assets/projects it can open by id.
 */

import { useUIStore } from '@/shared/stores/ui.store';
import { useConnectionStore } from '@/shared/stores/connection.store';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useImageStore } from '@/features/images/stores/image.store';
import { useVideoStore } from '@/features/videos/stores/video.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import type { IrisAsset } from '@/shared/api/types';

const RECENT_LIMIT = 8;

export interface WorkspaceModelSnapshot {
  id: string;
  name: string;
  /** Needs an input image — can't be used for text-only generation. */
  imageRequired?: boolean;
  supportedDurations?: number[];
  supportedAspectRatios?: string[];
}

export interface WorkspaceAssetSnapshot {
  id: string;
  name: string;
  status?: string;
}

export interface WorkspaceSnapshot {
  currentPage: string;
  /** Workflow open in the workflow editor, if any. */
  editingWorkflowId: string | null;
  isSignedIn: boolean;
  isServerConnected: boolean;
  imageModels: WorkspaceModelSnapshot[];
  selectedImageModel: string;
  videoModels: WorkspaceModelSnapshot[];
  selectedVideoModel: string;
  recentImages: WorkspaceAssetSnapshot[];
  recentVideos: WorkspaceAssetSnapshot[];
  recentProjects: WorkspaceAssetSnapshot[];
}

function toAssetSnapshot(asset: IrisAsset): WorkspaceAssetSnapshot {
  return { id: asset.id, name: asset.name, status: asset.processingStatus };
}

export function buildWorkspaceSnapshot(): WorkspaceSnapshot {
  const ui = useUIStore.getState();
  const images = useImageStore.getState();
  const videos = useVideoStore.getState();
  const projects = useVideoProjectStore.getState().projects;

  return {
    currentPage: ui.currentPage,
    editingWorkflowId: ui.editingWorkflowId,
    isSignedIn: useAuthStore.getState().isAuthenticated,
    isServerConnected: useConnectionStore.getState().isServerConnected,
    imageModels: images.imageModels.map((m) => ({
      id: m.id,
      name: m.name,
      imageRequired: m.imageRequired,
    })),
    selectedImageModel: images.model,
    videoModels: videos.videoModels.map((m) => ({
      id: m.id,
      name: m.name,
      imageRequired: m.imageRequired,
      supportedDurations: m.supportedDurations,
      supportedAspectRatios: m.supportedAspectRatios,
    })),
    selectedVideoModel: videos.model,
    recentImages: images.images.slice(0, RECENT_LIMIT).map(toAssetSnapshot),
    recentVideos: videos.videos.slice(0, RECENT_LIMIT).map(toAssetSnapshot),
    recentProjects: projects.slice(0, RECENT_LIMIT).map((p) => ({ id: p.id, name: p.name })),
  };
}
