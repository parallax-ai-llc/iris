/**
 * useExtensionRuntime — connects the renderer to extension IPC events.
 * Initializes listeners for contribution changes, status updates, and permission requests.
 */
import { useEffect, useState, useCallback } from 'react';
import { useExtensionRuntimeStore } from '@/features/extensions/stores/extensionRuntime.store';
import { registerShortcut } from '@/shared/hooks/useKeyboardShortcuts';

interface PermissionRequest {
  extensionId: string;
  manifest: { displayName?: string; name: string; publisher: string };
  requiredPermissions: string[];
}

export function useExtensionRuntime() {
  const handleContributionMessage = useExtensionRuntimeStore((s) => s.handleContributionMessage);
  const setExtensionStatus = useExtensionRuntimeStore((s) => s.setExtensionStatus);
  const clearExtensionContributions = useExtensionRuntimeStore((s) => s.clearExtensionContributions);
  const registeredKeybindings = useExtensionRuntimeStore((s) => s.registeredKeybindings);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.extensions;
    if (!api) return;

    // Remove any previously registered listeners before adding new ones
    api.removeAllListeners();

    // Listen for contribution changes from extensions
    api.onContributionChanged((msg: {
      extensionId: string;
      payload: { action: 'register' | 'unregister'; contributionType: string; data: unknown };
    }) => {
      handleContributionMessage(msg);
    });

    // Listen for status changes
    api.onStatusChanged((data: { extensionId: string; info: { status: string; error?: string } | null }) => {
      if (data.info) {
        if (data.info.status === 'active') {
          setExtensionStatus(data.extensionId, 'active');
        } else if (data.info.status === 'activating') {
          setExtensionStatus(data.extensionId, 'activating');
        } else if (data.info.status === 'error') {
          setExtensionStatus(data.extensionId, 'error', data.info.error);
        } else {
          // Extension deactivated or uninstalled
          clearExtensionContributions(data.extensionId);
        }
      }
    });

    // Listen for permission requests
    api.onPermissionRequired((data) => {
      setPendingPermission(data);
    });

    return () => {
      api.removeAllListeners();
    };
  }, [handleContributionMessage, setExtensionStatus, clearExtensionContributions]);

  // Register dynamic keybindings from extensions
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    for (const kb of registeredKeybindings) {
      const parts = kb.key.toLowerCase().split('+');
      const key = parts[parts.length - 1];
      const ctrl = parts.includes('ctrl') || parts.includes('cmd');
      const shift = parts.includes('shift');
      const alt = parts.includes('alt');

      const cleanup = registerShortcut({
        key,
        ctrl,
        shift,
        alt,
        description: `Extension: ${kb.command}`,
        handler: () => {
          window.electronAPI?.extensions?.executeCommand(kb.command);
        },
      });

      cleanups.push(cleanup);
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [registeredKeybindings]);

  const approvePermissions = useCallback(async (permissions: string[]) => {
    if (!pendingPermission) return;
    await window.electronAPI?.extensions?.grantPermissions(
      pendingPermission.extensionId,
      permissions
    );
    setPendingPermission(null);
  }, [pendingPermission]);

  const denyPermissions = useCallback(() => {
    setPendingPermission(null);
  }, []);

  return {
    pendingPermission,
    approvePermissions,
    denyPermissions,
  };
}
