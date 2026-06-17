/**
 * API Client for Iris Desktop
 * Handles authentication and API requests to Parallax server
 */

import { getTokenStorage } from '@/features/auth/lib/token-storage';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

interface RequestOptions {
  requireAuth?: boolean;
  headers?: Record<string, string>;
}

class ApiClient {
  // Single-flight refresh: concurrent 401s share one in-flight refresh call,
  // so they don't race on the refresh endpoint or on storage writes.
  private refreshPromise: Promise<boolean> | null = null;

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const storage = getTokenStorage();
    const token = await storage.getToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }

  /**
   * Refresh the access token, coalescing concurrent callers onto a single
   * in-flight refresh. Returns true if refresh succeeded.
   */
  private refreshToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    const promise = this.doRefresh().finally(() => {
      if (this.refreshPromise === promise) {
        this.refreshPromise = null;
      }
    });
    this.refreshPromise = promise;
    return promise;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const storage = getTokenStorage();
      const refreshToken = await storage.getRefreshToken();
      if (!refreshToken) return false;

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      await storage.setToken(data.accessToken);
      if (data.refreshToken) {
        await storage.setRefreshToken(data.refreshToken);
      }

      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  /**
   * Clear stored tokens and notify the app that the session has expired.
   */
  private async expireSession(): Promise<void> {
    const storage = getTokenStorage();
    await storage.clearTokens();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
  }

  /**
   * Parse a non-401 fetch Response into our ApiResponse envelope.
   */
  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const statusCode = response.status;
    try {
      const data = await response.json();

      if (!response.ok) {
        const errorMsg =
          data.error?.message || data.message ||
          (typeof data.error === 'string' ? data.error : null) ||
          `Request failed with status ${statusCode}`;
        return { success: false, error: errorMsg, statusCode };
      }

      return { success: true, data: data as T, statusCode };
    } catch {
      // JSON parsing failed — intentionally ignored for non-JSON responses
      if (!response.ok) {
        return {
          success: false,
          error: `Request failed with status ${statusCode}`,
          statusCode,
        };
      }
      return { success: true, statusCode };
    }
  }

  /**
   * Execute a request, transparently refreshing the access token and retrying
   * once on 401. If the retry still gets 401 (or refresh fails), the session
   * is expired and the app is notified to log out.
   *
   * `buildRequest` must re-read the token from storage each invocation so the
   * retry picks up the freshly refreshed token.
   */
  private async executeRequest<T>(
    buildRequest: () => Promise<Response>,
    requireAuth: boolean
  ): Promise<ApiResponse<T>> {
    let response = await buildRequest();

    if (response.status === 401 && requireAuth) {
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        await this.expireSession();
        return { success: false, error: 'Session expired', statusCode: 401 };
      }

      response = await buildRequest();
      if (response.status === 401) {
        // Still unauthorized after a successful refresh + retry — give up.
        await this.expireSession();
        return { success: false, error: 'Session expired', statusCode: 401 };
      }
    }

    return this.parseResponse<T>(response);
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const buildRequest = async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options?.headers,
      };
      if (options?.requireAuth) {
        Object.assign(headers, await this.getAuthHeaders());
      }
      return fetch(`${API_BASE_URL}${endpoint}`, { method: 'GET', headers });
    };

    return this.executeRequest<T>(buildRequest, !!options?.requireAuth);
  }

  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    const buildRequest = async () => {
      const headers: Record<string, string> = { ...options?.headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (options?.requireAuth) {
        Object.assign(headers, await this.getAuthHeaders());
      }
      return fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    };

    return this.executeRequest<T>(buildRequest, !!options?.requireAuth);
  }

  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    const buildRequest = async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options?.headers,
      };
      if (options?.requireAuth) {
        Object.assign(headers, await this.getAuthHeaders());
      }
      return fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    return this.executeRequest<T>(buildRequest, !!options?.requireAuth);
  }

  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    const buildRequest = async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options?.headers,
      };
      if (options?.requireAuth) {
        Object.assign(headers, await this.getAuthHeaders());
      }
      return fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PATCH',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    return this.executeRequest<T>(buildRequest, !!options?.requireAuth);
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const buildRequest = async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options?.headers,
      };
      if (options?.requireAuth) {
        Object.assign(headers, await this.getAuthHeaders());
      }
      return fetch(`${API_BASE_URL}${endpoint}`, { method: 'DELETE', headers });
    };

    return this.executeRequest<T>(buildRequest, !!options?.requireAuth);
  }

  /**
   * Fetch binary data (blob) from an endpoint with authentication support.
   * Useful for fetching images, files, etc. that require auth headers.
   */
  async getBlob(endpoint: string, options?: RequestOptions): Promise<ApiResponse<Blob>> {
    const buildRequest = async () => {
      const headers: Record<string, string> = { ...options?.headers };
      if (options?.requireAuth) {
        Object.assign(headers, await this.getAuthHeaders());
      }
      return fetch(`${API_BASE_URL}${endpoint}`, { method: 'GET', headers });
    };

    try {
      let response = await buildRequest();

      if (response.status === 401 && options?.requireAuth) {
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          await this.expireSession();
          return { success: false, error: 'Session expired', statusCode: 401 };
        }
        response = await buildRequest();
        if (response.status === 401) {
          await this.expireSession();
          return { success: false, error: 'Session expired', statusCode: 401 };
        }
      }

      if (!response.ok) {
        return {
          success: false,
          error: `Request failed with status ${response.status}`,
          statusCode: response.status,
        };
      }

      const blob = await response.blob();
      return { success: true, data: blob, statusCode: response.status };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch blob',
      };
    }
  }

  async uploadFile<T>(
    endpoint: string,
    file: File | Blob,
    fieldName = 'file',
    additionalData?: Record<string, string>,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const buildRequest = async () => {
      const headers: Record<string, string> = { ...options?.headers };
      if (options?.requireAuth) {
        Object.assign(headers, await this.getAuthHeaders());
      }

      const formData = new FormData();
      formData.append(fieldName, file);

      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }

      return fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });
    };

    return this.executeRequest<T>(buildRequest, !!options?.requireAuth);
  }

  /**
   * Upload file with progress tracking via XMLHttpRequest
   */
  async uploadFileWithProgress<T>(
    endpoint: string,
    file: File | Blob,
    fieldName = 'file',
    additionalData?: Record<string, string>,
    options?: RequestOptions,
    onProgress?: (percent: number) => void,
    abortSignal?: AbortSignal
  ): Promise<ApiResponse<T>> {
    const buildFormData = () => {
      const formData = new FormData();
      formData.append(fieldName, file);
      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }
      return formData;
    };

    const sendXhr = async (): Promise<{ status: number; text: string } | { aborted: true } | { error: string }> => {
      const headers: Record<string, string> = { ...options?.headers };
      if (options?.requireAuth) {
        Object.assign(headers, await this.getAuthHeaders());
      }

      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}${endpoint}`);

        Object.entries(headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
        xhr.onerror = () => resolve({ error: 'Network error during upload' });
        xhr.onabort = () => resolve({ aborted: true });

        if (abortSignal) {
          abortSignal.addEventListener('abort', () => xhr.abort());
        }

        xhr.send(buildFormData());
      });
    };

    const parseXhr = (status: number, text: string): ApiResponse<T> => {
      try {
        const data = JSON.parse(text);
        if (status >= 200 && status < 300) {
          return { success: true, data: data as T, statusCode: status };
        }
        const errorMsg =
          data.error?.message || data.message ||
          (typeof data.error === 'string' ? data.error : null) ||
          `Request failed with status ${status}`;
        return { success: false, error: errorMsg, statusCode: status };
      } catch {
        if (status >= 200 && status < 300) {
          return { success: true, statusCode: status };
        }
        return {
          success: false,
          error: `Request failed with status ${status}`,
          statusCode: status,
        };
      }
    };

    let result = await sendXhr();
    if ('aborted' in result) {
      return { success: false, error: 'Upload cancelled' };
    }
    if ('error' in result) {
      return { success: false, error: result.error };
    }

    if (result.status === 401 && options?.requireAuth) {
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        await this.expireSession();
        return { success: false, error: 'Session expired', statusCode: 401 };
      }
      result = await sendXhr();
      if ('aborted' in result) {
        return { success: false, error: 'Upload cancelled' };
      }
      if ('error' in result) {
        return { success: false, error: result.error };
      }
      if (result.status === 401) {
        await this.expireSession();
        return { success: false, error: 'Session expired', statusCode: 401 };
      }
    }

    return parseXhr(result.status, result.text);
  }
}

export const apiClient = new ApiClient();
