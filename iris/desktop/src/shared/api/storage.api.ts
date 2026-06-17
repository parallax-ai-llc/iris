/**
 * Storage API Client for Iris Desktop
 * Handles file management operations with Parallax server storage
 */

import { apiClient } from './client';

// ==================== Types ====================

export interface StorageFile {
  name: string;
  path: string;
  size: number;
  contentType?: string;
  updated: string;
  isDirectory: boolean;
  publicUrl?: string;
  irisAssetId?: string;
}

export interface ListFilesResponse {
  items: StorageFile[];
  currentPath: string;
  hasMore: boolean;
}

export interface StorageInfo {
  totalSize: number;
  fileCount: number;
  quota?: number;
  quotaUsagePercent?: number;
}

interface UploadFileResponse {
  success: boolean;
  files: StorageFile[];
  message: string;
}

interface DeleteFileResponse {
  success: boolean;
  message: string;
  deletedCount: number;
}

interface CreateDirectoryResponse {
  success: boolean;
  message: string;
  directory: StorageFile;
}

interface MoveFileResponse {
  success: boolean;
  message: string;
  newPath: string;
}

// ==================== API Functions ====================

export async function listStorageFiles(path = ''): Promise<ListFilesResponse | null> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);

  const response = await apiClient.get<ListFilesResponse>(
    `/storage/list?${params.toString()}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function uploadStorageFile(file: File, path = ''): Promise<UploadFileResponse | null> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);

  const response = await apiClient.uploadFile<UploadFileResponse>(
    `/storage/upload?${params.toString()}`,
    file,
    'file',
    undefined,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function downloadStorageFile(filePath: string, fileName: string): Promise<boolean> {
  const params = new URLSearchParams({ path: filePath });

  const response = await apiClient.getBlob(
    `/storage/download?${params.toString()}`,
    { requireAuth: true }
  );

  if (!response.success || !response.data) return false;

  const blob = response.data;

  // Download via anchor element (works in both Electron and browser)
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export async function deleteStorageFile(path: string, recursive = false): Promise<DeleteFileResponse | null> {
  const params = new URLSearchParams({ path });
  if (recursive) params.set('recursive', 'true');

  const response = await apiClient.delete<DeleteFileResponse>(
    `/storage?${params.toString()}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function createStorageDirectory(path: string, folderName: string): Promise<CreateDirectoryResponse | null> {
  const response = await apiClient.post<CreateDirectoryResponse>(
    '/storage/mkdir',
    { path, folderName },
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function moveStorageFile(sourcePath: string, destinationPath: string): Promise<MoveFileResponse | null> {
  const response = await apiClient.put<MoveFileResponse>(
    '/storage/move',
    { sourcePath, destinationPath },
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  const response = await apiClient.get<StorageInfo>(
    '/storage/info',
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}
