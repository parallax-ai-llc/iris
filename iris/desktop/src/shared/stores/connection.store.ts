import { create } from 'zustand';

interface ConnectionState {
  isServerConnected: boolean;
  lastCheckedAt: number | null;
  consecutiveFailures: number;
  appVersion: string;
}

interface ConnectionActions {
  setConnected: (connected: boolean) => void;
  incrementFailures: () => void;
  resetFailures: () => void;
  setAppVersion: (version: string) => void;
}

export const useConnectionStore = create<ConnectionState & ConnectionActions>((set) => ({
  isServerConnected: true,
  lastCheckedAt: null,
  consecutiveFailures: 0,
  appVersion: '',

  setConnected: (connected) =>
    set({ isServerConnected: connected, lastCheckedAt: Date.now() }),

  incrementFailures: () =>
    set((state) => ({ consecutiveFailures: state.consecutiveFailures + 1 })),

  resetFailures: () => set({ consecutiveFailures: 0 }),

  setAppVersion: (appVersion) => set({ appVersion }),
}));
