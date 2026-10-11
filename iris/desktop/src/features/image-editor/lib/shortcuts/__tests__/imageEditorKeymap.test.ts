/**
 * Invariants that keep "what the menu shows" == "what the keyboard does".
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { comboSignature, type ShortcutPlatform } from '@/shared/lib/shortcuts';
import {
  IMAGE_EDITOR_CANVAS_COMMANDS,
  IMAGE_EDITOR_KEYMAP,
  IMAGE_EDITOR_LAYER_COMMANDS,
  IMAGE_EDITOR_PAGE_COMMANDS,
  type ImageEditorCommand,
} from '../imageEditorKeymap';
import {
  createImageEditorPageHandlers,
  toolGroupBindings,
} from '@/features/image-editor/hooks/useImageEditorShortcuts';
import { IMAGE_EDITOR_LAYER_HANDLERS } from '@/features/image-editor/hooks/useImageEditorLayerShortcuts';

// vitest runs from the iris/desktop package root.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const MENU_SOURCE = read('src/features/image-editor/components/tabs/EditorMenuBar.tsx');
const CANVAS_HOOK_SOURCE = read('src/features/image-editor/hooks/useImageEditorCanvasShortcuts.ts');

const ALL_COMMANDS: readonly ImageEditorCommand[] = [
  ...IMAGE_EDITOR_PAGE_COMMANDS,
  ...IMAGE_EDITOR_LAYER_COMMANDS,
  ...IMAGE_EDITOR_CANVAS_COMMANDS,
];

describe('image editor keymap', () => {
  it('every keymap entry belongs to exactly one handler owner', () => {
    expect(new Set(ALL_COMMANDS).size).toBe(ALL_COMMANDS.length);
    expect([...ALL_COMMANDS].sort()).toEqual(Object.keys(IMAGE_EDITOR_KEYMAP).sort());
  });

  it('page and layer commands all have a handler function', () => {
    const page = createImageEditorPageHandlers(() => ({
      onBack: () => {},
      onNew: () => {},
      onOpen: () => {},
      onSave: () => {},
      onSaveAs: () => {},
      onCloseTab: () => {},
      onPaste: () => {},
    }));
    for (const id of IMAGE_EDITOR_PAGE_COMMANDS) expect(typeof page[id]).toBe('function');
    for (const id of IMAGE_EDITOR_LAYER_COMMANDS) expect(typeof IMAGE_EDITOR_LAYER_HANDLERS[id]).toBe('function');
  });

  it('canvas commands are implemented by the canvas shortcut hook', () => {
    for (const id of IMAGE_EDITOR_CANVAS_COMMANDS) {
      expect(CANVAS_HOOK_SOURCE).toMatch(new RegExp(`\\b${id}:`));
    }
  });

  it.each<ShortcutPlatform>(['other', 'mac'])('no two commands (incl. tool-group letters) share a combo (%s)', (platform) => {
    const seen = new Map<string, string>();
    const add = (owner: string, combo: string) => {
      const sig = comboSignature(combo, platform);
      expect(seen.get(sig), `${combo} used by both ${seen.get(sig)} and ${owner}`).toBeUndefined();
      seen.set(sig, owner);
    };
    for (const id of ALL_COMMANDS) {
      for (const combo of IMAGE_EDITOR_KEYMAP[id].keys) add(id, combo);
    }
    for (const b of toolGroupBindings()) {
      for (const combo of typeof b.keys === 'string' ? [b.keys] : b.keys) add(b.id ?? '?', combo);
    }
  });

  it('Redo is Ctrl+Shift+Z and Ctrl+Y is Proof Colors (Photoshop)', () => {
    expect(IMAGE_EDITOR_KEYMAP.redo.keys[0]).toBe('Mod+Shift+Z');
    expect(IMAGE_EDITOR_KEYMAP.proofColors.keys).toEqual(['Mod+Y']);
  });
});

describe('EditorMenuBar ↔ keymap', () => {
  it('has no hand-written shortcut labels', () => {
    expect(MENU_SOURCE).not.toMatch(/\bshortcut\s*:/);
    expect(MENU_SOURCE).not.toMatch(/getModifierKey/);
  });

  it('every menu shortcut label points at a keymap command with a handler', () => {
    const commands = [...MENU_SOURCE.matchAll(/command:\s*'([A-Za-z0-9]+)'/g)].map((m) => m[1]);
    expect(commands.length).toBeGreaterThan(15);
    for (const id of commands) {
      expect(IMAGE_EDITOR_KEYMAP, `menu command "${id}"`).toHaveProperty(id);
      expect(ALL_COMMANDS).toContain(id);
    }
  });
});
