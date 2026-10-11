import { create } from 'zustand';
import {
  THEME_STORAGE_KEY,
  normalizeThemePreference,
  readCachedThemePreference,
  writeCachedThemePreference,
  type ThemePreference,
} from '@/shared/lib/theme';

interface ThemeState {
  preference: ThemePreference;
  /** True once the electron-store value has been read. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

/** First guess before electron-store answers: the first-paint cache, else dark. */
export function initialThemePreference(): ThemePreference {
  return readCachedThemePreference() ?? 'dark';
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: initialThemePreference(),
  hydrated: false,

  hydrate: async () => {
    let saved: unknown = null;
    try {
      saved = await window.electronAPI?.storage?.get<string>(THEME_STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (saved === null || saved === undefined) {
      set({ hydrated: true });
      return;
    }
    const preference = normalizeThemePreference(saved);
    writeCachedThemePreference(preference);
    set({ preference, hydrated: true });
  },

  setPreference: async (preference) => {
    set({ preference });
    writeCachedThemePreference(preference);
    try {
      await window.electronAPI?.storage?.set(THEME_STORAGE_KEY, preference);
    } catch {
      // Applied for this session; the cache still carries it to the next launch.
    }
  },
}));
