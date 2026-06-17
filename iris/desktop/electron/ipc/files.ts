import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';

export function getDefaultSavePath(): string {
  // On first launch after installation, read the path chosen during setup
  const configFile = path.join(app.getPath('userData'), '.installer-config');
  try {
    if (existsSync(configFile)) {
      const savedPath = readFileSync(configFile, 'utf8').trim();
      unlinkSync(configFile);
      if (savedPath) return savedPath;
    }
  } catch {}
  return path.join(app.getPath('documents'), 'Iris Desktop');
}

/**
 * 기본 경로 검증 — null byte, 빈 문자열 차단
 * selectFile/saveFile 다이얼로그를 통해 사용자가 직접 선택한 경로이므로
 * 디렉토리 제한 없이 기본 검증만 수행
 */
function sanitizePath(filePath: string): string {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('Invalid file path');
  }
  if (/[\x00-\x1f]/.test(filePath)) {
    throw new Error('Path contains forbidden characters');
  }
  return path.resolve(filePath);
}

export function setupFileHandlers() {
  ipcMain.handle('files:getDefaultSavePath', () => {
    return getDefaultSavePath();
  });

  ipcMain.handle('files:selectFile', async (event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: options?.filters ?? [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('files:selectFiles', async (event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters ?? [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('files:selectDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('files:saveFile', async (event, options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: options?.defaultPath,
      filters: options?.filters ?? [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] },
        { name: 'Videos', extensions: ['mp4', 'webm'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('files:readFile', async (_, filePath: string) => {
    const safePath = sanitizePath(filePath);
    const buffer = await fs.readFile(safePath);
    return buffer.buffer;
  });

  ipcMain.handle('files:writeFile', async (_, filePath: string, data: ArrayBuffer) => {
    try {
      const safePath = sanitizePath(filePath);
      const dir = path.dirname(safePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(safePath, Buffer.from(data));
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write file';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('files:openPath', async (_, filePath: string) => {
    const safePath = sanitizePath(filePath);
    await shell.openPath(safePath);
  });

  ipcMain.handle('files:showInFolder', async (_, filePath: string) => {
    const safePath = sanitizePath(filePath);
    shell.showItemInFolder(safePath);
  });
}
