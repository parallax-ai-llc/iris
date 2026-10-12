import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  DARK_WINDOW_BACKGROUND,
  LIGHT_WINDOW_BACKGROUND,
  THEME_SETTING_KEY,
  windowBackgroundFor,
} from '../windowTheme';

describe('windowBackgroundFor', () => {
  it('light paints the light background', () => {
    expect(windowBackgroundFor('light', true)).toBe(LIGHT_WINDOW_BACKGROUND);
    expect(windowBackgroundFor('light', false)).toBe(LIGHT_WINDOW_BACKGROUND);
  });

  it('dark paints the dark background', () => {
    expect(windowBackgroundFor('dark', false)).toBe(DARK_WINDOW_BACKGROUND);
  });

  it('system follows the OS', () => {
    expect(windowBackgroundFor('system', true)).toBe(DARK_WINDOW_BACKGROUND);
    expect(windowBackgroundFor('system', false)).toBe(LIGHT_WINDOW_BACKGROUND);
  });

  it('missing or unknown values stay dark (the app was dark-only)', () => {
    for (const v of [null, undefined, '', 'LIGHT', 1, {}]) {
      expect(windowBackgroundFor(v, false)).toBe(DARK_WINDOW_BACKGROUND);
    }
  });

  it('reads the same key the renderer writes (src/shared/lib/theme.ts)', () => {
    const src = readFileSync(path.resolve(__dirname, '../../src/shared/lib/theme.ts'), 'utf-8');
    expect(src).toContain(`THEME_STORAGE_KEY = '${THEME_SETTING_KEY}'`);
  });

  it('matches the first-paint colours in index.html', () => {
    const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8').toLowerCase();
    expect(html).toMatch(new RegExp(`html\\s*\\{\\s*background-color:\\s*${DARK_WINDOW_BACKGROUND}`));
    expect(html).toMatch(new RegExp(`html\\[data-theme="light"\\]\\s*\\{\\s*background-color:\\s*${LIGHT_WINDOW_BACKGROUND}`));
  });
});
