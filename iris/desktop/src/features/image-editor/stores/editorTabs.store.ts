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
import { deleteChatStore } from '@/features/image-editor/stores/editorChat.store';

// ==================== Types ====================

export interface EditorTab {
  id: string;
  assetId: string;
  asset: IrisAsset;
  isDirty: boolean;
  createdAt: number;
}

interface EditorTabsState {
  tabs: EditorTab[];
  activeTabId: string | null;
  isEditorVisible: boolean; // false = user navigated back to gallery, tabs stay alive
}

interface EditorTabsActions {
  openTab: (asset: IrisAsset) => void;
  openTabWithLayers: (
    asset: IrisAsset,
    layers: Layer[],
    compositeUrl: string,
    width: number,
    height: number,
    textLayers?: TextLayer[],
  ) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  hideEditor: () => void; // go back to gallery without closing tabs
}

// ==================== Store ====================

export const useEditorTabsStore = create<EditorTabsState & EditorTabsActions>()(
  subscribeWithSelector((set, get) => ({
    tabs: [],
    activeTabId: null,
    isEditorVisible: false,

    openTabWithLayers: (asset, layers, compositeUrl, width, height, textLayers) => {
      const { tabs } = get();

      const newTabId = crypto.randomUUID();
      const newTab: EditorTab = {
        id: newTabId,
        assetId: asset.id,
        asset,
        isDirty: false,
        createdAt: Date.now(),
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

    openTab: (asset) => {
      const { tabs, activeTabId } = get();

      // Always show editor when opening a tab
      set({ isEditorVisible: true });

      // Dedup: if this asset is already open, focus it
      const existing = tabs.find((t) => t.assetId === asset.id);
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
        deleteChatStore(tabId);
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
      deleteChatStore(tabId);
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
