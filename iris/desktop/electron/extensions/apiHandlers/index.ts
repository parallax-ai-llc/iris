/**
 * Register all iris.* API handlers with the ExtensionManager.
 */
import { BrowserWindow } from 'electron';
import type { ExtensionManager } from '../extensionManager';
import { registerCommandsApi } from './commandsApi';
import { registerToolsApi } from './toolsApi';
import { registerWorkflowApi } from './workflowApi';
import { registerWindowApi } from './windowApi';
import { registerStorageApi } from './storageApi';
import { registerImageApi } from './imageApi';
import { registerAiApi } from './aiApi';
import { registerNetworkApi } from './networkApi';
import { registerFilesApi } from './filesApi';
import { registerExportApi } from './exportApi';

export function registerAllApiHandlers(
  manager: ExtensionManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // Core APIs
  registerCommandsApi(manager);
  registerToolsApi(manager);
  registerWorkflowApi(manager);
  registerWindowApi(manager, getMainWindow);
  registerStorageApi(manager);

  // Domain APIs
  registerImageApi(manager, getMainWindow);
  registerAiApi(manager, getMainWindow);
  registerNetworkApi(manager);
  registerFilesApi(manager);
  registerExportApi(manager, getMainWindow);

  // Env API (read-only, no permission required)
  manager.registerApiHandler('iris.env', 'appVersion', async () => {
    const { app } = await import('electron');
    return app.getVersion();
  });

  manager.registerApiHandler('iris.env', 'platform', async () => {
    return process.platform;
  });

  manager.registerApiHandler('iris.env', 'language', async () => {
    const { app } = await import('electron');
    return app.getLocale();
  });
}
