import { create } from 'zustand';
import { getTokenStorage, type StoredUser } from '../lib/token-storage';

type User = StoredUser;

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithOAuth: (
    accessToken: string,
    refreshToken: string,
    user: User
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();

      // Store tokens securely via Electron or browser localStorage
      const storage = getTokenStorage();
      await storage.setToken(data.accessToken);
      await storage.setRefreshToken(data.refreshToken);
      await storage.setUser(data.user);

      set({ user: data.user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Login failed',
        isLoading: false,
      });
      return false;
    }
  },

  /**
   * Login with OAuth tokens received from the main process
   * (via custom protocol callback from system browser)
   */
  loginWithOAuth: async (
    accessToken: string,
    refreshToken: string,
    user: User
  ) => {
    set({ isLoading: true, error: null });
    try {
      // Store tokens securely via Electron or browser localStorage
      const storage = getTokenStorage();
      await storage.setToken(accessToken);
      await storage.setRefreshToken(refreshToken);
      await storage.setUser(user);

      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save authentication',
        isLoading: false,
      });
      return false;
    }
  },

  logout: async () => {
    const storage = getTokenStorage();
    await storage.clearTokens();
    set({ user: null, isAuthenticated: false, error: null });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const storage = getTokenStorage();
      const token = await storage.getToken();
      const user = await storage.getUser();

      if (!token || !user) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Validate the token with the server
      const response = await fetch(`${API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        // Token is valid — update user from server for freshness
        try {
          const data = await response.json();
          if (data?.id) {
            await storage.setUser(data);
            set({ user: data, isAuthenticated: true, isLoading: false });
            return;
          }
        } catch {
          // JSON parsing failed — token was valid, use stored user
        }
        set({ user, isAuthenticated: true, isLoading: false });
        return;
      }

      if (response.status === 401) {
        // Access token expired — try to refresh
        const refreshToken = await storage.getRefreshToken();
        if (!refreshToken) {
          await storage.clearTokens();
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          await storage.setToken(refreshData.accessToken);
          if (refreshData.refreshToken) {
            await storage.setRefreshToken(refreshData.refreshToken);
          }
          set({ user, isAuthenticated: true, isLoading: false });
          return;
        }

        // Refresh failed — session expired
        await storage.clearTokens();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Other server error (5xx, network issues) — trust stored tokens
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      // Network error — trust stored tokens if they exist
      const storage = getTokenStorage();
      try {
        const token = await storage.getToken();
        const user = await storage.getUser();
        if (token && user) {
          set({ user, isAuthenticated: true, isLoading: false });
        } else {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      } catch {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    }
  },

  refreshToken: async () => {
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
    } catch {
      return false;
    }
  },
}));

// When the API client detects an expired session, log the user out
if (typeof window !== 'undefined') {
  window.addEventListener('auth:session-expired', () => {
    useAuthStore.getState().logout();
  });
}
