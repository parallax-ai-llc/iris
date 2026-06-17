/**
 * useToast hook — emits notifications via the UI store.
 *
 * Split from `Toast.tsx` so the component file only exports React components
 * (required by `react-refresh/only-export-components`).
 */

import { useUIStore } from '@/shared/stores/ui.store';

export function useToast() {
  const addNotification = useUIStore((state) => state.addNotification);

  return {
    success: (title: string, message?: string, duration?: number) =>
      addNotification({ type: 'success', title, message, duration }),
    error: (title: string, message?: string, duration?: number) =>
      addNotification({ type: 'error', title, message, duration }),
    warning: (title: string, message?: string, duration?: number) =>
      addNotification({ type: 'warning', title, message, duration }),
    info: (title: string, message?: string, duration?: number) =>
      addNotification({ type: 'info', title, message, duration }),
  };
}
