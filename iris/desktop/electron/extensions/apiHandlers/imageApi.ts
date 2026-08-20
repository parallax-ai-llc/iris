/**
 * iris.image API handler — provides access to the canvas image data.
 * Communicates with the renderer to get/put image data.
 */
import { BrowserWindow } from 'electron';
import { sendToWindow } from './sendToWindow';

export function registerImageApi(
  manager: { registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void },
  getMainWindow: () => BrowserWindow | null
): void {
  manager.registerApiHandler('iris.image', 'getActive', async () => {
    const win = getMainWindow();
    if (!win) return null;

    return new Promise((resolve) => {
      const requestId = `img_get_${Date.now()}`;
      // Bail out instead of registering a listener on a dead webContents —
      // that would hang the extension until the timeout below.
      if (!sendToWindow(win, 'extensions:getActiveImage', { requestId })) {
        resolve(null);
        return;
      }

      win.webContents.ipc.once(`extensions:activeImageResult:${requestId}`, (_event, data) => {
        resolve(data);
      });

      setTimeout(() => resolve(null), 10000);
    });
  });

  manager.registerApiHandler('iris.image', 'putImage', async (_extId, args) => {
    const [imageData] = args;
    const win = getMainWindow();
    if (!win) return;

    sendToWindow(win, 'extensions:putImage', { imageData });
  });

  manager.registerApiHandler('iris.image', 'getSelection', async () => {
    const win = getMainWindow();
    if (!win) return null;

    return new Promise((resolve) => {
      const requestId = `img_sel_${Date.now()}`;
      if (!sendToWindow(win, 'extensions:getSelection', { requestId })) {
        resolve(null);
        return;
      }

      win.webContents.ipc.once(`extensions:selectionResult:${requestId}`, (_event, data) => {
        resolve(data);
      });

      setTimeout(() => resolve(null), 5000);
    });
  });

  manager.registerApiHandler('iris.image', 'getActiveFileInfo', async () => {
    const win = getMainWindow();
    if (!win) return null;

    return new Promise((resolve) => {
      const requestId = `img_info_${Date.now()}`;
      if (!sendToWindow(win, 'extensions:getActiveFileInfo', { requestId })) {
        resolve(null);
        return;
      }

      win.webContents.ipc.once(`extensions:activeFileInfoResult:${requestId}`, (_event, data) => {
        resolve(data);
      });

      setTimeout(() => resolve(null), 10000);
    });
  });
}
