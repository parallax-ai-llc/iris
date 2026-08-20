/**
 * iris.window API handler — runs in Main Process.
 * Sends UI notifications/dialogs to the renderer.
 */
import { BrowserWindow } from 'electron';
import type { ExtHostContribution } from '../ipcProtocol';
import { sendToWindow } from './sendToWindow';

interface WindowApiManager {
  registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void;
  /** Optional so tests can pass a bare stub. */
  recordContribution?: (msg: ExtHostContribution) => void;
}

export function registerWindowApi(
  manager: WindowApiManager,
  getMainWindow: () => BrowserWindow | null
): void {
  manager.registerApiHandler('iris.window', 'showMessage', async (extId, args) => {
    const [message, type] = args as [string, string];
    const win = getMainWindow();
    sendToWindow(win, 'extensions:showMessage', { extensionId: extId, message, type: type || 'info' });
  });

  manager.registerApiHandler('iris.window', 'showInputBox', async (extId, args) => {
    const [options] = args as [{ prompt: string; value?: string; placeholder?: string }];
    const win = getMainWindow();
    if (!win) return undefined;

    return new Promise<string | undefined>((resolve) => {
      const requestId = `input_${Date.now()}`;
      if (!sendToWindow(win, 'extensions:showInputBox', { requestId, extensionId: extId, ...options })) {
        resolve(undefined);
        return;
      }

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
    const title = options?.title || extId;
    const location = options?.location || 'sidebar';
    if (!sendToWindow(win, 'extensions:createPanel', {
      panelId,
      extensionId: extId,
      html,
      title,
      location,
    })) {
      return '';
    }
    // Panels are created through this api-call rather than a contribution
    // message, so record them explicitly — otherwise a renderer reload loses
    // every panel an extension opened.
    manager.recordContribution?.({
      type: 'contribution',
      extensionId: extId,
      payload: {
        action: 'register',
        contributionType: 'panel',
        data: { id: panelId, title, location, html },
      },
    });
    return panelId;
  });

  // NOTE: there is deliberately no 'setStatusBarItem' handler here.
  // iris.window.setStatusBarItem never produces an api-call — the worker
  // (extensionHostWorker.ts) emits a 'statusBarItem' contribution message and
  // returns a Disposable synchronously, so a main-process handler would be
  // unreachable. Status bar items reach the renderer over the contribution
  // path (and re-hydrate through 'extensions:getContributions').
}
