import { useEffect, useRef } from 'react';
import { useConnectionStore } from '@/shared/stores/connection.store';
import { IS_SELF_HOST } from '@/config/self-host';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';

function getPollingInterval(failures: number): number {
  if (failures <= 2) return 15_000;
  if (failures <= 9) return 30_000;
  return 60_000;
}

export function useServerConnection() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const store = useConnectionStore.getState;

    // Load app version
    if (window.electronAPI?.app?.getVersion) {
      window.electronAPI.app
        .getVersion()
        .then((version: string) => {
          if (mountedRef.current) {
            useConnectionStore.getState().setAppVersion(version);
          }
        })
        .catch(() => {});
    }

    // Self-host (open-source) mode has no cloud server to poll. The local engine
    // is the "server"; mark connected and skip cloud /health polling entirely.
    if (IS_SELF_HOST) {
      store().setConnected(true);
      store().resetFailures();
      return;
    }

    async function checkHealth() {
      if (!mountedRef.current) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (mountedRef.current) {
          if (response.ok) {
            store().setConnected(true);
            store().resetFailures();
          } else {
            store().setConnected(false);
            store().incrementFailures();
          }
        }
      } catch {
        clearTimeout(timeoutId);
        if (mountedRef.current) {
          store().setConnected(false);
          store().incrementFailures();
        }
      }

      scheduleNext();
    }

    function scheduleNext() {
      if (!mountedRef.current) return;
      const failures = store().consecutiveFailures;
      const interval = getPollingInterval(failures);
      timeoutRef.current = setTimeout(checkHealth, interval);
    }

    function handleOnline() {
      checkHealth();
    }

    function handleOffline() {
      store().setConnected(false);
      store().incrementFailures();
    }

    // Initial check
    checkHealth();

    // Browser online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
}
