/**
 * iris.storage API handler — per-extension persistent key-value storage.
 * Each extension gets isolated storage in its own JSON file.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { app } from 'electron';
import path from 'path';

const storageDir = () => path.join(app.getPath('userData'), 'extensions', '.storage');

function getExtStoragePath(extensionId: string): string {
  const dir = storageDir();
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${extensionId}.json`);
}

function readExtStorage(extensionId: string): Record<string, unknown> {
  const filePath = getExtStoragePath(extensionId);
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // corrupted file
  }
  return {};
}

function writeExtStorage(extensionId: string, data: Record<string, unknown>): void {
  const filePath = getExtStoragePath(extensionId);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function registerStorageApi(
  manager: { registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void }
): void {
  manager.registerApiHandler('iris.storage', 'get', async (extId, args) => {
    const [key] = args as [string];
    const store = readExtStorage(extId);
    return store[key] ?? null;
  });

  manager.registerApiHandler('iris.storage', 'set', async (extId, args) => {
    const [key, value] = args as [string, unknown];
    const store = readExtStorage(extId);
    store[key] = value;
    writeExtStorage(extId, store);
  });

  manager.registerApiHandler('iris.storage', 'delete', async (extId, args) => {
    const [key] = args as [string];
    const store = readExtStorage(extId);
    delete store[key];
    writeExtStorage(extId, store);
  });
}
