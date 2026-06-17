/**
 * Iris API - Extension Marketplace operations
 */

import { apiClient } from './client';
import {
  Extension,
  ExtensionDetail,
  ExtensionListResponse,
  ExtensionQueryParams,
  ExtensionReview,
  ReviewListResponse,
  InstalledExtension,
  ExtensionSubmitData,
  ExtensionUpdateData,
  ReportData,
} from './extension.types';

const buildQueryString = (params?: Record<string, unknown>): string => {
  if (!params) return '';
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });
  const queryString = queryParams.toString();
  return queryString ? `?${queryString}` : '';
};

export async function getExtensions(
  params?: ExtensionQueryParams
): Promise<ExtensionListResponse | null> {
  const queryString = buildQueryString(params as Record<string, unknown>);
  const response = await apiClient.get<ExtensionListResponse>(
    `/extensions${queryString}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function getExtension(idOrSlug: string): Promise<ExtensionDetail | null> {
  const response = await apiClient.get<ExtensionDetail>(
    `/extensions/${idOrSlug}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function getFeaturedExtensions(): Promise<Extension[]> {
  const response = await apiClient.get<{ items: Extension[] }>(
    '/extensions/featured',
    { requireAuth: true }
  );
  return response.success ? response.data!.items : [];
}

export async function getCategories(): Promise<{ category: string; count: number }[]> {
  const response = await apiClient.get<{
    categories: { category: string; count: number }[];
  }>('/extensions/categories');
  return response.success ? response.data!.categories : [];
}

export async function installExtension(id: string): Promise<boolean> {
  const response = await apiClient.post<{ success: boolean }>(
    `/extensions/${id}/install`,
    {},
    { requireAuth: true }
  );
  return response.success;
}

export async function uninstallExtension(id: string): Promise<boolean> {
  const response = await apiClient.delete<{ success: boolean }>(
    `/extensions/${id}/install`,
    { requireAuth: true }
  );
  return response.success;
}

export async function getInstalledExtensions(): Promise<InstalledExtension[]> {
  const response = await apiClient.get<{ items: InstalledExtension[] }>(
    '/extensions/installed',
    { requireAuth: true }
  );
  return response.success ? response.data!.items : [];
}

export async function getExtensionReviews(
  id: string,
  page?: number,
  limit?: number
): Promise<ReviewListResponse | null> {
  const queryString = buildQueryString({ page, limit });
  const response = await apiClient.get<ReviewListResponse>(
    `/extensions/${id}/reviews${queryString}`
  );
  return response.success ? response.data! : null;
}

export async function submitReview(
  extensionId: string,
  rating: number,
  title?: string,
  content?: string
): Promise<ExtensionReview | null> {
  const response = await apiClient.post<ExtensionReview>(
    `/extensions/${extensionId}/reviews`,
    { rating, title, content },
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

// === User Submit ===

export async function submitExtension(
  data: ExtensionSubmitData
): Promise<Extension | null> {
  const response = await apiClient.post<Extension>(
    '/extensions/submit',
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function getMyExtensions(): Promise<Extension[]> {
  const response = await apiClient.get<{ items: Extension[] }>(
    '/extensions/my',
    { requireAuth: true }
  );
  return response.success ? response.data!.items : [];
}

export async function updateMyExtension(
  id: string,
  data: ExtensionUpdateData
): Promise<Extension | null> {
  const response = await apiClient.patch<Extension>(
    `/extensions/my/${id}`,
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

export async function deleteMyExtension(id: string): Promise<boolean> {
  const response = await apiClient.delete<{ success: boolean }>(
    `/extensions/my/${id}`,
    { requireAuth: true }
  );
  return response.success;
}

// === Reports ===

export async function reportExtension(
  extensionId: string,
  data: ReportData
): Promise<boolean> {
  const response = await apiClient.post<{ success: boolean }>(
    `/extensions/${extensionId}/report`,
    data,
    { requireAuth: true }
  );
  return response.success;
}

export async function reportReview(
  extensionId: string,
  reviewId: string,
  data: ReportData
): Promise<boolean> {
  const response = await apiClient.post<{ success: boolean }>(
    `/extensions/${extensionId}/reviews/${reviewId}/report`,
    data,
    { requireAuth: true }
  );
  return response.success;
}
