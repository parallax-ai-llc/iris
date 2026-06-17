import { useUIStore } from '@/shared/stores/ui.store';

const addNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
  useUIStore.getState().addNotification({
    type,
    title: message,
  });
};

export const toast = {
  success: (message: string) => addNotification('success', message),
  error: (message: string) => addNotification('error', message),
  warning: (message: string) => addNotification('warning', message),
  info: (message: string) => addNotification('info', message),
};
