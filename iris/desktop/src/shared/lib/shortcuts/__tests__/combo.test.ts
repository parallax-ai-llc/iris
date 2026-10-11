import { afterEach, describe, expect, it } from 'vitest';
import {
  comboSignature,
  formatCombo,
  matchesCombo,
  parseCombo,
  setShortcutPlatform,
} from '../combo';

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

afterEach(() => setShortcutPlatform(null));

describe('matchesCombo — physical key matching', () => {
  it('Ctrl+Shift+Z matches although e.key is uppercase "Z"', () => {
    setShortcutPlatform('other');
    const e = key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true });
    expect(matchesCombo(e, 'Mod+Shift+Z')).toBe(true);
    expect(matchesCombo(e, 'Mod+Z')).toBe(false);
  });

  it('CapsLock on: e.key is "Z" without Shift and still matches Ctrl+Z', () => {
    setShortcutPlatform('other');
    const e = key({ key: 'Z', code: 'KeyZ', ctrlKey: true });
    expect(matchesCombo(e, 'Mod+Z')).toBe(true);
    expect(matchesCombo(e, 'Mod+Shift+Z')).toBe(false);
  });

  it('Korean IME: e.key is a jamo or "Process", code is KeyZ', () => {
    setShortcutPlatform('other');
    expect(matchesCombo(key({ key: 'ㅋ', code: 'KeyZ', ctrlKey: true }), 'Mod+Z')).toBe(true);
    expect(matchesCombo(key({ key: 'Process', code: 'KeyZ', ctrlKey: true }), 'Mod+Z')).toBe(true);
    // single-key tool shortcuts (V = move) under the Hangul IME
    expect(matchesCombo(key({ key: 'ㅍ', code: 'KeyV' }), 'V')).toBe(true);
    expect(matchesCombo(key({ key: 'Process', code: 'BracketRight' }), ']')).toBe(true);
  });

  it('macOS: Mod is Cmd; Ctrl+Z does not undo on mac', () => {
    setShortcutPlatform('mac');
    expect(matchesCombo(key({ key: 'z', code: 'KeyZ', metaKey: true }), 'Mod+Z')).toBe(true);
    expect(matchesCombo(key({ key: 'z', code: 'KeyZ', ctrlKey: true }), 'Mod+Z')).toBe(false);
    expect(matchesCombo(key({ key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true }), 'Mod+Shift+Z')).toBe(true);
  });

  it('Windows: Win key does not count as Mod', () => {
    setShortcutPlatform('other');
    expect(matchesCombo(key({ key: 'z', code: 'KeyZ', metaKey: true }), 'Mod+Z')).toBe(false);
  });

  it('modifiers must match exactly', () => {
    setShortcutPlatform('other');
    expect(matchesCombo(key({ key: 'z', code: 'KeyZ' }), 'Mod+Z')).toBe(false);
    expect(matchesCombo(key({ key: 'v', code: 'KeyV', ctrlKey: true }), 'V')).toBe(false);
    expect(matchesCombo(key({ key: 'c', code: 'KeyC', ctrlKey: true, altKey: true }), 'Mod+Alt+C')).toBe(true);
  });

  it('macOS Option+] (e.key "‘") matches Alt+]', () => {
    setShortcutPlatform('mac');
    expect(matchesCombo(key({ key: '‘', code: 'BracketRight', altKey: true }), 'Alt+]')).toBe(true);
  });

  it('digits match the top row and the numpad', () => {
    setShortcutPlatform('other');
    expect(matchesCombo(key({ key: '1', code: 'Digit1', ctrlKey: true }), 'Mod+1')).toBe(true);
    expect(matchesCombo(key({ key: '1', code: 'Numpad1', ctrlKey: true }), 'Mod+1')).toBe(true);
  });

  it('"Mod++" is the = key; Shift+/ is "?"', () => {
    setShortcutPlatform('other');
    expect(matchesCombo(key({ key: '=', code: 'Equal', ctrlKey: true }), 'Mod++')).toBe(true);
    expect(matchesCombo(key({ key: '?', code: 'Slash', shiftKey: true }), 'Shift+/')).toBe(true);
  });

  it('named keys', () => {
    setShortcutPlatform('other');
    expect(matchesCombo(key({ key: 'Escape', code: 'Escape' }), 'Escape')).toBe(true);
    expect(matchesCombo(key({ key: 'Escape', code: 'Escape' }), 'Esc')).toBe(true);
    expect(matchesCombo(key({ key: ' ', code: 'Space' }), 'Space')).toBe(true);
    expect(matchesCombo(key({ key: 'Enter', code: 'NumpadEnter' }), 'Enter')).toBe(true);
    expect(matchesCombo(key({ key: 'F7', code: 'F7' }), 'F7')).toBe(true);
    expect(matchesCombo(key({ key: 'Delete', code: 'Delete', shiftKey: true }), 'Shift+Delete')).toBe(true);
  });

  it('falls back to e.key when code is missing (synthetic events)', () => {
    setShortcutPlatform('other');
    expect(matchesCombo(key({ key: 'z', ctrlKey: true }), 'Mod+Z')).toBe(true);
    expect(matchesCombo(key({ key: 'Escape' }), 'Escape')).toBe(true);
  });
});

describe('parse / format / signature', () => {
  it('rejects unknown modifiers', () => {
    expect(() => parseCombo('Hyper+Z', 'other')).toThrow();
  });

  it('formats like the existing menu labels', () => {
    expect(formatCombo('Mod+Shift+Z', 'other')).toBe('Ctrl+Shift+Z');
    expect(formatCombo('Mod+Shift+Z', 'mac')).toBe('⌘+Shift+Z');
    expect(formatCombo('Mod+=', 'other')).toBe('Ctrl++');
    expect(formatCombo('Mod+Alt+Shift+W', 'other')).toBe('Ctrl+Alt+Shift+W');
    expect(formatCombo('Escape', 'other')).toBe('Esc');
    expect(formatCombo('Delete', 'other')).toBe('Del');
  });

  it('signature treats aliases of the same physical key as equal', () => {
    expect(comboSignature('Mod++', 'other')).toBe(comboSignature('Mod+=', 'other'));
    expect(comboSignature('Esc', 'other')).toBe(comboSignature('Escape', 'other'));
    expect(comboSignature('Mod+Z', 'other')).not.toBe(comboSignature('Mod+Shift+Z', 'other'));
  });
});
