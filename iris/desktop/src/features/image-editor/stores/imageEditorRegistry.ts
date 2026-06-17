/**
 * Image Editor Store Registry
 *
 * Maintains a Map<tabId, StoreApi> so each editor tab owns its own store
 * instance.  Non-React code (action executors, file openers, etc.) can call
 * `getActiveStore()` to reach the currently-active store imperatively.
 */

import { createImageEditorStore, type ImageEditorStoreApi } from './imageEditorFactory';
import type { ImageEditorState } from './imageEditor.store';

const stores = new Map<string, ImageEditorStoreApi>();
let _activeTabId: string | null = null;

/** Get an existing store or create a new one for `tabId`. */
export function getOrCreateStore(
  tabId: string,
  overrides?: Partial<ImageEditorState>,
): ImageEditorStoreApi {
  let store = stores.get(tabId);
  if (!store) {
    store = createImageEditorStore(overrides);
    stores.set(tabId, store);
  }
  return store;
}

/** Return the store for `tabId` (or undefined if not yet created). */
export function getStore(tabId: string): ImageEditorStoreApi | undefined {
  return stores.get(tabId);
}

/** Remove the store instance for a closed tab so GC can reclaim memory. */
export function deleteStore(tabId: string): void {
  stores.delete(tabId);
}

/** Mark `tabId` as the currently-active tab. */
export function setActiveTabId(tabId: string | null): void {
  _activeTabId = tabId;
}

/** Return the active tab id. */
export function getActiveTabId(): string | null {
  return _activeTabId;
}

/**
 * Return the store for the currently-active tab.
 *
 * Throws if there is no active tab — callers should guard against this when
 * the editor might be closed.
 */
export function getActiveStore(): ImageEditorStoreApi {
  if (!_activeTabId) {
    throw new Error('[imageEditorRegistry] No active tab');
  }
  const store = stores.get(_activeTabId);
  if (!store) {
    throw new Error(`[imageEditorRegistry] No store for active tab ${_activeTabId}`);
  }
  return store;
}

/**
 * Safely return the active store, or `null` when the editor is closed /
 * no tab is active.  Prefer this over `getActiveStore()` in code paths
 * that may run while the editor is closed.
 */
export function getActiveStoreSafe(): ImageEditorStoreApi | null {
  if (!_activeTabId) return null;
  return stores.get(_activeTabId) ?? null;
}
