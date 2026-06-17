/**
 * What's New API Client
 * Handles fetching announcements/what's new items
 */

import { apiClient } from './client';

export type WhatsNewType = 'feature' | 'update' | 'bugfix' | 'announcement';

export interface WhatsNewItem {
  id: string;
  title: string;
  content: string;
  titleKo: string | null;
  contentKo: string | null;
  titleJp: string | null;
  contentJp: string | null;
  type: WhatsNewType;
  imageUrl: string | null;
  isActive: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsNewListResponse {
  items: WhatsNewItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Get list of active What's New items
 */
export async function getWhatsNewItems(params?: {
  page?: number;
  limit?: number;
  type?: WhatsNewType | 'all';
}): Promise<WhatsNewListResponse | null> {
  try {
    const queryParams = new URLSearchParams();

    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.type && params.type !== 'all') {
      queryParams.append('type', params.type);
    }

    // Always fetch only active items
    queryParams.append('isActive', 'true');

    const queryString = queryParams.toString();
    const url = queryString ? `/whats-new?${queryString}` : '/whats-new';

    const response = await apiClient.get<WhatsNewListResponse>(url, {
      requireAuth: false,
    });

    if (!response.success || !response.data) {
      console.error('Failed to fetch What\'s New items:', response.error);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch What\'s New items:', error);
    return null;
  }
}

/**
 * Get a single What's New item by ID
 */
export async function getWhatsNewById(id: string): Promise<WhatsNewItem | null> {
  try {
    const response = await apiClient.get<WhatsNewItem>(`/whats-new/${id}`, {
      requireAuth: false,
    });

    if (!response.success || !response.data) {
      console.error('Failed to fetch What\'s New item:', response.error);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch What\'s New item:', error);
    return null;
  }
}
