/**
 * useKeyboardShortcuts - global shortcuts (sidebar navigation) + the legacy
 * `registerShortcut` / `useShortcut` API, all running on the central
 * dispatcher in `@/shared/lib/shortcuts`.
 *
 * Global shortcuts live in the lowest scope, so an open editor wins:
 * in the image editor Ctrl+0 / Ctrl+1 zoom instead of navigating.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useUIStore } from '@/shared/stores/ui.store';
import {
  formatCombo,
  getShortcutPlatform,
  hasActiveShortcutLayer,
  registerShortcutLayer,
  useKeymapLayer,
  useShortcutLayer,
  type Keymap,
  type ShortcutBinding,
  type ShortcutHandler,
  type ShortcutPlatform,
} from '@/shared/lib/shortcuts';

interface ShortcutHandlerSpec {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description: string;
  when?: () => boolean;
}

/** Ctrl+1~0 follow the sidebar order; Ctrl+, opens settings. */
export const GLOBAL_NAV_KEYMAP = {
  navHome: { keys: ['Mod+1'], description: 'Go to Home' },
  navTemplates: { keys: ['Mod+2'], description: 'Go to Templates' },
  navImages: { keys: ['Mod+3'], description: 'Go to Images' },
  navVideos: { keys: ['Mod+4'], description: 'Go to Videos' },
  navProjects: { keys: ['Mod+5'], description: 'Go to Projects' },
  navWorkflows: { keys: ['Mod+6'], description: 'Go to Workflows' },
  navBatch: { keys: ['Mod+7'], description: 'Go to Batch' },
  navExtensions: { keys: ['Mod+8'], description: 'Go to Extensions' },
  navLibrary: { keys: ['Mod+9'], description: 'Go to Library' },
  navStorage: { keys: ['Mod+0'], description: 'Go to Storage' },
  navSettings: { keys: ['Mod+,'], description: 'Open Settings' },
} as const satisfies Keymap<string>;

export type GlobalNavCommand = keyof typeof GLOBAL_NAV_KEYMAP;

export const GLOBAL_NAV_TARGETS: Record<GlobalNavCommand, string> = {
  navHome: 'home',
  navTemplates: 'templates',
  navImages: 'images',
  navVideos: 'videos',
  navProjects: 'projects',
  navWorkflows: 'workflows',
  navBatch: 'batch',
  navExtensions: 'extensions',
  navLibrary: 'library',
  navStorage: 'storage',
  navSettings: 'settings',
};

export type PageHistoryCommand = 'navBack' | 'navForward';

const PAGE_HISTORY_KEYMAP_OTHER = {
  navBack: { keys: ['Alt+ArrowLeft'], description: 'Back to the previous page' },
  navForward: { keys: ['Alt+ArrowRight'], description: 'Forward to the next page' },
} as const satisfies Keymap<PageHistoryCommand>;

const PAGE_HISTORY_KEYMAP_MAC = {
  navBack: { keys: ['Mod+['], description: 'Back to the previous page' },
  navForward: { keys: ['Mod+]'], description: 'Forward to the next page' },
} as const satisfies Keymap<PageHistoryCommand>;

/**
 * Page history keys follow each platform's browser convention:
 * Alt+← / Alt+→ on Windows and Linux, ⌘[ / ⌘] on macOS.
 */
export function getPageHistoryKeymap(
  platform: ShortcutPlatform = getShortcutPlatform(),
): Keymap<PageHistoryCommand> {
  return platform === 'mac' ? PAGE_HISTORY_KEYMAP_MAC : PAGE_HISTORY_KEYMAP_OTHER;
}

/**
 * Key caps for a shortcut list row: the shared modifiers, then both keys,
 * e.g. ['Alt', '← / →'] or ['⌘', '[ / ]'].
 */
export function pageHistoryShortcutKeys(platform: ShortcutPlatform = getShortcutPlatform()): string[] {
  const keymap = getPageHistoryKeymap(platform);
  const back = formatCombo(keymap.navBack.keys[0], platform).split('+');
  const forward = formatCombo(keymap.navForward.keys[0], platform).split('+');
  return [...back.slice(0, -1), `${back[back.length - 1]} / ${forward[forward.length - 1]}`];
}

/** `MouseEvent.button` of the mouse back / forward side buttons. */
export const MOUSE_BUTTON_BACK = 3;
export const MOUSE_BUTTON_FORWARD = 4;

/**
 * Page history only moves between app-shell pages. While an editor layer is
 * registered (image / video editor) the keys are declined, so the editor's own
 * binding of the same combo (⌘[ / ⌘] reorder layers) and the editor itself win.
 * Declining also leaves the key alone when there is nowhere to go.
 */
export function createPageHistoryHandlers(): Record<PageHistoryCommand, ShortcutHandler> {
  return {
    navBack: () => {
      const ui = useUIStore.getState();
      if (hasActiveShortcutLayer('editor') || !ui.canGoBack()) return false;
      ui.goBack();
    },
    navForward: () => {
      const ui = useUIStore.getState();
      if (hasActiveShortcutLayer('editor') || !ui.canGoForward()) return false;
      ui.goForward();
    },
  };
}

/** Mouse back / forward buttons; same rules as the keys. Returns true when handled. */
export function handlePageHistoryMouseUp(e: MouseEvent): boolean {
  if (e.button !== MOUSE_BUTTON_BACK && e.button !== MOUSE_BUTTON_FORWARD) return false;
  if (hasActiveShortcutLayer('editor') || hasActiveShortcutLayer('modal', { blocking: true })) {
    return false;
  }
  const ui = useUIStore.getState();
  // Keep Chromium from treating the side button as its own history navigation.
  e.preventDefault();
  if (e.button === MOUSE_BUTTON_BACK) ui.goBack();
  else ui.goForward();
  return true;
}

const PAGE_HISTORY_HANDLERS = createPageHistoryHandlers();

/**
 * Back / forward between app-shell pages. Mounted by AppLayout only, so it is
 * live exactly while the sidebar pages are on screen (never under the
 * full-screen editors).
 */
export function usePageHistoryNavigation(): void {
  useKeymapLayer('global', getPageHistoryKeymap(), PAGE_HISTORY_HANDLERS);

  useEffect(() => {
    window.addEventListener('mouseup', handlePageHistoryMouseUp);
    return () => window.removeEventListener('mouseup', handlePageHistoryMouseUp);
  }, []);
}

/** Legacy spec → dispatcher binding. `ctrl` means Ctrl on Windows, Cmd on macOS. */
function toBinding(spec: Omit<ShortcutHandlerSpec, 'description'> & { description?: string }): ShortcutBinding {
  const parts: string[] = [];
  if (spec.ctrl) parts.push('Mod');
  if (spec.alt) parts.push('Alt');
  if (spec.shift) parts.push('Shift');
  parts.push(spec.key);
  const isEscape = spec.key.toLowerCase() === 'escape' || spec.key.toLowerCase() === 'esc';
  return {
    keys: parts.join('+'),
    run: () => spec.handler(),
    when: spec.when,
    allowInInput: isEscape,
    id: spec.description,
  };
}

/**
 * Register a global shortcut (used by the extension runtime). Later
 * registrations of the same combo win. Returns the unregister function.
 */
export function registerShortcut(shortcut: ShortcutHandlerSpec): () => void {
  return registerShortcutLayer('global', [toBinding(shortcut)], { priority: 1 });
}

export function useKeyboardShortcuts() {
  const setCurrentPage = useUIStore((state) => state.setCurrentPage);

  const handlers = useMemo(() => {
    const out = {} as Record<GlobalNavCommand, ShortcutHandler>;
    for (const id of Object.keys(GLOBAL_NAV_TARGETS) as GlobalNavCommand[]) {
      out[id] = () => setCurrentPage(GLOBAL_NAV_TARGETS[id]);
    }
    return out;
  }, [setCurrentPage]);

  useKeymapLayer('global', GLOBAL_NAV_KEYMAP, handlers);

  return { registerShortcut };
}

/** Component-scoped global shortcut (kept for API compatibility). */
export function useShortcut(
  key: string,
  handler: () => void,
  options: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    description?: string;
    when?: () => boolean;
  } = {},
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const whenRef = useRef(options.when);
  whenRef.current = options.when;

  const binding = useMemo(
    () =>
      toBinding({
        key,
        ctrl: options.ctrl,
        shift: options.shift,
        alt: options.alt,
        description: options.description,
        handler: () => handlerRef.current(),
        when: () => (whenRef.current ? whenRef.current() : true),
      }),
    [key, options.ctrl, options.shift, options.alt, options.description],
  );
  useShortcutLayer('global', [binding], { priority: 1 });
}

export default useKeyboardShortcuts;
