/**
 * Theme preference helpers: preference parsing, system resolution, the
 * first-paint cache (localStorage, may throw) and applying to the document.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_CACHE_KEY,
  applyDocumentTheme,
  normalizeThemePreference,
  readCachedThemePreference,
  resolveTheme,
  writeCachedThemePreference,
} from '../theme';

afterEach(() => {
  vi.restoreAllMocks();
  try {
    localStorage.removeItem(THEME_CACHE_KEY);
  } catch {
    /* ignore */
  }
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});

describe('normalizeThemePreference', () => {
  it('keeps the three known values', () => {
    expect(normalizeThemePreference('dark')).toBe('dark');
    expect(normalizeThemePreference('light')).toBe('light');
    expect(normalizeThemePreference('system')).toBe('system');
  });
  it('falls back to dark for anything else (the app was dark-only before)', () => {
    expect(normalizeThemePreference(undefined)).toBe('dark');
    expect(normalizeThemePreference(null)).toBe('dark');
    expect(normalizeThemePreference('blue')).toBe('dark');
    expect(normalizeThemePreference(1)).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it('returns explicit choices unchanged', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('follows the OS for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('first-paint cache', () => {
  it('round-trips through localStorage', () => {
    writeCachedThemePreference('light');
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBe('light');
    expect(readCachedThemePreference()).toBe('light');
  });
  it('returns null when nothing is cached', () => {
    expect(readCachedThemePreference()).toBeNull();
  });
  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeCachedThemePreference('light')).not.toThrow();
    expect(readCachedThemePreference()).toBeNull();
  });
});

describe('applyDocumentTheme', () => {
  it('sets data-theme and color-scheme on <html>', () => {
    applyDocumentTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    applyDocumentTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('suppresses transitions only while the theme actually changes', () => {
    vi.useFakeTimers();
    try {
      applyDocumentTheme('dark');
      vi.runAllTimers();
      applyDocumentTheme('light');
      expect(document.documentElement.hasAttribute('data-theme-switching')).toBe(true);
      vi.runAllTimers();
      expect(document.documentElement.hasAttribute('data-theme-switching')).toBe(false);
      applyDocumentTheme('light');
      expect(document.documentElement.hasAttribute('data-theme-switching')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
