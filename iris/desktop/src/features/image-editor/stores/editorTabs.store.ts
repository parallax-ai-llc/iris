/**
 * Editor Tabs Store
 *
 * Manages multiple image editor tabs.  Each tab owns an independent Zustand
 * store instance (via the registry) so switching is instant — no snapshot
 * serialisation, no image reload, no `isCanvasReady = false`.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { IrisAsset } from '@/shared/api/types';
import type { Layer, TextLayer } from '@/features/image-editor/stores/imageEditor.store';
import { useUIStore } from '@/shared/stores/ui.store';
import {
  getOrCreateStore,
  getStore,
  deleteStore,
  setActiveTabId,
  getActiveStoreSafe,
} from '@/features/image-editor/stores/imageEditorRegistry';
import { isSameLocalPath, isLocalAssetId } from '@/features/image-editor/lib/localPath';

// ==================== Types ====================

export interface EditorTab {
  id: string;
  assetId: string;
  asset: IrisAsset;
  isDirty: boolean;
  createdAt: number;
  /** Local file the document was opened from (dedupes re-opening the same file). */
  sourcePath?: string;
}

export interface OpenTabOptions {
  /** Local file path; opening the same path again focuses the existing tab. */
  sourcePath?: string;
}

/** A close (or leave) that waits for the user's answer to the unsaved-changes dialog. */
export interface PendingClose {
  tabId: string;
  /** Leaving the editor (Back / Esc) after the tab is closed. */
  thenHide: boolean;
}

interface EditorTabsState {
  tabs: EditorTab[];
  activeTabId: string | null;
  isEditorVisible: boolean; // false = user navigated back to gallery, tabs stay alive
  pendingClose: PendingClose | null;
}

interface EditorTabsActions {
  openTab: (asset: IrisAsset, options?: OpenTabOptions) => void;
  openTabWithLayers: (
    asset: IrisAsset,
    layers: Layer[],
    compositeUrl: string,
    width: number,
    height: number,
    textLayers?: TextLayer[],
    options?: OpenTabOptions,
  ) => void;
  /** Focus (and show) the tab already holding this local file; false when none. */
  focusTabForPath: (sourcePath: string) => boolean;
  /** Close immediately (no questions asked). UI close paths use `requestCloseTab`. */
  closeTab: (tabId: string) => void;
  /** Every UI close path (tab X, Ctrl+W, File > Close Tab): asks only when the tab is dirty. */
  requestCloseTab: (tabId: string) => void;
  /** Back / Esc: hide the editor; a dirty local document asks and is closed on confirm. */
  requestLeaveEditor: () => void;
  confirmPendingClose: () => void;
  cancelPendingClose: () => void;
  switchTab: (tabId: string) => void;
  hideEditor: () => void; // go back to gallery without closing tabs
  /** Show the hidden editor again on the last active tab (gallery "Return to editor"). */
  showEditor: () => void;
}

// ==================== Close decision (single source of truth) ====================

/** Live dirty state of a tab: its own store when it exists, otherwise the synced flag. */
export function isTabDirty(tab: EditorTab): boolean {
  const store = getStore(tab.id);
  return store ? store.getState().isDirty : tab.isDirty;
}

/** The one rule every close path uses: warn only when the document has unsaved changes. */
export function shouldConfirmClose(tab: EditorTab): boolean {
  return isTabDirty(tab);
}

/**
 * Leaving the editor keeps tabs alive, so nothing is lost and nothing is asked.
 * Exception: a local file has no cloud copy, so leaving it is treated as
 * closing it, under the same rule (ask only when dirty).
 */
export function leaveClosesTab(tab: EditorTab): boolean {
  return isLocalAssetId(tab.asset.id) && shouldConfirmClose(tab);
}

// ==================== Store ====================

export const useEditorTabsStore = create<EditorTabsState & EditorTabsActions>()(
  subscribeWithSelector((set, get) => ({
    tabs: [],
    activeTabId: null,
    isEditorVisible: false,
    pendingClose: null,

    openTabWithLayers: (asset, layers, compositeUrl, width, height, textLayers, options) => {
      if (options?.sourcePath && get().focusTabForPath(options.sourcePath)) return;
      const { tabs } = get();

      const newTabId = crypto.randomUUID();
      const newTab: EditorTab = {
        id: newTabId,
        assetId: asset.id,
        asset,
        isDirty: false,
        createdAt: Date.now(),
        sourcePath: options?.sourcePath,
      };

      // Create a dedicated store for this tab and load the asset with layers
      const store = getOrCreateStore(newTabId);
      store.getState().openEditorWithLayers(asset, layers, compositeUrl, width, height, textLayers);

      // Update active tab in registry
      setActiveTabId(newTabId);

      set({
        tabs: [...tabs, newTab],
        activeTabId: newTabId,
        isEditorVisible: true,
      });
    },

    openTab: (asset, options) => {
      const { tabs, activeTabId } = get();

      // Always show editor when opening a tab
      set({ isEditorVisible: true });

      // Dedup: if this asset (or this local file) is already open, focus it
      const existing = tabs.find(
        (t) => t.assetId === asset.id || isSameLocalPath(t.sourcePath, options?.sourcePath),
      );
      if (existing) {
        if (existing.id !== activeTabId) {
          get().switchTab(existing.id);
        }
        return;
      }

      // Create new tab
      const newTabId = crypto.randomUUID();
      const newTab: EditorTab = {
        id: newTabId,
        assetId: asset.id,
        asset,
        isDirty: false,
        createdAt: Date.now(),
        sourcePath: options?.sourcePath,
      };

      // Create a dedicated store for this tab and load the asset
      const store = getOrCreateStore(newTabId);
      store.getState().openEditor(asset);

      // Update active tab in registry
      setActiveTabId(newTabId);

      set({
        tabs: [...tabs, newTab],
        activeTabId: newTabId,
        isEditorVisible: true,
      });
    },

    closeTab: (tabId) => {
      const { tabs, activeTabId } = get();
      const tabIndex = tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return;

      // Cancel any in-progress processing for this tab
      const closingStore = getStore(tabId);
      if (closingStore) {
        closingStore.setState({
          isProcessing: false,
          processingProgress: 0,
          processingMessage: '',
        });
      }

      const newTabs = tabs.filter((t) => t.id !== tabId);

      if (newTabs.length === 0) {
        // Last tab closed: exit editor
        deleteStore(tabId);
        setActiveTabId(null);
        set({ tabs: [], activeTabId: null, isEditorVisible: false });
        useUIStore.getState().setCurrentPage('images');
        return;
      }

      if (tabId === activeTabId) {
        // Closing the active tab: switch to adjacent
        const newIndex = Math.min(tabIndex, newTabs.length - 1);
        const newActiveTab = newTabs[newIndex];

        // Update registry to point to the new active tab
        setActiveTabId(newActiveTab.id);

        set({ tabs: newTabs, activeTabId: newActiveTab.id });
      } else {
        // Closing a non-active tab: just remove it
        set({ tabs: newTabs });
      }

      // Free the closed tab's store
      deleteStore(tabId);
    },

    focusTabForPath: (sourcePath) => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find((t) => isSameLocalPath(t.sourcePath, sourcePath));
      if (!existing) return false;
      if (existing.id !== activeTabId) get().switchTab(existing.id);
      set({ isEditorVisible: true });
      return true;
    },

    requestCloseTab: (tabId) => {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (!shouldConfirmClose(tab)) {
        get().closeTab(tabId);
        return;
      }
      // Show the document being asked about (and let "Save and Close" save it)
      get().switchTab(tabId);
      set({ pendingClose: { tabId, thenHide: false } });
    },

    requestLeaveEditor: () => {
      const { tabs, activeTabId } = get();
      const tab = tabs.find((t) => t.id === activeTabId);
      if (tab && leaveClosesTab(tab)) {
        set({ pendingClose: { tabId: tab.id, thenHide: true } });
        return;
      }
      get().hideEditor();
    },

    confirmPendingClose: () => {
      const pending = get().pendingClose;
      set({ pendingClose: null });
      if (!pending) return;
      get().closeTab(pending.tabId);
      if (pending.thenHide) get().hideEditor();
    },

    cancelPendingClose: () => {
      set({ pendingClose: null });
    },

    switchTab: (tabId) => {
      const { activeTabId } = get();
      if (tabId === activeTabId) return;

      // Simply point the registry at the new tab — no serialisation needed
      setActiveTabId(tabId);
      set({ activeTabId: tabId });
    },

    hideEditor: () => {
      set({ isEditorVisible: false });
    },

    showEditor: () => {
      const { tabs, activeTabId } = get();
      if (tabs.length === 0) return;
      if (!activeTabId || !tabs.some((t) => t.id === activeTabId)) {
        get().switchTab(tabs[tabs.length - 1].id);
      }
      set({ isEditorVisible: true });
    },
  })),
);

// ==================== Cross-Store Subscriptions ====================

/**
 * Sync isDirty from the active tab's imageEditor store → editorTabs store.
 * Call from a useEffect and return the cleanup function to avoid memory leaks.
 *
 * Because each tab now has its own store, we re-subscribe whenever the active
 * tab changes.
 *
 * INVARIANT: Only the active tab is subscribed. Non-active tab stores must
 * never be mutated externally (e.g. via getStore(otherTabId).setState({isDirty})),
 * otherwise tabs[].isDirty will silently drift out of sync. Callers that need
 * to touch a specific tab should switch to it first.
 */
export function setupEditorTabsSync() {
  let innerUnsub: (() => void) | null = null;

  function subscribeToActiveStore() {
    // Clean up previous subscription
    innerUnsub?.();
    innerUnsub = null;

    const activeStore = getActiveStoreSafe();
    if (!activeStore) return;

    innerUnsub = activeStore.subscribe(
      (state, prev) => {
        if (state.isDirty !== prev.isDirty) {
          const { activeTabId, tabs } = useEditorTabsStore.getState();
          if (!activeTabId) return;

          const activeTab = tabs.find((t) => t.id === activeTabId);
          if (activeTab && activeTab.isDirty !== state.isDirty) {
            useEditorTabsStore.setState({
              tabs: tabs.map((t) =>
                t.id === activeTabId ? { ...t, isDirty: state.isDirty } : t,
              ),
            });
          }
        }
      },
    );
  }

  // Subscribe to active tab changes
  const outerUnsub = useEditorTabsStore.subscribe(
    (state) => state.activeTabId,
    (activeTabId) => {
      if (activeTabId) {
        subscribeToActiveStore();
      } else {
        innerUnsub?.();
        innerUnsub = null;
      }
    },
  );

  // Initial subscription
  subscribeToActiveStore();

  return () => {
    outerUnsub();
    innerUnsub?.();
  };
}

export default useEditorTabsStore;
