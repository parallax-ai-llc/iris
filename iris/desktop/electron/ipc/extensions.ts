/**
 * IPC handlers for extensions — bridges Renderer ↔ Main Process.
 */
import { ipcMain, BrowserWindow } from 'electron';
import type { ExtensionManager } from '../extensions/extensionManager';
import type { Permission, TrustTier } from '../extensions/ipcProtocol';

const VALID_TRUST_TIERS: readonly TrustTier[] = ['official', 'verified', 'community'] as const;

function isValidTrustTier(value: unknown): value is TrustTier {
  return typeof value === 'string' && (VALID_TRUST_TIERS as readonly string[]).includes(value);
}

export function setupExtensionHandlers(extensionManager: ExtensionManager) {
  // Get all installed extensions with their runtime info
  ipcMain.handle('extensions:getInstalled', () => {
    return extensionManager.getInstalledExtensions();
  });

  // Install from a local directory (developer flow: the output of
  // `iris-ext create` + build). opts.upgrade replaces an already-installed
  // extension with the same id (deactivate → replace → re-activate); without
  // it, duplicates are rejected. Local code was never reviewed, so it is always
  // installed as 'community' — the renderer cannot ask for a tier that
  // auto-grants high-risk permissions.
  ipcMain.handle('extensions:install', async (_event, sourceDir: string, _trustTier?: string, opts?: { upgrade?: boolean }) => {
    return extensionManager.installFromDirectory(sourceDir, 'community', { upgrade: opts?.upgrade === true });
  });

  // Install from a .iex bundle (ZIP) — `source` is an official marketplace URL
  // whose bytes must match `opts.sha256` (issued by the server), or a local file
  // (installed as 'community'). Verified, extracted to a temp dir, then installed.
  ipcMain.handle('extensions:installFromIex', async (_event, source: string, trustTier?: string, opts?: { upgrade?: boolean; sha256?: string }) => {
    const tier: TrustTier = isValidTrustTier(trustTier) ? trustTier : 'community';
    return extensionManager.installFromIex(source, tier, {
      upgrade: opts?.upgrade === true,
      sha256: typeof opts?.sha256 === 'string' ? opts.sha256 : undefined,
    });
  });

  // Uninstall an extension
  ipcMain.handle('extensions:uninstall', async (_event, extensionId: string) => {
    return extensionManager.uninstallExtension(extensionId);
  });

  // Enable a disabled extension
  ipcMain.handle('extensions:enable', async (_event, extensionId: string) => {
    return extensionManager.enableExtension(extensionId);
  });

  // Disable an active extension
  ipcMain.handle('extensions:disable', async (_event, extensionId: string) => {
    return extensionManager.disableExtension(extensionId);
  });

  // Snapshot of runtime contributions currently registered by active
  // extensions. onStartup activation runs before the renderer attaches its
  // 'extensions:contributionChanged' listener, so the renderer pulls this once
  // on mount to re-hydrate (status bar items, panels, commands, tools).
  ipcMain.handle('extensions:getContributions', () => {
    return extensionManager.getContributions();
  });

  // Forget a panel the user closed, so the contribution snapshot does not
  // resurrect it on the next renderer reload.
  ipcMain.handle('extensions:dismissPanel', (_event, panelId: string) => {
    return extensionManager.dismissPanel(panelId);
  });

  // Get status of a specific extension
  ipcMain.handle('extensions:getStatus', (_event, extensionId: string) => {
    return extensionManager.getExtensionStatus(extensionId);
  });

  // Grant permissions after user approval
  ipcMain.handle('extensions:grantPermissions', (_event, extensionId: string, permissions: Permission[]) => {
    return extensionManager.grantPermissions(extensionId, permissions);
  });

  // Execute a command registered by an extension
  ipcMain.handle('extensions:executeCommand', async (_event, commandId: string, args?: unknown[]) => {
    try {
      const result = await extensionManager.executeCommand(commandId, args);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Execute a tool registered by an extension
  ipcMain.handle('extensions:executeTool', async (_event, toolId: string, params: unknown) => {
    try {
      const result = await extensionManager.executeTool(toolId, params);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
