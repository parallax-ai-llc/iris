/**
 * useKeyboardShortcuts - Global keyboard shortcuts hook
 */

import { useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '@/shared/stores/ui.store';

interface ShortcutHandler {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description: string;
  when?: () => boolean;
}

// Global shortcuts registry
const shortcuts: ShortcutHandler[] = [];

export function registerShortcut(shortcut: ShortcutHandler) {
  // Remove existing shortcut with same key combo
  const index = shortcuts.findIndex(
    (s) =>
      s.key === shortcut.key &&
      s.ctrl === shortcut.ctrl &&
      s.shift === shortcut.shift &&
      s.alt === shortcut.alt
  );
  if (index !== -1) {
    shortcuts.splice(index, 1);
  }
  shortcuts.push(shortcut);

  return () => {
    const idx = shortcuts.indexOf(shortcut);
    if (idx !== -1) {
      shortcuts.splice(idx, 1);
    }
  };
}

export function useKeyboardShortcuts() {
  const setCurrentPage = useUIStore((state) => state.setCurrentPage);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape to work even in inputs
        if (e.key !== 'Escape') {
          return;
        }
      }

      // Map shortcut.key → KeyboardEvent.code for physical-key fallback.
      // Needed primarily on macOS where Option (Alt) + a letter/bracket
      // produces special characters (e.g. Alt+] → '‘'), making e.key
      // unreliable. e.code reflects the physical key regardless of layout.
      const keyToCode = (key: string): string | null => {
        const k = key.toLowerCase();
        if (k.length === 1 && k >= 'a' && k <= 'z') return `Key${k.toUpperCase()}`;
        if (k.length === 1 && k >= '0' && k <= '9') return `Digit${k}`;
        if (k === ']') return 'BracketRight';
        if (k === '[') return 'BracketLeft';
        if (k === ',') return 'Comma';
        if (k === '.') return 'Period';
        if (k === '/') return 'Slash';
        if (k === ';') return 'Semicolon';
        if (k === "'") return 'Quote';
        if (k === '\\') return 'Backslash';
        if (k === '`') return 'Backquote';
        if (k === '-') return 'Minus';
        if (k === '=') return 'Equal';
        return null;
      };

      // Check registered shortcuts
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;
        const expectedCode = keyToCode(shortcut.key);
        const keyMatch =
          e.key.toLowerCase() === shortcut.key.toLowerCase() ||
          (expectedCode !== null && e.code === expectedCode);

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          if (!shortcut.when || shortcut.when()) {
            e.preventDefault();
            shortcut.handler();
            return;
          }
        }
      }

      // Built-in navigation shortcuts (Ctrl+1~0 maps to sidebar order)
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            setCurrentPage('home');
            break;
          case '2':
            e.preventDefault();
            setCurrentPage('templates');
            break;
          case '3':
            e.preventDefault();
            setCurrentPage('images');
            break;
          case '4':
            e.preventDefault();
            setCurrentPage('videos');
            break;
          case '5':
            e.preventDefault();
            setCurrentPage('projects');
            break;
          case '6':
            e.preventDefault();
            setCurrentPage('workflows');
            break;
          case '7':
            e.preventDefault();
            setCurrentPage('batch');
            break;
          case '8':
            e.preventDefault();
            setCurrentPage('extensions');
            break;
          case '9':
            e.preventDefault();
            setCurrentPage('library');
            break;
          case '0':
            e.preventDefault();
            setCurrentPage('storage');
            break;
          case ',':
            e.preventDefault();
            setCurrentPage('settings');
            break;
        }
      }
    },
    [setCurrentPage]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { registerShortcut };
}

// Hook for component-specific shortcuts
export function useShortcut(
  key: string,
  handler: () => void,
  options: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    description?: string;
    when?: () => boolean;
  } = {}
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const whenRef = useRef(options.when);
  whenRef.current = options.when;

  useEffect(() => {
    return registerShortcut({
      key,
      handler: () => handlerRef.current(),
      ctrl: options.ctrl,
      shift: options.shift,
      alt: options.alt,
      description: options.description || '',
      when: whenRef.current ? () => whenRef.current!() : undefined,
    });
  }, [key, options.ctrl, options.shift, options.alt, options.description]);
}

export default useKeyboardShortcuts;
