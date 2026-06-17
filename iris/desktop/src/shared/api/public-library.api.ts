/**
 * Public Library API - fetches publicly shared assets from the community library
 * No authentication required
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';

export interface PublicLibraryItem {
  id: string;
  userId: string;
  assetType: 'IMAGE' | 'VIDEO';
  mimeType: string;
  publicMediaUrl: string;
  publicThumbnailUrl?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  duration?: number;
  prompt?: string;
  modelId?: string;
  aspectRatio?: string;
  createdAt: string;
}

export interface PublicLibraryListResult {
  items: PublicLibraryItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export async function fetchPublicLibraryItems(params: {
  assetType?: 'IMAGE' | 'VIDEO';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}): Promise<PublicLibraryListResult | null> {
  try {
    const queryParams = new URLSearchParams();
    if (params.assetType) queryParams.set('assetType', params.assetType);
    if (params.sortBy) queryParams.set('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
    if (params.page) queryParams.set('page', String(params.page));
    if (params.limit) queryParams.set('limit', String(params.limit));

    const qs = queryParams.toString();
    const url = `${API_BASE_URL}/api/iris/library${qs ? `?${qs}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    return response.json();
  } catch {
    return null;
  }
}
