/**
 * iris.export API handler — read and configure export settings.
 * All methods delegate to the renderer via IPC (same pattern as imageApi).
 * Does NOT trigger actual export — only reads/modifies settings.
 */
import { BrowserWindow } from 'electron';

export function registerExportApi(
  manager: { registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void },
  getMainWindow: () => BrowserWindow | null
): void {
  manager.registerApiHandler('iris.export', 'getPresets', async () => {
    const win = getMainWindow();
    if (!win) return [];

    return new Promise((resolve) => {
      const requestId = `exp_presets_${Date.now()}`;
      win.webContents.send('extensions:getExportPresets', { requestId });

      win.webContents.ipc.once(`extensions:exportPresetsResult:${requestId}`, (_event, data) => {
        resolve(data);
      });

      setTimeout(() => resolve([]), 10000);
    });
  });

  manager.registerApiHandler('iris.export', 'applyPreset', async (_extId, args) => {
    const [presetId] = args as [string];
    const win = getMainWindow();
    if (!win) return;

    return new Promise<void>((resolve) => {
      const requestId = `exp_apply_${Date.now()}`;
      win.webContents.send('extensions:applyExportPreset', { requestId, presetId });

      win.webContents.ipc.once(`extensions:applyExportPresetResult:${requestId}`, () => {
        resolve();
      });

      setTimeout(() => resolve(), 10000);
    });
  });

  manager.registerApiHandler('iris.export', 'getSettings', async () => {
    const win = getMainWindow();
    if (!win) return null;

    return new Promise((resolve) => {
      const requestId = `exp_settings_${Date.now()}`;
      win.webContents.send('extensions:getExportSettings', { requestId });

      win.webContents.ipc.once(`extensions:exportSettingsResult:${requestId}`, (_event, data) => {
        resolve(data);
      });

      setTimeout(() => resolve(null), 10000);
    });
  });

  manager.registerApiHandler('iris.export', 'updateSettings', async (_extId, args) => {
    const [settings] = args as [Record<string, unknown>];
    const win = getMainWindow();
    if (!win) return;

    return new Promise<void>((resolve) => {
      const requestId = `exp_update_${Date.now()}`;
      win.webContents.send('extensions:updateExportSettings', { requestId, settings });

      win.webContents.ipc.once(`extensions:updateExportSettingsResult:${requestId}`, () => {
        resolve();
      });

      setTimeout(() => resolve(), 10000);
    });
  });
}
