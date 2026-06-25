/**
 * Video Project API Client
 * API for video project management (Premiere Pro-style editor)
 */

import { apiClient } from './client';
import { localApiCall, shouldUseLocalEngine } from './iris-local';
import type {
  VideoProject,
  VideoProjectListItem,
  VideoProjectsListResponse,
  ProjectMedia,
  CreateVideoProjectInput,
  UpdateVideoProjectInput,
  SaveTimelineInput,
  AddMediaInput,
  ExportOptions,
  ExportProgress,
  ExportDownloadInfo,
} from '@/types/videoProject.types';

// ==================== Projects ====================

export async function createProject(input: CreateVideoProjectInput) {
  if (await shouldUseLocalEngine()) return localApiCall<VideoProject>('POST', '/api/video-projects', input);
  return apiClient.post<VideoProject>('/api/video-projects', input, { requireAuth: true });
}

export async function getProjects(options?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.append('limit', String(options.limit));
  if (options?.offset !== undefined) params.append('offset', String(options.offset));
  if (options?.status) params.append('status', options.status);

  const query = params.toString();
  const endpoint = `/api/video-projects${query ? `?${query}` : ''}`;

  if (await shouldUseLocalEngine()) return localApiCall<VideoProjectsListResponse>('GET', endpoint);
  return apiClient.get<VideoProjectsListResponse>(endpoint, { requireAuth: true });
}

export async function getProject(projectId: string) {
  if (await shouldUseLocalEngine()) return localApiCall<VideoProject>('GET', `/api/video-projects/${projectId}`);
  return apiClient.get<VideoProject>(`/api/video-projects/${projectId}`, { requireAuth: true });
}

export async function findProjectByAsset(externalId: string) {
  const endpoint = `/api/video-projects/by-asset/${encodeURIComponent(externalId)}`;
  if (await shouldUseLocalEngine()) return localApiCall<VideoProject>('GET', endpoint);
  return apiClient.get<VideoProject>(endpoint, { requireAuth: true });
}

export async function updateProject(projectId: string, input: UpdateVideoProjectInput) {
  if (await shouldUseLocalEngine()) return localApiCall<VideoProject>('PATCH', `/api/video-projects/${projectId}`, input);
  return apiClient.patch<VideoProject>(`/api/video-projects/${projectId}`, input, { requireAuth: true });
}

export async function deleteProject(projectId: string) {
  if (await shouldUseLocalEngine()) return localApiCall<void>('DELETE', `/api/video-projects/${projectId}`);
  return apiClient.delete<void>(`/api/video-projects/${projectId}`, { requireAuth: true });
}

export async function duplicateProject(projectId: string) {
  if (await shouldUseLocalEngine()) return localApiCall<VideoProject>('POST', `/api/video-projects/${projectId}/duplicate`);
  return apiClient.post<VideoProject>(`/api/video-projects/${projectId}/duplicate`, undefined, { requireAuth: true });
}

// ==================== Timeline ====================

export async function saveTimeline(projectId: string, input: SaveTimelineInput) {
  if (await shouldUseLocalEngine()) return localApiCall<VideoProject>('PUT', `/api/video-projects/${projectId}/timeline`, input);
  return apiClient.put<VideoProject>(`/api/video-projects/${projectId}/timeline`, input, { requireAuth: true });
}

// ==================== Media Pool ====================

export async function getMediaPool(projectId: string) {
  if (await shouldUseLocalEngine()) return localApiCall<ProjectMedia[]>('GET', `/api/video-projects/${projectId}/media`);
  return apiClient.get<ProjectMedia[]>(`/api/video-projects/${projectId}/media`, { requireAuth: true });
}

export async function addMedia(projectId: string, input: AddMediaInput) {
  if (await shouldUseLocalEngine()) return localApiCall<ProjectMedia>('POST', `/api/video-projects/${projectId}/media`, input);
  return apiClient.post<ProjectMedia>(`/api/video-projects/${projectId}/media`, input, { requireAuth: true });
}

export async function removeMedia(projectId: string, mediaId: string) {
  if (await shouldUseLocalEngine()) return localApiCall<void>('DELETE', `/api/video-projects/${projectId}/media/${mediaId}`);
  return apiClient.delete<void>(`/api/video-projects/${projectId}/media/${mediaId}`, { requireAuth: true });
}

export interface UpdateMediaProxyInput {
  proxyStatus: 'none' | 'generating' | 'ready' | 'error';
  proxyPath?: string | null;
  proxyError?: string | null;
  originalHash?: string | null;
}

/**
 * Update the proxy state of a single media item.
 * Called by the proxy generation pipeline to persist per-asset progress so a
 * project can resume the proxy workflow across sessions.
 */
export async function updateMediaProxy(
  projectId: string,
  mediaId: string,
  input: UpdateMediaProxyInput,
) {
  const endpoint = `/api/video-projects/${projectId}/media/${mediaId}/proxy`;
  if (await shouldUseLocalEngine()) return localApiCall<ProjectMedia>('PATCH', endpoint, input);
  return apiClient.patch<ProjectMedia>(endpoint, input, { requireAuth: true });
}

// ==================== Export (Render) ====================

export async function startExport(projectId: string, options: ExportOptions) {
  return apiClient.post<ExportProgress>(`/api/video-projects/${projectId}/export`, options, { requireAuth: true });
}

export async function getExportStatus(projectId: string) {
  return apiClient.get<ExportProgress>(`/api/video-projects/${projectId}/export/status`, { requireAuth: true });
}

export async function getExportDownload(projectId: string) {
  return apiClient.get<ExportDownloadInfo>(`/api/video-projects/${projectId}/export/download`, { requireAuth: true });
}

// ==================== Re-exports ====================

export type {
  VideoProject,
  VideoProjectListItem,
  VideoProjectsListResponse,
  ProjectMedia,
  CreateVideoProjectInput,
  UpdateVideoProjectInput,
  SaveTimelineInput,
  AddMediaInput,
  ExportOptions,
  ExportProgress,
  ExportDownloadInfo,
};
