import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/shared/stores/ui.store', () => ({
  useUIStore: { getState: () => ({ setCurrentPage: vi.fn() }) },
}));

import {
  useEditorTabsStore,
  shouldConfirmClose,
  leaveClosesTab,
} from '@/features/image-editor/stores/editorTabs.store';
import { getStore, getActiveTabId, setActiveTabId } from '@/features/image-editor/stores/imageEditorRegistry';
import { normalizeLocalPath, isSameLocalPath } from '@/features/image-editor/lib/localPath';
import type { IrisAsset } from '@/shared/api/types';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';

const asset = (id: string, name = id): IrisAsset => ({
  id,
  userId: '',
  name,
  storagePath: '',
  currentVersion: 1,
  assetType: 'IMAGE',
  mimeType: 'image/png',
  sizeBytes: 0,
  isPublic: false,
  previewUrl: 'data:image/png;base64,AAAA',
  createdAt: '',
  updatedAt: '',
});

const layer: Layer = {
  id: 'bg',
  name: 'Background',
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal',
  imageData: 'data:image/png;base64,AAAA',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
};

const tabs = () => useEditorTabsStore.getState();
const tabByName = (name: string) => tabs().tabs.find((t) => t.asset.name === name)!;
const storeOf = (name: string) => getStore(tabByName(name).id)!;

function editTab(name: string) {
  storeOf(name).getState().pushHistory('Brush Stroke', 'data:1');
}

beforeEach(() => {
  useEditorTabsStore.setState({ tabs: [], activeTabId: null, isEditorVisible: false, pendingClose: null });
  setActiveTabId(null);
});

describe('localPath', () => {
  it('treats Windows paths case- and slash-insensitively', () => {
    expect(normalizeLocalPath('C:\\Users\\A\\Pic.PNG')).toBe('c:/users/a/pic.png');
    expect(isSameLocalPath('C:\\x\\a.png', 'c:/X/A.png')).toBe(true);
  });
  it('keeps POSIX paths case-sensitive and never matches a missing path', () => {
    expect(isSameLocalPath('/tmp/A.png', '/tmp/a.png')).toBe(false);
    expect(isSameLocalPath(undefined, undefined)).toBe(false);
  });
});

describe('editorTabs: opening', () => {
  it('the same local file (by path) focuses the existing tab instead of a duplicate', () => {
    tabs().openTab(asset('local-1', 'a.png'), { sourcePath: 'C:\\pics\\a.png' });
    tabs().openTab(asset('local-2', 'b.png'), { sourcePath: 'C:\\pics\\b.png' });
    tabs().openTab(asset('local-3', 'a.png'), { sourcePath: 'c:/pics/A.png' });
    expect(tabs().tabs.map((t) => t.asset.name)).toEqual(['a.png', 'b.png']);
    expect(tabs().activeTabId).toBe(tabByName('a.png').id);
    expect(getActiveTabId()).toBe(tabByName('a.png').id);
  });

  it('openTabWithLayers dedupes by path too, and focusTabForPath shows the editor', () => {
    tabs().openTabWithLayers(asset('local-1', 'a.png'), [layer], 'data:c', 10, 10, undefined, { sourcePath: '/p/a.png' });
    tabs().hideEditor();
    tabs().openTabWithLayers(asset('local-2', 'a.png'), [layer], 'data:c', 10, 10, undefined, { sourcePath: '/p/a.png' });
    expect(tabs().tabs).toHaveLength(1);
    expect(tabs().isEditorVisible).toBe(true);
    expect(tabs().focusTabForPath('/p/other.png')).toBe(false);
  });

  it('files without a path are never merged', () => {
    tabs().openTab(asset('local-1', 'a.png'));
    tabs().openTab(asset('local-2', 'a.png'));
    expect(tabs().tabs).toHaveLength(2);
  });
});

describe('editorTabs: one close decision for every path', () => {
  it('a clean tab closes at once (local or cloud)', () => {
    tabs().openTab(asset('local-1', 'local.png'));
    tabs().openTab(asset('cloud-1', 'cloud.png'));
    expect(shouldConfirmClose(tabByName('local.png'))).toBe(false);
    tabs().requestCloseTab(tabByName('local.png').id);
    tabs().requestCloseTab(tabByName('cloud.png').id);
    expect(tabs().tabs).toHaveLength(0);
    expect(tabs().pendingClose).toBeNull();
  });

  it('a dirty tab asks (and is focused); cancel keeps it, confirm closes it', () => {
    tabs().openTab(asset('cloud-1', 'one.png'));
    tabs().openTab(asset('cloud-2', 'two.png'));
    tabs().switchTab(tabByName('one.png').id);
    editTab('one.png');
    tabs().switchTab(tabByName('two.png').id);

    const one = tabByName('one.png');
    tabs().requestCloseTab(one.id);
    expect(tabs().pendingClose).toEqual({ tabId: one.id, thenHide: false });
    expect(tabs().activeTabId).toBe(one.id);

    tabs().cancelPendingClose();
    expect(tabs().tabs).toHaveLength(2);

    tabs().requestCloseTab(one.id);
    tabs().confirmPendingClose();
    expect(tabs().tabs.map((t) => t.asset.name)).toEqual(['two.png']);
  });

  it('undoing back to the opened state makes the close silent again', () => {
    tabs().openTabWithLayers(asset('local-1', 'a.png'), [layer], 'data:c', 10, 10);
    editTab('a.png');
    expect(shouldConfirmClose(tabByName('a.png'))).toBe(true);
    storeOf('a.png').getState().undo();
    expect(shouldConfirmClose(tabByName('a.png'))).toBe(false);
  });

  it('leaving keeps clean and cloud tabs alive; a dirty local tab asks and is closed on confirm', () => {
    tabs().openTab(asset('cloud-1', 'cloud.png'));
    editTab('cloud.png');
    tabs().requestLeaveEditor();
    expect(tabs().pendingClose).toBeNull();
    expect(tabs().isEditorVisible).toBe(false);
    expect(tabs().tabs).toHaveLength(1);

    tabs().openTabWithLayers(asset('local-1', 'local.png'), [layer], 'data:c', 10, 10);
    expect(leaveClosesTab(tabByName('local.png'))).toBe(false);
    tabs().requestLeaveEditor();
    expect(tabs().isEditorVisible).toBe(false);
    expect(tabs().tabs).toHaveLength(2);

    tabs().switchTab(tabByName('local.png').id);
    tabs().openTabWithLayers(asset('local-2', 'x.png'), [layer], 'data:c', 10, 10); // shows editor again
    tabs().switchTab(tabByName('local.png').id);
    editTab('local.png');
    tabs().requestLeaveEditor();
    expect(tabs().pendingClose).toEqual({ tabId: tabByName('local.png').id, thenHide: true });
    tabs().confirmPendingClose();
    expect(tabs().tabs.map((t) => t.asset.name)).toEqual(['cloud.png', 'x.png']);
    expect(tabs().isEditorVisible).toBe(false);
  });
});

describe('editorTabs: returning to a hidden editor', () => {
  it('showEditor shows the last active tab again with its edit', () => {
    tabs().openTab(asset('cloud-a', 'a.png'));
    tabs().openTab(asset('cloud-b', 'b.png'));
    tabs().switchTab(tabByName('a.png').id);
    editTab('a.png');
    tabs().requestLeaveEditor();
    expect(tabs().isEditorVisible).toBe(false);

    tabs().showEditor();
    expect(tabs().isEditorVisible).toBe(true);
    expect(tabs().activeTabId).toBe(tabByName('a.png').id);
    expect(getActiveTabId()).toBe(tabByName('a.png').id);
    expect(storeOf('a.png').getState().isDirty).toBe(true);
  });

  it('showEditor does nothing without open tabs', () => {
    tabs().showEditor();
    expect(tabs().isEditorVisible).toBe(false);
  });
});
