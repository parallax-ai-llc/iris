/**
 * Native window background for the saved appearance theme.
 *
 * The BrowserWindow paints `backgroundColor` before the renderer's first frame
 * (and behind it while resizing). It has to match the theme the page will
 * paint, or a light-theme launch flashes dark first. The values mirror the
 * first-paint colours in index.html (`html` / `html[data-theme="light"]`).
 *
 * Pure module (no electron import) so vitest can cover it; main.ts supplies the
 * stored preference (settings.json `app:theme`) and nativeTheme.
 */

/** settings.json key written by the renderer (src/shared/lib/theme.ts THEME_STORAGE_KEY). */
export const THEME_SETTING_KEY = 'app:theme';

/** index.html `html { background-color }` (dark first paint). */
export const DARK_WINDOW_BACKGROUND = '#09090b';
/** index.html `html[data-theme="light"]` = light --bg-0 in styles/theme.css. */
export const LIGHT_WINDOW_BACKGROUND = '#f8f9fa';

/**
 * Background colour for a stored preference. Same rules as the renderer
 * (normalizeThemePreference + resolveTheme): unknown or missing values are
 * dark, 'system' follows the OS.
 */
export function windowBackgroundFor(stored: unknown, systemPrefersDark: boolean): string {
  const light = stored === 'light' || (stored === 'system' && !systemPrefersDark);
  return light ? LIGHT_WINDOW_BACKGROUND : DARK_WINDOW_BACKGROUND;
}
