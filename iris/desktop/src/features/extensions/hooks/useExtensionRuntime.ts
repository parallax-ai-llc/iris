/**
 * useExtensionRuntime — connects the renderer to extension IPC events.
 * Initializes listeners for contribution changes, status updates, and permission requests.
 */
import { useEffect, useState, useCallback } from 'react';
import { useExtensionRuntimeStore } from '@/features/extensions/stores/extensionRuntime.store';
import { registerShortcut } from '@/shared/hooks/useKeyboardShortcuts';
import { toast } from '@/shared/lib/toast';
import i18n from '@/shared/lib/i18n';
import type {
  ExtensionManifestSummary,
  ExtensionContributionMessage,
  ExtensionContributionSnapshot,
} from '@/types/electron';

interface PermissionRequest {
  extensionId: string;
  manifest: ExtensionManifestSummary;
  requiredPermissions: string[];
}

/**
 * Validate the snapshot coming over IPC. Entries are already in the live
 * `contributionChanged` message shape, so no transformation is needed — this
 * only drops malformed entries so one bad record cannot break hydration.
 */
function validContributionMessages(
  snapshot: ExtensionContributionSnapshot | undefined
): ExtensionContributionMessage[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.filter(
    (msg): msg is ExtensionContributionMessage =>
      !!msg &&
      typeof msg === 'object' &&
      typeof msg.extensionId === 'string' &&
      !!msg.payload &&
      typeof msg.payload.contributionType === 'string'
  );
}

/** Stable key for de-duplicating a contribution across hydration and events. */
function contributionKey(type: string, data: unknown): string | null {
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? `${type}:${id}` : null;
}

export function useExtensionRuntime() {
  const handleContributionMessage = useExtensionRuntimeStore((s) => s.handleContributionMessage);
  const setExtensionStatus = useExtensionRuntimeStore((s) => s.setExtensionStatus);
  const clearExtensionContributions = useExtensionRuntimeStore((s) => s.clearExtensionContributions);
  const removeExtension = useExtensionRuntimeStore((s) => s.removeExtension);
  const syncManifestContributions = useExtensionRuntimeStore((s) => s.syncManifestContributions);
  const registeredKeybindings = useExtensionRuntimeStore((s) => s.registeredKeybindings);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.extensions;
    if (!api) return;

    // Remove any previously registered listeners before adding new ones
    api.removeAllListeners();

    // Contributions unregistered while the hydration request is in flight.
    // Without this, a stale snapshot could resurrect an item that was just
    // removed. Live events always win over the snapshot.
    let isHydrating = true;
    const unregisteredDuringHydration = new Set<string>();

    // Listen for contribution changes from extensions
    api.onContributionChanged((msg: {
      extensionId: string;
      payload: { action: 'register' | 'unregister'; contributionType: string; data: unknown };
    }) => {
      if (isHydrating && msg.payload?.action === 'unregister') {
        const key = contributionKey(msg.payload.contributionType, msg.payload.data);
        if (key) unregisteredDuringHydration.add(key);
      }
      handleContributionMessage(msg);
    });

    // Listen for status changes
    api.onStatusChanged((data) => {
      if (data.info) {
        if (data.info.status === 'active') {
          setExtensionStatus(data.extensionId, 'active');
          // keybindings/menus are manifest-declared only (no runtime
          // contribution message exists for them) — sync them on activation.
          syncManifestContributions(data.extensionId, data.info.manifest?.contributes);
        } else if (data.info.status === 'activating') {
          setExtensionStatus(data.extensionId, 'activating');
        } else if (data.info.status === 'error') {
          setExtensionStatus(data.extensionId, 'error', data.info.error);
        } else {
          // Extension deactivated, disabled, or uninstalled
          clearExtensionContributions(data.extensionId);
          removeExtension(data.extensionId);
        }
      } else {
        // info === null → extension record removed entirely
        clearExtensionContributions(data.extensionId);
        removeExtension(data.extensionId);
      }
    });

    // Listen for permission requests
    api.onPermissionRequired((data) => {
      setPendingPermission(data);
    });

    // Unsupported contribution points (e.g. workflowNodes in v1) are
    // installed but ignored — surface the warning to the user.
    api.onContributionIgnored((data) => {
      toast.warning(
        i18n.t('extensions:runtime.contributionIgnored', {
          id: data.extensionId,
          reason: data.reason,
        })
      );
    });

    // Extension host failed to start — nothing extension-related will work.
    api.onHostError((data) => {
      toast.error(i18n.t('extensions:runtime.hostError', { error: data.error }));
    });

    // ── Hydrate contributions registered before this mount ──
    // Extensions with `onStartup` activate during ExtensionManager.initialize(),
    // which runs before the window contents load, so their contributionChanged
    // events are sent to a renderer that is not listening yet and are lost
    // forever. Pull the current snapshot once, after the listeners are attached
    // (so nothing that arrives meanwhile is missed).
    let isCancelled = false;
    void (async () => {
      try {
        // Tolerate an older main process without the handler — invoke on an
        // unregistered channel rejects, and hydration is a best-effort repair.
        const snapshot = await api.getContributions?.();
        if (isCancelled) return;
        for (const msg of validContributionMessages(snapshot)) {
          const key = contributionKey(msg.payload.contributionType, msg.payload.data);
          if (key && unregisteredDuringHydration.has(key)) continue;
          // Snapshot entries are replayable contributionChanged messages —
          // pass them straight through. Registration is keyed by id, so
          // replaying an item the live stream already delivered overwrites
          // rather than duplicates.
          handleContributionMessage({
            extensionId: msg.extensionId,
            payload: {
              action: 'register',
              contributionType: msg.payload.contributionType,
              data: msg.payload.data,
            },
          });
        }
      } catch {
        // Snapshot unavailable — live events still work for this session.
      } finally {
        isHydrating = false;
        unregisteredDuringHydration.clear();
      }
    })();

    return () => {
      isCancelled = true;
      isHydrating = false;
      api.removeAllListeners();
    };
  }, [
    handleContributionMessage,
    setExtensionStatus,
    clearExtensionContributions,
    removeExtension,
    syncManifestContributions,
  ]);

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
