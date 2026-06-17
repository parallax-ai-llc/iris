/**
 * iris.fs API handler — sandboxed filesystem access for extensions.
 * Extensions can only access files within their own install directory.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { ExtensionManager } from '../extensionManager';

type ManagerLike = Pick<ExtensionManager, 'registerApiHandler' | 'getExtensionStatus'>;

/** Resolve and validate that the path is within the extension's install directory. */
function resolveSandboxedPath(filePath: string, installPath: string): string {
  const resolved = path.resolve(installPath, filePath);
  const normalizedInstall = path.resolve(installPath);

  if (!resolved.startsWith(normalizedInstall + path.sep) && resolved !== normalizedInstall) {
    throw new Error(`Access denied: path "${filePath}" is outside the extension directory`);
  }

  return resolved;
}

function getInstallPath(manager: ManagerLike, extId: string): string {
  const status = manager.getExtensionStatus(extId);
  if (!status) throw new Error(`Extension "${extId}" not found`);
  return status.installPath;
}

export function registerFilesApi(manager: ManagerLike): void {
  manager.registerApiHandler('iris.fs', 'readFile', async (extId, args) => {
    const [filePath] = args as [string];
    const installPath = getInstallPath(manager, extId);
    const resolved = resolveSandboxedPath(filePath, installPath);
    const buffer = await fs.readFile(resolved);
    return new Uint8Array(buffer);
  });

  manager.registerApiHandler('iris.fs', 'writeFile', async (extId, args) => {
    const [filePath, data] = args as [string, Uint8Array];
    const installPath = getInstallPath(manager, extId);
    const resolved = resolveSandboxedPath(filePath, installPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, Buffer.from(data));
  });

  manager.registerApiHandler('iris.fs', 'listDirectory', async (extId, args) => {
    const [dirPath] = args as [string];
    const installPath = getInstallPath(manager, extId);
    const resolved = resolveSandboxedPath(dirPath, installPath);

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(resolved, entry.name);
        let size = 0;
        let modifiedAt = '';
        try {
          const stat = await fs.stat(entryPath);
          size = stat.size;
          modifiedAt = stat.mtime.toISOString();
        } catch {
          // skip stat errors
        }
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size,
          modifiedAt,
        };
      })
    );

    return results;
  });

  manager.registerApiHandler('iris.fs', 'rename', async (extId, args) => {
    const [oldPath, newPath] = args as [string, string];
    const installPath = getInstallPath(manager, extId);
    const resolvedOld = resolveSandboxedPath(oldPath, installPath);
    const resolvedNew = resolveSandboxedPath(newPath, installPath);
    await fs.rename(resolvedOld, resolvedNew);
  });

  manager.registerApiHandler('iris.fs', 'stat', async (extId, args) => {
    const [filePath] = args as [string];
    const installPath = getInstallPath(manager, extId);
    const resolved = resolveSandboxedPath(filePath, installPath);
    const stat = await fs.stat(resolved);
    return {
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
    };
  });
}
