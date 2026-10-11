/**
 * Central keyboard-shortcut dispatcher.
 *
 * ONE keydown listener on `window` (capture phase) routes every shortcut in the
 * app. Callers register *layers* of bindings under a scope; on each keydown the
 * dispatcher walks the layers from the highest scope down and runs the first
 * matching binding. Nothing below it runs.
 *
 *   modal  >  editor  >  page  >  global
 *
 * Within a scope, a higher `priority` wins, then the most recently registered
 * layer. A `blocking` layer (an open modal) stops the walk even when none of
 * its own bindings matched, so editor/global shortcuts cannot fire underneath
 * a dialog — the dialog's own key handling (Esc, Enter in its form) is left to
 * the dialog.
 *
 * Input guard: while an INPUT / TEXTAREA / SELECT / contenteditable has focus
 * a binding is skipped unless it declares `allowInInput`. Keystrokes that are
 * part of an IME composition (`e.isComposing`) are always ignored.
 *
 * Hold-style keys that need keyup (Space-to-pan, Shift tracking) stay as local
 * listeners — this dispatcher only handles keydown.
 */

import { matchesCombo, parseCombo, type ParsedCombo } from './combo';

export type ShortcutScope = 'global' | 'page' | 'editor' | 'modal';

export const SCOPE_RANK: Record<ShortcutScope, number> = {
  global: 0,
  page: 1,
  editor: 2,
  modal: 3,
};

export interface ShortcutBinding {
  /** One combo or several aliases, e.g. ['Mod+=', 'Mod+Shift+=']. */
  keys: string | readonly string[];
  /**
   * Runs the shortcut. Return `false` to decline (the event then continues to
   * the next binding / lower layer and is NOT preventDefault-ed).
   */
  run: (e: KeyboardEvent) => void | boolean | Promise<unknown>;
  /** Extra condition evaluated at keydown time. */
  when?: () => boolean;
  /** Fire even while a text field has focus (e.g. Escape, Ctrl+/). */
  allowInInput?: boolean;
  /** Fire on auto-repeat keydowns (holding the key). Default true. */
  allowRepeat?: boolean;
  /** Call preventDefault when handled. Default true. */
  preventDefault?: boolean;
  /** Optional identifier (command id) for debugging / tests. */
  id?: string;
}

export interface ShortcutLayerOptions {
  /** Stop lower layers even when nothing here matched (modals). */
  blocking?: boolean;
  /** Tie-breaker inside a scope; higher runs first. Default 0. */
  priority?: number;
  /** Evaluated at keydown; a disabled layer is skipped entirely. */
  enabled?: () => boolean;
}

interface Layer {
  seq: number;
  scope: ShortcutScope;
  getBindings: () => readonly ShortcutBinding[];
  blocking: boolean;
  priority: number;
  enabled?: () => boolean;
}

let layers: Layer[] = [];
let seqCounter = 0;
let installedOn: Window | null = null;

function sortedLayers(): Layer[] {
  return [...layers].sort(
    (a, b) =>
      SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope] ||
      b.priority - a.priority ||
      b.seq - a.seq,
  );
}

/** True when the event comes from a text-entry element. */
export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  // jsdom does not implement isContentEditable — check the attribute too.
  return typeof el.closest === 'function' && el.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

function bindingCombos(b: ShortcutBinding): ParsedCombo[] {
  const keys = typeof b.keys === 'string' ? [b.keys] : b.keys;
  return keys.map((k) => parseCombo(k));
}

/**
 * Route one keydown. Exported for tests; production code goes through the
 * window listener installed by {@link ensureShortcutDispatcher}.
 * Returns true when a binding handled the event.
 */
export function dispatchShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return false;
  if (e.isComposing) return false;
  const inInput = isTextInputTarget(e.target);

  for (const layer of sortedLayers()) {
    if (layer.enabled && !layer.enabled()) continue;
    for (const binding of layer.getBindings()) {
      if (!bindingCombos(binding).some((c) => matchesCombo(e, c))) continue;
      if (inInput && !binding.allowInInput) continue;
      if (e.repeat && binding.allowRepeat === false) continue;
      if (binding.when && !binding.when()) continue;
      const result = binding.run(e);
      if (result === false) continue;
      if (binding.preventDefault !== false) e.preventDefault();
      return true;
    }
    if (layer.blocking) return false;
  }
  return false;
}

const onWindowKeyDown = (e: KeyboardEvent) => {
  dispatchShortcut(e);
};

/** Install the single window listener (idempotent). */
export function ensureShortcutDispatcher(target: Window | null = typeof window !== 'undefined' ? window : null): void {
  if (!target || installedOn === target) return;
  if (installedOn) installedOn.removeEventListener('keydown', onWindowKeyDown, true);
  target.addEventListener('keydown', onWindowKeyDown, true);
  installedOn = target;
}

/**
 * Register a layer. `bindings` may be an array or a getter (so React callers
 * can keep the layer registered once and swap handlers through a ref).
 * Returns the unregister function.
 */
export function registerShortcutLayer(
  scope: ShortcutScope,
  bindings: readonly ShortcutBinding[] | (() => readonly ShortcutBinding[]),
  options: ShortcutLayerOptions = {},
): () => void {
  ensureShortcutDispatcher();
  const layer: Layer = {
    seq: ++seqCounter,
    scope,
    getBindings: typeof bindings === 'function' ? bindings : () => bindings,
    blocking: options.blocking ?? false,
    priority: options.priority ?? 0,
    enabled: options.enabled,
  };
  layers.push(layer);
  return () => {
    layers = layers.filter((l) => l !== layer);
  };
}

/** Test helper: drop every layer and detach the listener. */
export function resetShortcutDispatcherForTests(): void {
  layers = [];
  if (installedOn) installedOn.removeEventListener('keydown', onWindowKeyDown, true);
  installedOn = null;
}
