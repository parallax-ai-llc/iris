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

  // Install from a local directory (for development) or extracted bundle
  ipcMain.handle('extensions:install', async (_event, sourceDir: string, trustTier?: string) => {
    const tier: TrustTier = isValidTrustTier(trustTier) ? trustTier : 'community';
    return extensionManager.installFromDirectory(sourceDir, tier);
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
