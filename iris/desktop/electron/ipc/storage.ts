import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';

interface AppSettings {
  theme?: 'light' | 'dark' | 'system';
  language?: 'en' | 'ko' | 'jp';
  defaultSavePath?: string;
  recentFiles?: string[];
  windowState?: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    isMaximized: boolean;
  };
  [key: string]: unknown;
}

const defaults: AppSettings = {
  theme: 'dark',
  language: 'en',
  recentFiles: [],
};

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readStore(): AppSettings {
  try {
    const data = fs.readFileSync(getStorePath(), 'utf-8');
    return { ...defaults, ...JSON.parse(data) };
  } catch {
    return { ...defaults };
  }
}

function writeStore(data: AppSettings): void {
  const dir = path.dirname(getStorePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8');
}

/** One stored setting, readable from the main process before any window exists. */
export function readSetting(key: string): unknown {
  return readStore()[key] ?? null;
}

interface StorageHandlerOptions {
  /** Called after a key is written (e.g. to follow `app:theme` in the native window). */
  onSet?: (key: string, value: unknown) => void;
}

export function setupStorageHandlers(options: StorageHandlerOptions = {}) {
  ipcMain.handle('storage:get', (_, key: string) => {
    const store = readStore();
    return store[key] ?? null;
  });

  ipcMain.handle('storage:set', (_, key: string, value: unknown) => {
    const store = readStore();
    store[key] = value;
    writeStore(store);
    options.onSet?.(key, value);
  });

  ipcMain.handle('storage:delete', (_, key: string) => {
    const store = readStore();
    delete store[key];
    writeStore(store);
  });

  ipcMain.handle('storage:clear', () => {
    writeStore({ ...defaults });
  });
}
