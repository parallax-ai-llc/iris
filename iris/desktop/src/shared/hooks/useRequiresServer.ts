import { useConnectionStore } from '@/shared/stores/connection.store';

export function useRequiresServer() {
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  return { isServerConnected, isDisabled: !isServerConnected };
}
