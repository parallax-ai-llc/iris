'use client';

import { useCallback, useEffect, useState } from 'react';

export type EditorTheme = 'dark' | 'light';

const STORAGE_KEY = 'iris_editor_theme';
const ATTR = 'data-iris-editor-theme';

function readStoredTheme(): EditorTheme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Editor-only colour theme (styles/editor-themes.css). Dark is the default;
 * the choice is remembered per browser. While mounted it sets
 * `data-iris-editor-theme` on <html> so portalled dialogs follow it, and
 * removes it on unmount so the rest of the host app is untouched.
 */
export function useEditorTheme() {
  const [theme, setTheme] = useState<EditorTheme>('dark');

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(ATTR, theme);
    return () => root.removeAttribute(ATTR);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: EditorTheme = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage blocked (private mode): the toggle still works for this visit.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
