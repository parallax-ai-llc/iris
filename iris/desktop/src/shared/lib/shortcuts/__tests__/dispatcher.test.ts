import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureShortcutDispatcher,
  registerShortcutLayer,
  resetShortcutDispatcherForTests,
} from '../dispatcher';
import { setShortcutPlatform } from '../combo';

function press(init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  resetShortcutDispatcherForTests();
  setShortcutPlatform('other');
  ensureShortcutDispatcher(window);
});

afterEach(() => {
  resetShortcutDispatcherForTests();
  setShortcutPlatform(null);
  document.body.innerHTML = '';
});

describe('scope priority', () => {
  it('editor beats global; nothing below runs', () => {
    const nav = vi.fn();
    const zoom = vi.fn();
    registerShortcutLayer('global', [{ keys: 'Mod+1', run: nav }]);
    const off = registerShortcutLayer('editor', [{ keys: 'Mod+1', run: zoom }]);

    const e = press({ key: '1', code: 'Digit1', ctrlKey: true });
    expect(zoom).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);

    off();
    press({ key: '1', code: 'Digit1', ctrlKey: true });
    expect(nav).toHaveBeenCalledTimes(1);
  });

  it('registration order does not matter (global registered after editor)', () => {
    const nav = vi.fn();
    const zoom = vi.fn();
    registerShortcutLayer('editor', [{ keys: 'Mod+0', run: zoom }]);
    registerShortcutLayer('global', [{ keys: 'Mod+0', run: nav }]);
    press({ key: '0', code: 'Digit0', ctrlKey: true });
    expect(zoom).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
  });

  it('a blocking modal layer stops editor and global shortcuts', () => {
    const undo = vi.fn();
    const nav = vi.fn();
    registerShortcutLayer('global', [{ keys: 'Mod+1', run: nav }]);
    registerShortcutLayer('editor', [{ keys: 'Mod+Z', run: undo }]);
    const closeModal = registerShortcutLayer('modal', [], { blocking: true });

    const e = press({ key: 'z', code: 'KeyZ', ctrlKey: true });
    press({ key: '1', code: 'Digit1', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
    // The dialog keeps the key: the dispatcher does not swallow it.
    expect(e.defaultPrevented).toBe(false);

    closeModal();
    press({ key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('higher priority wins inside a scope (subtitle nudge over timeline seek)', () => {
    const seek = vi.fn();
    const nudge = vi.fn();
    registerShortcutLayer('editor', [{ keys: 'ArrowLeft', run: nudge }], { priority: 1 });
    registerShortcutLayer('editor', [{ keys: 'ArrowLeft', run: seek }]);
    press({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(seek).not.toHaveBeenCalled();
  });

  it('a disabled layer is skipped', () => {
    const nudge = vi.fn();
    const seek = vi.fn();
    let selected = false;
    registerShortcutLayer('editor', [{ keys: 'ArrowLeft', run: nudge }], { priority: 1, enabled: () => selected });
    registerShortcutLayer('editor', [{ keys: 'ArrowLeft', run: seek }]);
    press({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(seek).toHaveBeenCalledTimes(1);
    selected = true;
    press({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(nudge).toHaveBeenCalledTimes(1);
  });

  it('a handler returning false falls through and leaves the default alone', () => {
    const lower = vi.fn();
    registerShortcutLayer('global', [{ keys: 'Enter', run: lower }]);
    registerShortcutLayer('editor', [{ keys: 'Enter', run: () => false }]);
    const e = press({ key: 'Enter', code: 'Enter' });
    expect(lower).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('`when` false is treated as no match', () => {
    const run = vi.fn();
    registerShortcutLayer('editor', [{ keys: 'C', run, when: () => false }]);
    const e = press({ key: 'c', code: 'KeyC' });
    expect(run).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('input guard', () => {
  it('ignores shortcuts while typing in an input, textarea or contenteditable', () => {
    const run = vi.fn();
    registerShortcutLayer('editor', [{ keys: 'V', run }, { keys: 'Mod+Z', run }]);

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editable.appendChild(inner);
    document.body.append(input, textarea, editable);

    for (const target of [input, textarea, editable, inner]) {
      const e = press({ key: 'v', code: 'KeyV' }, target);
      press({ key: 'z', code: 'KeyZ', ctrlKey: true }, target);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('allowInInput bindings still fire (Escape, Ctrl+/)', () => {
    const esc = vi.fn();
    registerShortcutLayer('editor', [{ keys: 'Escape', run: esc, allowInInput: true }]);
    const input = document.createElement('input');
    document.body.append(input);
    press({ key: 'Escape', code: 'Escape' }, input);
    expect(esc).toHaveBeenCalledTimes(1);
  });

  it('ignores keys that are part of an IME composition', () => {
    const run = vi.fn();
    registerShortcutLayer('editor', [{ keys: 'V', run, allowInInput: true }]);
    press({ key: 'Process', code: 'KeyV', isComposing: true });
    expect(run).not.toHaveBeenCalled();
    // The first Hangul keydown outside a text field is not "composing".
    press({ key: 'ㅍ', code: 'KeyV' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('allowRepeat=false skips auto-repeat keydowns', () => {
    const run = vi.fn();
    registerShortcutLayer('editor', [{ keys: 'J', run, allowRepeat: false }]);
    press({ key: 'j', code: 'KeyJ', repeat: true });
    expect(run).not.toHaveBeenCalled();
    press({ key: 'j', code: 'KeyJ' });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('listener', () => {
  it('installs a single capture listener no matter how many layers exist', () => {
    resetShortcutDispatcherForTests();
    const spy = vi.spyOn(window, 'addEventListener');
    registerShortcutLayer('global', [{ keys: 'Mod+1', run: () => {} }]);
    registerShortcutLayer('editor', [{ keys: 'Mod+1', run: () => {} }]);
    registerShortcutLayer('page', [{ keys: 'Mod+2', run: () => {} }]);
    const keydownCalls = spy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownCalls).toHaveLength(1);
    expect(keydownCalls[0][2]).toBe(true);
    spy.mockRestore();
  });

  it('runs before a component listener on window that stops propagation (capture)', () => {
    const run = vi.fn();
    registerShortcutLayer('editor', [{ keys: 'Mod+Z', run }]);
    const blocker = (e: Event) => e.stopPropagation();
    document.body.addEventListener('keydown', blocker);
    press({ key: 'z', code: 'KeyZ', ctrlKey: true });
    document.body.removeEventListener('keydown', blocker);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
