/**
 * Settings tab helpers: the remembered tab (localStorage, guarded) and the
 * arrow-key movement of the ARIA tablist.
 */

export const SETTINGS_TAB_STORAGE_KEY = 'iris.settings.tab';

/** The remembered tab, or the first one when nothing (valid) is stored. */
export function readLastSettingsTab(ids: readonly string[]): string {
  try {
    const saved = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
    if (saved && ids.includes(saved)) return saved;
  } catch {
    // storage blocked: fall through to the first tab
  }
  return ids[0];
}

export function writeLastSettingsTab(id: string): void {
  try {
    localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, id);
  } catch {
    // not remembered this time; the tabs still work
  }
}

/**
 * Index the tablist moves to for a key, or null when the key is not a tab
 * navigation key. The list is vertical, but ←/→ move too (WAI-ARIA allows it
 * and users coming from horizontal tabs expect it). Wraps at both ends.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
