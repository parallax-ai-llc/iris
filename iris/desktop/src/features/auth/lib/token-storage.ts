export interface StoredUser {
  id: string;
  email: string;
  name?: string;
  profileImageThumbnail?: string;
  planId?: number;
}

export interface TokenStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clearTokens(): Promise<void>;
  getUser(): Promise<StoredUser | null>;
  setUser(user: StoredUser): Promise<void>;
}

const STORAGE_KEYS = {
  TOKEN: 'iris_access_token',
  REFRESH_TOKEN: 'iris_refresh_token',
  USER: 'iris_user',
};

const browserTokenStorage: TokenStorage = {
  async getToken() {
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  },
  async setToken(token) {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  },
  async getRefreshToken() {
    return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  },
  async setRefreshToken(token) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
  },
  async clearTokens() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },
  async getUser() {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  },
  async setUser(user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },
};

let insecureFallbackWarned = false;

export function getTokenStorage(): TokenStorage {
  if (typeof window !== 'undefined' && window.electronAPI?.auth) {
    return window.electronAPI.auth as unknown as TokenStorage;
  }

  if (import.meta.env.PROD) {
    throw new Error(
      '[iris-desktop] electronAPI.auth is unavailable in a production build. ' +
        'Refusing to fall back to insecure browser storage for auth tokens.'
    );
  }

  if (!insecureFallbackWarned) {
    insecureFallbackWarned = true;
    console.warn(
      '[iris-desktop] Using INSECURE localStorage for auth tokens (dev/Vite browser only). ' +
        'Run inside Electron (yarn electron:dev) for production-equivalent security.'
    );
  }
  return browserTokenStorage;
}
