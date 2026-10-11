/**
 * useKeyboardShortcuts - global shortcuts (sidebar navigation) + the legacy
 * `registerShortcut` / `useShortcut` API, all running on the central
 * dispatcher in `@/shared/lib/shortcuts`.
 *
 * Global shortcuts live in the lowest scope, so an open editor wins:
 * in the image editor Ctrl+0 / Ctrl+1 zoom instead of navigating.
 */

import { useMemo, useRef } from 'react';
import { useUIStore } from '@/shared/stores/ui.store';
import {
  registerShortcutLayer,
  useKeymapLayer,
  useShortcutLayer,
  type Keymap,
  type ShortcutBinding,
  type ShortcutHandler,
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
