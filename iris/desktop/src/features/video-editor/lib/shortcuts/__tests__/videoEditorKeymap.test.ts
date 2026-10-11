/**
 * Invariants that keep "what the menu / help shows" == "what the keyboard does".
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { comboSignature, type ShortcutPlatform } from '@/shared/lib/shortcuts';
import {
  VIDEO_EDITOR_EDIT_COMMANDS,
  VIDEO_EDITOR_FILE_COMMANDS,
  VIDEO_EDITOR_KEYMAP,
  VIDEO_EDITOR_SHORTCUT_GROUPS,
  type VideoEditorCommand,
} from '../videoEditorKeymap';
import { createVideoEditorEditHandlers } from '@/features/video-editor/hooks/useVideoEditorShortcuts';

// vitest runs from the iris/desktop package root.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const MENU_SOURCE = read('src/features/video-editor/components/VideoEditorMenuBar.tsx');
const PAGE_SOURCE = read('src/app/editor/VideoEditorPage.tsx');

const ALL_COMMANDS: readonly VideoEditorCommand[] = [...VIDEO_EDITOR_FILE_COMMANDS, ...VIDEO_EDITOR_EDIT_COMMANDS];

describe('video editor keymap', () => {
  it('every keymap entry belongs to exactly one handler owner', () => {
    expect(new Set(ALL_COMMANDS).size).toBe(ALL_COMMANDS.length);
    expect([...ALL_COMMANDS].sort()).toEqual(Object.keys(VIDEO_EDITOR_KEYMAP).sort());
  });

  it('edit commands all have a handler function', () => {
    const handlers = createVideoEditorEditHandlers(() => ({ onShowShortcuts: () => {} }));
    for (const id of VIDEO_EDITOR_EDIT_COMMANDS) expect(typeof handlers[id]).toBe('function');
  });

  it('file commands are wired in VideoEditorPage', () => {
    for (const id of VIDEO_EDITOR_FILE_COMMANDS) {
      expect(PAGE_SOURCE).toMatch(new RegExp(`\\b${id}:`));
    }
  });

  it.each<ShortcutPlatform>(['other', 'mac'])('no two commands share a combo (%s)', (platform) => {
    const seen = new Map<string, string>();
    for (const id of ALL_COMMANDS) {
      for (const combo of VIDEO_EDITOR_KEYMAP[id].keys) {
        const sig = comboSignature(combo, platform);
        expect(seen.get(sig), `${combo} used by both ${seen.get(sig)} and ${id}`).toBeUndefined();
        seen.set(sig, id);
      }
    }
  });

  it('the shortcut help lists every command exactly once', () => {
    const listed = VIDEO_EDITOR_SHORTCUT_GROUPS.flatMap((g) => g.commands);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...ALL_COMMANDS].sort());
  });
});

describe('VideoEditorMenuBar ↔ keymap', () => {
  it('has no hand-written shortcut labels', () => {
    expect(MENU_SOURCE).not.toMatch(/\bshortcut\s*:/);
    expect(MENU_SOURCE).not.toMatch(/getModifierKey/);
  });

  it('every menu shortcut label points at a keymap command with a handler', () => {
    const commands = [...MENU_SOURCE.matchAll(/command:\s*'([A-Za-z0-9]+)'/g)].map((m) => m[1]);
    expect(commands.length).toBeGreaterThan(10);
    for (const id of commands) {
      expect(VIDEO_EDITOR_KEYMAP, `menu command "${id}"`).toHaveProperty(id);
      expect(ALL_COMMANDS).toContain(id);
    }
  });
});
