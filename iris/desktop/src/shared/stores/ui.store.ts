import { create } from 'zustand';
import type { IrisTool } from '@/config/tools';
import { IS_SELF_HOST } from '@/config/self-host';

type SidebarState = 'expanded' | 'collapsed' | 'hidden';

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
  setCurrentPage: (page: string) => void;
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

export const useUIStore = create<UIState & UIActions>((set, get) => ({
  sidebarState: 'expanded',
  // Self-host (open-source) opens on the local Workflows page; cloud opens Home.
  currentPage: IS_SELF_HOST ? 'workflows' : 'home',
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

  setCurrentPage: (currentPage) => {
    const pending = get().pendingToolMode;
    if (pending) {
      const expectedPage = pending.category === 'video' ? 'videos' : 'images';
      if (currentPage !== expectedPage) {
        set({ currentPage, pendingToolMode: null });
        return;
      }
    }
    set({ currentPage });
  },

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
