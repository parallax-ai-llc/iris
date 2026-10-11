/**
 * Theme store: electron-store is the source of truth (`app:theme`),
 * localStorage is only a first-paint mirror.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '../theme.store';
import { THEME_CACHE_KEY, THEME_STORAGE_KEY } from '@/shared/lib/theme';

const store = new Map<string, unknown>();
const storageApi = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
};

beforeEach(() => {
  store.clear();
  storageApi.get.mockClear();
  storageApi.set.mockClear();
  (window as unknown as { electronAPI: unknown }).electronAPI = { storage: storageApi };
  localStorage.removeItem(THEME_CACHE_KEY);
  useThemeStore.setState({ preference: 'dark', hydrated: false });
});

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('theme store', () => {
  it('starts from the first-paint cache when there is one', async () => {
    localStorage.setItem(THEME_CACHE_KEY, 'light');
    const { initialThemePreference } = await import('../theme.store');
    expect(initialThemePreference()).toBe('light');
  });

  it('hydrates from electron-store and refreshes the cache', async () => {
    store.set(THEME_STORAGE_KEY, 'system');
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().preference).toBe('system');
    expect(useThemeStore.getState().hydrated).toBe(true);
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBe('system');
  });

  it('keeps the current preference when nothing was saved', async () => {
    useThemeStore.setState({ preference: 'light' });
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().preference).toBe('light');
  });

  it('setPreference persists to electron-store and the cache', async () => {
    await useThemeStore.getState().setPreference('light');
    expect(useThemeStore.getState().preference).toBe('light');
    expect(storageApi.set).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBe('light');
  });

  it('setPreference still applies when electron-store fails', async () => {
    storageApi.set.mockRejectedValueOnce(new Error('ipc down'));
    await useThemeStore.getState().setPreference('system');
    expect(useThemeStore.getState().preference).toBe('system');
  });
});
