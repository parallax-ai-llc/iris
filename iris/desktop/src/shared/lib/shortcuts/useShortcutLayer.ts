/**
 * React bindings for the shortcut dispatcher.
 *
 * Layers are registered ONCE per mount and read their bindings / enabled flag
 * through refs, so re-renders never reorder layers or re-attach listeners.
 */

import { useEffect, useRef } from 'react';
import {
  registerShortcutLayer,
  type ShortcutBinding,
  type ShortcutScope,
} from './dispatcher';
import { keymapBindings, type Keymap, type ShortcutHandler } from './keymap';

export interface UseShortcutLayerOptions {
  /** Layer is skipped while false. Default true. */
  enabled?: boolean;
  /** Tie-breaker inside a scope. Fixed at mount. */
  priority?: number;
  /** Stop lower layers even when nothing matched. Fixed at mount. */
  blocking?: boolean;
}

export function useShortcutLayer(
  scope: ShortcutScope,
  bindings: readonly ShortcutBinding[],
  options: UseShortcutLayerOptions = {},
): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const enabledRef = useRef(options.enabled ?? true);
  enabledRef.current = options.enabled ?? true;
  const { priority, blocking } = options;

  useEffect(
    () =>
      registerShortcutLayer(scope, () => bindingsRef.current, {
        priority,
        blocking,
        enabled: () => enabledRef.current,
      }),
    [scope, priority, blocking],
  );
}

/** Register handlers for (a subset of) a feature keymap. */
export function useKeymapLayer<C extends string>(
  scope: ShortcutScope,
  keymap: Keymap<C>,
  handlers: Partial<Record<C, ShortcutHandler>>,
  options: UseShortcutLayerOptions = {},
): void {
  useShortcutLayer(scope, keymapBindings(keymap, handlers), options);
}

/**
 * While `active`, block editor/page/global shortcuts. Mount it in every
 * dialog; the dialog keeps handling its own keys (Esc, Enter) itself.
 */
export function useModalShortcutBlock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return registerShortcutLayer('modal', [], { blocking: true });
  }, [active]);
}

export type { ShortcutHandler };
