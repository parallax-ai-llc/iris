/**
 * iris.window API handler — runs in Main Process.
 * Sends UI notifications/dialogs to the renderer.
 */
import { BrowserWindow } from 'electron';

export function registerWindowApi(
  manager: { registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void },
  getMainWindow: () => BrowserWindow | null
): void {
  manager.registerApiHandler('iris.window', 'showMessage', async (extId, args) => {
    const [message, type] = args as [string, string];
    const win = getMainWindow();
    if (win) {
      win.webContents.send('extensions:showMessage', { extensionId: extId, message, type: type || 'info' });
    }
  });

  manager.registerApiHandler('iris.window', 'showInputBox', async (extId, args) => {
    const [options] = args as [{ prompt: string; value?: string; placeholder?: string }];
    const win = getMainWindow();
    if (!win) return undefined;

    return new Promise<string | undefined>((resolve) => {
      const requestId = `input_${Date.now()}`;
      const handler = (_event: any, data: { requestId: string; value?: string }) => {
        if (data.requestId === requestId) {
          win.webContents.ipc.removeHandler(`extensions:inputBoxResult`);
          resolve(data.value);
        }
      };

      win.webContents.send('extensions:showInputBox', { requestId, extensionId: extId, ...options });

      // Listen for result from renderer
      win.webContents.ipc.once(`extensions:inputBoxResult:${requestId}`, (_event, value) => {
        resolve(value as string | undefined);
      });

      // Timeout after 60 seconds
      setTimeout(() => resolve(undefined), 60000);
    });
  });

  manager.registerApiHandler('iris.window', 'createPanel', async (extId, args) => {
    const [html, options] = args as [string, { title?: string; location?: string } | undefined];
    const win = getMainWindow();
    if (!win) return '';

    const panelId = `${extId}.panel.${Date.now()}`;
    win.webContents.send('extensions:createPanel', {
      panelId,
      extensionId: extId,
      html,
      title: options?.title || extId,
      location: options?.location || 'sidebar',
    });
    return panelId;
  });

  manager.registerApiHandler('iris.window', 'setStatusBarItem', async (extId, args) => {
    const [text, options] = args as [string, { tooltip?: string; priority?: number } | undefined];
    const win = getMainWindow();
    if (win) {
      win.webContents.send('extensions:statusBarUpdate', {
        extensionId: extId,
        text,
        tooltip: options?.tooltip,
        priority: options?.priority,
      });
    }
  });
}
