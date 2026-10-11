/**
 * End-to-end routing through the real keymaps: global navigation vs the
 * image editor vs a modal, all on the central dispatcher.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureShortcutDispatcher,
  keymapBindings,
  registerShortcutLayer,
  resetShortcutDispatcherForTests,
  setShortcutPlatform,
  type ShortcutHandler,
} from '@/shared/lib/shortcuts';
import {
  GLOBAL_NAV_KEYMAP,
  GLOBAL_NAV_TARGETS,
  type GlobalNavCommand,
} from '@/shared/hooks/useKeyboardShortcuts';
import { IMAGE_EDITOR_KEYMAP } from '@/features/image-editor/lib/shortcuts/imageEditorKeymap';
import { createImageEditorPageHandlers } from '@/features/image-editor/hooks/useImageEditorShortcuts';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { setupImageEditorTestTab, teardownImageEditorTestTab } from '@/test-utils/imageEditorHelpers';

function press(init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(e);
  return e;
}

const ctrl1 = { key: '1', code: 'Digit1', ctrlKey: true };

function registerGlobalNav(navigate: (page: string) => void) {
  const handlers = {} as Record<GlobalNavCommand, ShortcutHandler>;
  for (const id of Object.keys(GLOBAL_NAV_TARGETS) as GlobalNavCommand[]) {
    handlers[id] = () => navigate(GLOBAL_NAV_TARGETS[id]);
  }
  return registerShortcutLayer('global', keymapBindings(GLOBAL_NAV_KEYMAP, handlers));
}

function registerImageEditor() {
  const ctx = {
    onBack: vi.fn(),
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onCloseTab: vi.fn(),
    onPaste: vi.fn(),
  };
  const off = registerShortcutLayer(
    'editor',
    keymapBindings(IMAGE_EDITOR_KEYMAP, createImageEditorPageHandlers(() => ctx)),
  );
  return { ctx, off };
}

beforeEach(() => {
  resetShortcutDispatcherForTests();
  setShortcutPlatform('other');
  ensureShortcutDispatcher(window);
  setupImageEditorTestTab();
});

afterEach(() => {
  resetShortcutDispatcherForTests();
  setShortcutPlatform(null);
  teardownImageEditorTestTab();
});

describe('global vs image editor', () => {
  it('without an editor, Ctrl+1 navigates home', () => {
    const navigate = vi.fn();
    registerGlobalNav(navigate);
    press(ctrl1);
    expect(navigate).toHaveBeenCalledWith('home');
  });

  it('with the image editor open, Ctrl+1 zooms to 100% and does not navigate', () => {
    const navigate = vi.fn();
    registerGlobalNav(navigate);
    registerImageEditor();
    useImageEditorStore.getState().setZoom(37);

    press(ctrl1);
    expect(navigate).not.toHaveBeenCalled();
    expect(useImageEditorStore.getState().zoom).toBe(100);
  });

  it('Ctrl+, (settings) still reaches the global layer from the editor', () => {
    const navigate = vi.fn();
    registerGlobalNav(navigate);
    registerImageEditor();
    press({ key: ',', code: 'Comma', ctrlKey: true });
    expect(navigate).toHaveBeenCalledWith('settings');
  });

  it('an open modal blocks editor and navigation shortcuts', () => {
    const navigate = vi.fn();
    registerGlobalNav(navigate);
    const { ctx } = registerImageEditor();
    const closeModal = registerShortcutLayer('modal', [], { blocking: true });

    press({ key: 's', code: 'KeyS', ctrlKey: true });
    press(ctrl1);
    expect(ctx.onSave).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    closeModal();
    press({ key: 's', code: 'KeyS', ctrlKey: true });
    expect(ctx.onSave).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+S is Save As, Ctrl+S is Save (IME / CapsLock safe)', () => {
    const { ctx } = registerImageEditor();
    press({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true });
    press({ key: 'ㄴ', code: 'KeyS', ctrlKey: true });
    expect(ctx.onSaveAs).toHaveBeenCalledTimes(1);
    expect(ctx.onSave).toHaveBeenCalledTimes(1);
  });

  it('single-key tools work under the Hangul IME (V → move, C → crop)', () => {
    registerImageEditor();
    press({ key: 'ㅍ', code: 'KeyV' });
    expect(useImageEditorStore.getState().editMode).toBe('move');
    press({ key: 'ㅊ', code: 'KeyC' });
    expect(useImageEditorStore.getState().editMode).toBe('crop');
  });

  it('Escape leaves the tool mode first, then goes back', () => {
    const { ctx } = registerImageEditor();
    useImageEditorStore.getState().setEditMode('crop');
    press({ key: 'Escape', code: 'Escape' });
    expect(useImageEditorStore.getState().editMode).toBe('none');
    expect(ctx.onBack).not.toHaveBeenCalled();
    press({ key: 'Escape', code: 'Escape' });
    expect(ctx.onBack).toHaveBeenCalledTimes(1);
  });

  it('Enter only applies crop in crop mode (otherwise it is left alone)', () => {
    registerImageEditor();
    const e = press({ key: 'Enter', code: 'Enter' });
    expect(e.defaultPrevented).toBe(false);
  });
});
