/**
 * Asset Storage IPC handlers
 * Downloads server assets to persistent local storage (userData/assets/).
 * Files persist across sessions — re-opening a project skips already-downloaded assets.
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import { existsSync, createWriteStream } from 'fs';
import { mkdir, rename, unlink } from 'fs/promises';
import https from 'https';
import http from 'http';

const ASSETS_DIR = 'assets';

function getAssetsDir(): string {
  return path.join(app.getPath('userData'), ASSETS_DIR);
}

function getAssetPath(assetId: string, ext: string): string {
  return path.join(getAssetsDir(), `asset_${assetId}${ext}`);
}

/** Download a URL to a local file with auth header. Follows redirects. */
function downloadFile(
  url: string,
  destPath: string,
  authToken: string,
  redirectCount = 0
): Promise<void> {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const headers: Record<string, string> = { Authorization: `Bearer ${authToken}` };

    protocol.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath, authToken, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} downloading asset`));
        return;
      }
      const file = createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { file.close(); reject(err); });
      res.on('error', (err) => { file.close(); reject(err); });
    }).on('error', reject);
  });
}

export function setupAssetStorageHandlers(): void {
  // Download a server asset to persistent local storage
  ipcMain.handle(
    'asset:download',
    async (_, request: {
      assetId: string;
      downloadUrl: string;
      authToken: string;
      ext?: string;
    }): Promise<{ success: boolean; localPath?: string; error?: string; alreadyExists?: boolean }> => {
      const { assetId, downloadUrl, authToken, ext = '.mp4' } = request;
      const assetsDir = getAssetsDir();
      const finalPath = getAssetPath(assetId, ext);

      try {
        // Already downloaded — skip
        if (existsSync(finalPath)) {
          return { success: true, localPath: finalPath, alreadyExists: true };
        }

        await mkdir(assetsDir, { recursive: true });

        // Download to .partial first, rename on completion (crash-safe)
        const partialPath = `${finalPath}.partial`;
        await downloadFile(downloadUrl, partialPath, authToken);
        await rename(partialPath, finalPath);

        return { success: true, localPath: finalPath };
      } catch (err) {
        // Clean up partial file on failure
        const partialPath = `${finalPath}.partial`;
        await unlink(partialPath).catch(() => {});
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Download failed',
        };
      }
    }
  );

  // Check if an asset is already downloaded locally
  ipcMain.handle(
    'asset:getLocalPath',
    async (_, { assetId, ext = '.mp4' }: { assetId: string; ext?: string }): Promise<{ localPath: string | null }> => {
      const filePath = getAssetPath(assetId, ext);
      return { localPath: existsSync(filePath) ? filePath : null };
    }
  );
}
