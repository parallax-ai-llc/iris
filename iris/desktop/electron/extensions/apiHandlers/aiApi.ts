/**
 * iris.ai API handler — proxies AI model execution through the renderer's
 * existing API client (which calls the Parallax server).
 */
import { BrowserWindow } from 'electron';
import { sendToWindow } from './sendToWindow';

export function registerAiApi(
  manager: { registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void },
  getMainWindow: () => BrowserWindow | null
): void {
  manager.registerApiHandler('iris.ai', 'executeModel', async (extId, args) => {
    const [provider, params] = args as [string, Record<string, unknown>];
    const win = getMainWindow();
    if (!win) throw new Error('Main window not available');

    return new Promise((resolve, reject) => {
      const requestId = `ai_${Date.now()}`;
      // Fail fast rather than making the extension wait out the 2 minute
      // timeout for a renderer that no longer exists.
      if (
        !sendToWindow(win, 'extensions:executeAiModel', {
          requestId,
          extensionId: extId,
          provider,
          params,
        })
      ) {
        reject(new Error('Main window not available'));
        return;
      }

      win.webContents.ipc.once(`extensions:aiModelResult:${requestId}`, (_event, data: { result?: unknown; error?: string }) => {
        if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve(data.result);
        }
      });

      setTimeout(() => reject(new Error('AI model execution timeout')), 120000);
    });
  });

  manager.registerApiHandler('iris.ai', 'getAvailableModels', async () => {
    const win = getMainWindow();
    if (!win) return [];

    return new Promise((resolve) => {
      const requestId = `ai_models_${Date.now()}`;
      if (!sendToWindow(win, 'extensions:getAvailableModels', { requestId })) {
        resolve([]);
        return;
      }

      win.webContents.ipc.once(`extensions:availableModelsResult:${requestId}`, (_event, data) => {
        resolve(data);
      });

      setTimeout(() => resolve([]), 5000);
    });
  });
}
