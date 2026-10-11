/**
 * Appearance theme: dark / light / follow the OS.
 *
 * - The preference is stored in electron-store under {@link THEME_STORAGE_KEY}
 *   (source of truth, survives cache clears).
 * - A copy lives in localStorage under {@link THEME_CACHE_KEY} so the inline
 *   script in index.html can paint the right theme before React mounts.
 *   localStorage may be unavailable or throw: every access is guarded.
 * - The effective theme is written to `<html data-theme>`; the CSS in
 *   `styles/theme.css` re-points the colour tokens and the Tailwind palette.
 *   Editors force `data-theme="dark"` on their own root (see FullScreenLayout).
 */

export type ThemePreference = 'dark' | 'light' | 'system';
export type EffectiveTheme = 'dark' | 'light';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system'];

/** electron-store key (source of truth). */
export const THEME_STORAGE_KEY = 'app:theme';
/** localStorage mirror read by the first-paint script in index.html. Keep in sync. */
export const THEME_CACHE_KEY = 'iris.theme';

/** Unknown values fall back to dark: the app was dark-only before themes existed. */
export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'system' || value === 'dark' ? value : 'dark';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): EffectiveTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(DARK_QUERY).matches
      : true;
  } catch {
    return true;
  }
}

/** Subscribe to OS theme changes. Returns the unsubscribe function. */
export function watchSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mql: MediaQueryList;
  try {
    mql = window.matchMedia(DARK_QUERY);
  } catch {
    return () => {};
  }
  const listener = (e: MediaQueryListEvent) => onChange(e.matches);
  mql.addEventListener?.('change', listener);
  return () => mql.removeEventListener?.('change', listener);
}

export function readCachedThemePreference(): ThemePreference | null {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    return raw === null ? null : normalizeThemePreference(raw);
  } catch {
    return null;
  }
}

export function writeCachedThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, preference);
  } catch {
    // Cache only: the theme still applies, the next launch may paint dark first.
  }
}

/** Write the effective theme onto <html>. */
export function applyDocumentTheme(theme: EffectiveTheme, doc: Document = document): void {
  const root = doc.documentElement;
  if (root.dataset.theme !== theme) {
    // Components animate colour on hover (transition-colors); without this the
    // whole UI would fade between themes and read wrong for a moment.
    root.setAttribute('data-theme-switching', '');
    root.dataset.theme = theme;
    void root.offsetHeight; // flush styles with transitions off
    setTimeout(() => root.removeAttribute('data-theme-switching'), 50);
  }
  root.style.colorScheme = theme;
  root.classList.toggle('dark', theme === 'dark');
}
