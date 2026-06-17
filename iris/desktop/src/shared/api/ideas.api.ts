/**
 * Ideas API Client
 * Handles fetching and interacting with feature ideas
 */

import { apiClient } from './client';

export type IdeaStatus =
  | 'submitted'
  | 'working_on_it'
  | 'completed'
  | 'rejected'
  | 'banned';
export type IdeasSort = 'trending' | 'recent' | 'most_votes' | 'least_votes';

export interface IdeaAuthor {
  id: string;
  name: string | null;
  profileImageThumbnail: string | null;
}

export interface IdeaItem {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  author: IdeaAuthor;
  upvoteCount: number;
  downvoteCount: number;
  commentCount: number;
  userVote: number | null; // 1 = upvote, -1 = downvote, null = no vote
  createdAt: string;
  updatedAt: string;
}

export interface IdeasListResponse {
  items: IdeaItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Get list of ideas
 */
export async function getIdeas(params?: {
  page?: number;
  limit?: number;
  status?: IdeaStatus | 'all';
  sort?: IdeasSort;
  search?: string;
}): Promise<IdeasListResponse | null> {
  try {
    const queryParams = new URLSearchParams();

    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.status && params.status !== 'all') {
      queryParams.append('status', params.status);
    }
    if (params?.sort) {
      queryParams.append('sort', params.sort);
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }

    const queryString = queryParams.toString();
    const url = queryString ? `/ideas?${queryString}` : '/ideas';

    const response = await apiClient.get<IdeasListResponse>(url, {
      requireAuth: false,
    });

    if (!response.success || !response.data) {
      console.error('Failed to fetch ideas:', response.error);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch ideas:', error);
    return null;
  }
}

/**
 * Get a single idea by ID
 */
export async function getIdea(id: string): Promise<IdeaItem | null> {
  try {
    const response = await apiClient.get<IdeaItem>(`/ideas/${id}`, {
      requireAuth: false,
    });

    if (!response.success || !response.data) {
      console.error('Failed to fetch idea:', response.error);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch idea:', error);
    return null;
  }
}

/**
 * Create a new idea
 */
export async function createIdea(data: {
  title: string;
  description: string;
}): Promise<IdeaItem | null> {
  try {
    const response = await apiClient.post<IdeaItem>('/ideas', data, {
      requireAuth: true,
    });

    if (!response.success || !response.data) {
      console.error('Failed to create idea:', response.error);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('Failed to create idea:', error);
    return null;
  }
}

/**
 * Vote on an idea
 * @param vote 1 = upvote, -1 = downvote, 0 = remove vote
 */
export async function voteIdea(
  id: string,
  vote: 1 | -1 | 0
): Promise<IdeaItem | null> {
  try {
    // If vote is 0, remove the vote
    if (vote === 0) {
      const response = await apiClient.delete(`/ideas/${id}/vote`, {
        requireAuth: true,
      });
      if (!response.success) {
        console.error('Failed to remove vote:', response.error);
        return null;
      }
      // Refetch the idea to get updated state
      return getIdea(id);
    }

    // Convert numeric vote to voteType string expected by server
    const voteType = vote === 1 ? 'upvote' : 'downvote';
    const response = await apiClient.post(
      `/ideas/${id}/vote`,
      { voteType },
      { requireAuth: true }
    );

    if (!response.success) {
      console.error('Failed to vote on idea:', response.error);
      return null;
    }

    // Refetch the idea to get updated state with userVote
    return getIdea(id);
  } catch (error) {
    console.error('Failed to vote on idea:', error);
    return null;
  }
}
