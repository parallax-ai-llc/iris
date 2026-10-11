import { create } from 'zustand';
import type { IrisTool } from '@/config/tools';
import { IS_SELF_HOST } from '@/config/self-host';

type SidebarState = 'expanded' | 'collapsed' | 'hidden';

/** Most entries kept in each of the back / forward stacks (oldest dropped first). */
export const PAGE_HISTORY_LIMIT = 50;

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

interface UIState {
  sidebarState: SidebarState;
  currentPage: string;
  /** Pages before `currentPage`, oldest first (Alt+← / ⌘[ / mouse back). */
  backStack: string[];
  /** Pages left by going back, the next one last (Alt+→ / ⌘] / mouse forward). */
  forwardStack: string[];
  isSettingsOpen: boolean;
  /** Login overlay (cloud mode only). The app is usable without login; this is
   *  opened on demand from the "Sign in" button. */
  isLoginOpen: boolean;
  notifications: Notification[];
  /** Workflow currently open in the (local) iris-editor; null = list view. */
  editingWorkflowId: string | null;
  selectedBatchId: string | null;
  isCreatingBatch: boolean;
  pendingToolMode: IrisTool | null;
}

interface UIActions {
  setSidebarState: (state: SidebarState) => void;
  toggleSidebar: () => void;
  /** Navigate to a page; a change of page is recorded in the history. */
  setCurrentPage: (page: string) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  openSettings: () => void;
  closeSettings: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  setEditingWorkflowId: (id: string | null) => void;
  setSelectedBatchId: (id: string | null) => void;
  setIsCreatingBatch: (creating: boolean) => void;
  setPendingToolMode: (tool: IrisTool | null) => void;
  clearPendingToolMode: () => void;
}

function pushCapped(stack: readonly string[], page: string): string[] {
  const next = [...stack, page];
  return next.length > PAGE_HISTORY_LIMIT ? next.slice(next.length - PAGE_HISTORY_LIMIT) : next;
}

/** A pending tool mode only survives a move to the page it was meant for. */
function pendingToolModeFor(state: UIState, page: string): Partial<Pick<UIState, 'pendingToolMode'>> {
  const pending = state.pendingToolMode;
  if (!pending) return {};
  const expectedPage = pending.category === 'video' ? 'videos' : 'images';
  return page === expectedPage ? {} : { pendingToolMode: null };
}

export const useUIStore = create<UIState & UIActions>((set, get) => ({
  sidebarState: 'expanded',
  // Self-host (open-source) opens on the local Workflows page; cloud opens Home.
  currentPage: IS_SELF_HOST ? 'workflows' : 'home',
  backStack: [],
  forwardStack: [],
  isSettingsOpen: false,
  isLoginOpen: false,
  notifications: [],
  editingWorkflowId: null,
  selectedBatchId: null,
  isCreatingBatch: false,
  pendingToolMode: null,

  setSidebarState: (sidebarState) => set({ sidebarState }),

  toggleSidebar: () => {
    const current = get().sidebarState;
    const next = current === 'expanded' ? 'collapsed' : 'expanded';
    set({ sidebarState: next });
  },

  // Re-selecting the current page is not a navigation: no history entry and
  // the forward stack survives. Any other move starts a new branch.
  setCurrentPage: (currentPage) => {
    const state = get();
    const pending = pendingToolModeFor(state, currentPage);
    if (currentPage === state.currentPage) {
      set(pending);
      return;
    }
    set({
      ...pending,
      currentPage,
      backStack: pushCapped(state.backStack, state.currentPage),
      forwardStack: [],
    });
  },

  goBack: () => {
    const state = get();
    const target = state.backStack[state.backStack.length - 1];
    if (target === undefined) return;
    set({
      ...pendingToolModeFor(state, target),
      currentPage: target,
      backStack: state.backStack.slice(0, -1),
      forwardStack: pushCapped(state.forwardStack, state.currentPage),
    });
  },

  goForward: () => {
    const state = get();
    const target = state.forwardStack[state.forwardStack.length - 1];
    if (target === undefined) return;
    set({
      ...pendingToolModeFor(state, target),
      currentPage: target,
      backStack: pushCapped(state.backStack, state.currentPage),
      forwardStack: state.forwardStack.slice(0, -1),
    });
  },

  canGoBack: () => get().backStack.length > 0,
  canGoForward: () => get().forwardStack.length > 0,

  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  openLogin: () => set({ isLoginOpen: true }),
  closeLogin: () => set({ isLoginOpen: false }),

  addNotification: (notification) => {
    const id = crypto.randomUUID();
    const newNotification = { ...notification, id };
    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    // Auto-remove after duration
    if (notification.duration !== 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, notification.duration ?? 5000);
    }
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => set({ notifications: [] }),

  setEditingWorkflowId: (editingWorkflowId) => set({ editingWorkflowId }),

  setSelectedBatchId: (selectedBatchId) => set({ selectedBatchId }),
  setIsCreatingBatch: (isCreatingBatch) => set({ isCreatingBatch }),

  setPendingToolMode: (pendingToolMode) => set({ pendingToolMode }),
  clearPendingToolMode: () => set({ pendingToolMode: null }),
}));
