/**
 * Bug Report IPC Handler
 * Captures the current window screenshot for bug reports
 */

import { ipcMain, BrowserWindow } from 'electron';

export function setupBugReportHandlers() {
  ipcMain.handle('bugReport:captureScreen', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error('No window found');
    }

    const image = await win.webContents.capturePage();
    const pngBuffer = image.toPNG();
    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
  });
}
