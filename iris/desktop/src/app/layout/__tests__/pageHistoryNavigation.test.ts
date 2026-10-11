/**
 * Page history shortcuts (Alt+← / Alt+→, ⌘[ / ⌘] on macOS) and the mouse
 * back / forward buttons, routed through the real dispatcher and keymaps.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureShortcutDispatcher,
  formatCombo,
  keymapBindings,
  registerShortcutLayer,
  resetShortcutDispatcherForTests,
  setShortcutPlatform,
  type ShortcutPlatform,
} from '@/shared/lib/shortcuts';
import {
  createPageHistoryHandlers,
  getPageHistoryKeymap,
  handlePageHistoryMouseUp,
  pageHistoryShortcutKeys,
} from '@/shared/hooks/useKeyboardShortcuts';
import { useUIStore } from '@/shared/stores/ui.store';
import { IMAGE_EDITOR_KEYMAP } from '@/features/image-editor/lib/shortcuts/imageEditorKeymap';
import { setupImageEditorTestTab, teardownImageEditorTestTab } from '@/test-utils/imageEditorHelpers';

function press(init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

function mouse(button: number): MouseEvent {
  const e = new MouseEvent('mouseup', { bubbles: true, cancelable: true, button });
  handlePageHistoryMouseUp(e);
  return e;
}

const altLeft = { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true };
const altRight = { key: 'ArrowRight', code: 'ArrowRight', altKey: true };
const cmdOpen = { key: '[', code: 'BracketLeft', metaKey: true };
const cmdClose = { key: ']', code: 'BracketRight', metaKey: true };

function registerHistory(platform: ShortcutPlatform) {
  return registerShortcutLayer(
    'global',
    keymapBindings(getPageHistoryKeymap(platform), createPageHistoryHandlers()),
  );
}

function page() {
  return useUIStore.getState().currentPage;
}

/** home → images → videos → library */
function visitThreePages() {
  const { setCurrentPage } = useUIStore.getState();
  setCurrentPage('images');
  setCurrentPage('videos');
  setCurrentPage('library');
}

beforeEach(() => {
  resetShortcutDispatcherForTests();
  ensureShortcutDispatcher(window);
  useUIStore.setState({ currentPage: 'home', backStack: [], forwardStack: [], pendingToolMode: null });
});

afterEach(() => {
  resetShortcutDispatcherForTests();
  setShortcutPlatform(null);
  document.body.innerHTML = '';
});

describe('keymap', () => {
  it('Windows / Linux use Alt+← and Alt+→', () => {
    const km = getPageHistoryKeymap('other');
    expect(formatCombo(km.navBack.keys[0], 'other')).toBe('Alt+←');
    expect(formatCombo(km.navForward.keys[0], 'other')).toBe('Alt+→');
  });

  it('macOS uses ⌘[ and ⌘]', () => {
    const km = getPageHistoryKeymap('mac');
    expect(formatCombo(km.navBack.keys[0], 'mac')).toBe('⌘+[');
    expect(formatCombo(km.navForward.keys[0], 'mac')).toBe('⌘+]');
  });

  it('settings row key caps match the keymap', () => {
    expect(pageHistoryShortcutKeys('other')).toEqual(['Alt', '← / →']);
    expect(pageHistoryShortcutKeys('mac')).toEqual(['⌘', '[ / ]']);
  });
});

describe('keyboard (Windows / Linux)', () => {
  beforeEach(() => setShortcutPlatform('other'));

  it('Alt+← twice then Alt+→ walks the history', () => {
    registerHistory('other');
    visitThreePages();

    expect(press(altLeft).defaultPrevented).toBe(true);
    expect(page()).toBe('videos');
    press(altLeft);
    expect(page()).toBe('images');
    press(altRight);
    expect(page()).toBe('videos');
  });

  it('with nothing to go back to the key is left alone', () => {
    registerHistory('other');
    const e = press(altLeft);
    expect(e.defaultPrevented).toBe(false);
    expect(page()).toBe('home');
  });

  it('is not intercepted while typing in a text field', () => {
    registerHistory('other');
    visitThreePages();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = press(altLeft, input);
    expect(e.defaultPrevented).toBe(false);
    expect(page()).toBe('library');

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    press(altLeft, editable);
    expect(page()).toBe('library');
  });

  it('an open editor wins: history keys do nothing under an editor layer', () => {
    registerHistory('other');
    visitThreePages();
    const editorKey = vi.fn();
    const off = registerShortcutLayer('editor', [{ keys: 'Mod+S', run: editorKey }]);

    const e = press(altLeft);
    expect(e.defaultPrevented).toBe(false);
    expect(page()).toBe('library');

    off();
    press(altLeft);
    expect(page()).toBe('videos');
  });

  it('an open modal blocks history navigation', () => {
    registerHistory('other');
    visitThreePages();
    const close = registerShortcutLayer('modal', [], { blocking: true });
    press(altLeft);
    expect(page()).toBe('library');
    close();
    press(altLeft);
    expect(page()).toBe('videos');
  });
});

describe('keyboard (macOS)', () => {
  beforeEach(() => {
    setShortcutPlatform('mac');
    setupImageEditorTestTab();
  });
  afterEach(() => teardownImageEditorTestTab());

  it('⌘[ / ⌘] walk the history', () => {
    registerHistory('mac');
    visitThreePages();
    press(cmdOpen);
    expect(page()).toBe('videos');
    press(cmdClose);
    expect(page()).toBe('library');
  });

  it('in the image editor ⌘[ / ⌘] keep reordering layers', () => {
    registerHistory('mac');
    visitThreePages();
    const backward = vi.fn();
    const forward = vi.fn();
    registerShortcutLayer(
      'editor',
      keymapBindings(IMAGE_EDITOR_KEYMAP, {
        sendLayerBackward: backward,
        bringLayerForward: forward,
      }),
    );
    press(cmdOpen);
    press(cmdClose);
    expect(backward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(page()).toBe('library');
  });
});

describe('mouse back / forward buttons', () => {
  it('button 3 goes back, button 4 goes forward', () => {
    visitThreePages();
    expect(mouse(3).defaultPrevented).toBe(true);
    expect(page()).toBe('videos');
    mouse(3);
    expect(page()).toBe('images');
    mouse(4);
    expect(page()).toBe('videos');
  });

  it('other buttons are ignored', () => {
    visitThreePages();
    expect(mouse(0).defaultPrevented).toBe(false);
    mouse(1);
    mouse(2);
    expect(page()).toBe('library');
  });

  it('does nothing under an editor or an open modal', () => {
    visitThreePages();
    const offEditor = registerShortcutLayer('editor', []);
    mouse(3);
    expect(page()).toBe('library');
    offEditor();

    const offModal = registerShortcutLayer('modal', [], { blocking: true });
    mouse(3);
    expect(page()).toBe('library');
    offModal();

    mouse(3);
    expect(page()).toBe('videos');
  });
});
