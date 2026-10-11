/**
 * Keymap = data. A feature declares `Record<CommandId, KeymapEntry>` once and
 * both the dispatcher bindings and the menu labels are derived from it, so a
 * shortcut shown in a menu is always the one that actually fires.
 */

import { formatCombo, type ShortcutPlatform } from './combo';
import type { ShortcutBinding } from './dispatcher';

export interface KeymapEntry {
  /** First entry is the one shown in menus; the rest are aliases. */
  keys: readonly string[];
  /** English description (shortcut help lists). */
  description: string;
  allowInInput?: boolean;
  allowRepeat?: boolean;
}

export type Keymap<C extends string> = Readonly<Record<C, KeymapEntry>>;

/** Return `false` to decline the key (it then falls through). Async handlers count as handled. */
export type ShortcutHandler = (e: KeyboardEvent) => void | boolean | Promise<unknown>;

/** Build dispatcher bindings for the commands that have a handler. */
export function keymapBindings<C extends string>(
  keymap: Keymap<C>,
  handlers: Partial<Record<C, ShortcutHandler>>,
): ShortcutBinding[] {
  const out: ShortcutBinding[] = [];
  for (const id of Object.keys(handlers) as C[]) {
    const run = handlers[id];
    const entry = keymap[id];
    if (!run || !entry) continue;
    out.push({
      id,
      keys: entry.keys,
      run,
      allowInInput: entry.allowInInput,
      allowRepeat: entry.allowRepeat,
    });
  }
  return out;
}

/** Menu label for a command, e.g. "Ctrl+Shift+Z". */
export function shortcutLabel<C extends string>(
  keymap: Keymap<C>,
  command: C,
  platform?: ShortcutPlatform,
): string {
  return formatCombo(keymap[command].keys[0], platform);
}
