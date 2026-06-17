/**
 * Blogs API Client
 * Handles fetching blog posts
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';

export interface Blog {
  id: string;
  titleKo: string;
  titleJa: string;
  titleEn: string;
  slug: string;
  contentKo: string;
  contentJa: string;
  contentEn: string;
  excerptKo: string | null;
  excerptJa: string | null;
  excerptEn: string | null;
  thumbnailImage: string | null;
  authorId: string;
  authorName: string;
  category: string | null;
  tags: string[];
  isView: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlogListResponse {
  blogs: Blog[];
  total: number;
}

/**
 * Fetch blog list from API
 */
export async function getBlogs(params?: {
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}): Promise<BlogListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.category) queryParams.append('category', params.category);
  if (params?.tag) queryParams.append('tag', params.tag);
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());

  const url = `${API_BASE_URL}/blogs?${queryParams.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to fetch blogs: ${response.status}`);
      return { blogs: [], total: 0 };
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching blogs:', error);
    return { blogs: [], total: 0 };
  }
}

/**
 * Get blog title in English (iris-desktop only supports English)
 */
export function getBlogTitle(blog: Blog): string {
  return blog.titleEn || blog.titleKo || blog.titleJa;
}

/**
 * Get blog excerpt in English
 */
export function getBlogExcerpt(blog: Blog): string | null {
  return blog.excerptEn || blog.excerptKo || blog.excerptJa;
}
