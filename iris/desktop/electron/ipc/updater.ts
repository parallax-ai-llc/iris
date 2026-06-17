/**
 * Auto-updater IPC handlers for electron-updater
 * Uses GCS as the update server
 */

import { ipcMain, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { isMandatoryUpdate } from './updaterVersion';
import { openUpdaterSplash } from '../updaterSplash';
type UpdateInfo = import('electron-updater').UpdateInfo;
type ProgressInfo = import('electron-updater').ProgressInfo;

// Dynamic import to avoid ESM->CJS interop triggering autoUpdater getter at module load
async function getAutoUpdater() {
  const mod = await import('electron-updater');
  return mod.default?.autoUpdater ?? (mod as any).autoUpdater;
}

interface UpdateStore {
  lastUpdateCheck?: number;
  skippedVersion?: string;
  autoCheckEnabled: boolean;
}

const storeDefaults: UpdateStore = { autoCheckEnabled: true };

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'updater.json');
}

function readStore(): UpdateStore {
  try {
    return { ...storeDefaults, ...JSON.parse(fs.readFileSync(getStorePath(), 'utf-8')) };
  } catch {
    return { ...storeDefaults };
  }
}

function writeStore(data: UpdateStore): void {
  const dir = path.dirname(getStorePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8');
}

function storeGet<K extends keyof UpdateStore>(key: K): UpdateStore[K] {
  return readStore()[key];
}

function storeSet<K extends keyof UpdateStore>(key: K, value: UpdateStore[K]): void {
  const s = readStore();
  s[key] = value;
  writeStore(s);
}

// State tracking
let isCheckingForUpdate = false;
let isDownloading = false;
let downloadProgress = 0;
let updateAvailable: UpdateInfo | null = null;

function sendUpdateEvent(channel: string, data?: unknown) {
  const windows = BrowserWindow.getAllWindows();
  const mainWindow = windows.length > 0 ? windows[0] : null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// Reference to autoUpdater for cleanup on quit
let autoUpdaterRef: Awaited<ReturnType<typeof getAutoUpdater>> | null = null;

// preQuit hook from setupUpdaterHandlers — shared with the startup update gate
let preQuitHook: (() => Promise<void>) | undefined;

// Set when the startup gate completed a successful check, so the post-launch
// auto-check doesn't immediately re-fetch the same feed.
let startupGateCheckedFeed = false;

/**
 * Quit and install a downloaded update. Shared by the updater:installUpdate
 * IPC handler and the startup update gate.
 */
async function installDownloadedUpdate(autoUpdater: NonNullable<typeof autoUpdaterRef>) {
  // Run any caller-provided cleanup (e.g. extensionManager.shutdown) BEFORE
  // NSIS spawns, so child processes don't hold file locks on the install dir.
  try {
    if (preQuitHook) await preQuitHook();
  } catch (err) {
    console.error('[Updater] preQuit hook failed:', err);
  }
  // Strip listeners that could block or delay the quit sequence — any async
  // work in those would race with electron-updater and may cause --force-run
  // to never reach NSIS, leaving the user with an installed-but-not-relaunched app.
  app.removeAllListeners('window-all-closed');
  app.removeAllListeners('before-quit');
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.removeAllListeners('close');
  });
  // Defer one tick so any pending IPC reply is flushed before quit begins.
  setImmediate(() => {
    if (process.platform === 'linux' && process.env.APPIMAGE) {
      // electron-updater overwrites the current AppImage in place. quitAndInstall
      // on Linux does NOT reliably relaunch — the standard fix is to relaunch
      // ourselves with execPath pointing at the (now-updated) AppImage and the
      // --appimage-extract-and-run flag, then app.exit(0).
      // Refs: electron-userland/electron-builder#1727, #5380
      app.relaunch({
        execPath: process.env.APPIMAGE,
        args: ['--appimage-extract-and-run'],
      });
      app.exit(0);
    } else {
      // mac (Squirrel.Mac handles silent install + relaunch automatically)
      // win (NSIS: isSilent=true, isForceRunAfter=true → silent + auto relaunch)
      autoUpdater.quitAndInstall(true, true);
    }
  });
}

export async function setupUpdaterHandlers(options: { preQuit?: () => Promise<void> } = {}) {
  const autoUpdater = await getAutoUpdater();
  autoUpdaterRef = autoUpdater;
  preQuitHook = options.preQuit;
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://storage.googleapis.com/parallax-ai-images/dev/releases/',
    });
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.autoDownload = false;
  // IMPORTANT: keep this false. The autoInstallOnAppQuit path does NOT pass
  // --force-run to NSIS, so the app would install but never relaunch. We want
  // installs to go exclusively through quitAndInstall(true, true) which DOES
  // pass --force-run, guaranteeing the new version auto-launches after install.
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    isCheckingForUpdate = true;
    sendUpdateEvent('updater:checking');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    isCheckingForUpdate = false;
    const skippedVersion = storeGet('skippedVersion');
    // skipVersion only silences optional (patch) updates — a major/minor bump
    // is mandatory and ignores the skip flag.
    if (skippedVersion === info.version && !isMandatoryUpdate(app.getVersion(), info.version)) {
      return;
    }
    updateAvailable = info;
    sendUpdateEvent('updater:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    isCheckingForUpdate = false;
    updateAvailable = null;
    sendUpdateEvent('updater:not-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    isDownloading = true;
    downloadProgress = progress.percent;
    sendUpdateEvent('updater:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    isDownloading = false;
    downloadProgress = 100;
    sendUpdateEvent('updater:downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    isCheckingForUpdate = false;
    isDownloading = false;
    sendUpdateEvent('updater:error', { message: error.message });
  });

  ipcMain.handle('updater:checkForUpdates', async () => {
    if (isCheckingForUpdate || isDownloading) return { status: 'busy' };
    try {
      storeSet('lastUpdateCheck', Date.now());
      const result = await autoUpdater.checkForUpdates();
      return {
        status: 'success',
        updateInfo: result?.updateInfo
          ? { version: result.updateInfo.version, releaseDate: result.updateInfo.releaseDate }
          : null,
      };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('updater:downloadUpdate', async () => {
    if (!updateAvailable || isDownloading) {
      return { status: 'error', message: 'No update available or already downloading' };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { status: 'success' };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Download failed' };
    }
  });

  ipcMain.handle('updater:installUpdate', async () => {
    await installDownloadedUpdate(autoUpdater);
  });

  ipcMain.handle('updater:skipVersion', (_, version: string) => {
    storeSet('skippedVersion', version);
    updateAvailable = null;
    return { status: 'success' };
  });

  ipcMain.handle('updater:getStatus', () => {
    return {
      isCheckingForUpdate,
      isDownloading,
      downloadProgress,
      updateAvailable: updateAvailable
        ? { version: updateAvailable.version, releaseDate: updateAvailable.releaseDate }
        : null,
      lastUpdateCheck: storeGet('lastUpdateCheck'),
      autoCheckEnabled: storeGet('autoCheckEnabled'),
    };
  });

  ipcMain.handle('updater:setAutoCheck', (_, enabled: boolean) => {
    storeSet('autoCheckEnabled', enabled);
    return { status: 'success' };
  });

  // NOTE: Do NOT register a 'before-quit' handler here that mutates updater state.
  // It can race with electron-updater's own quit sequence and cause the
  // post-install relaunch flag (isForceRunAfter) to be dropped on Windows.
  // electron-updater handles partial-download cleanup on next launch automatically.
}

/**
 * Auto-check for updates on startup — fires immediately so the sidebar
 * shows the "Checking" indicator the moment the app opens.
 */
export function checkForUpdatesOnStartup() {
  const autoCheckEnabled = storeGet('autoCheckEnabled');
  if (!autoCheckEnabled) return;
  // The startup gate already fetched the feed moments ago; its result is in
  // module state (updateAvailable), which the renderer reads via getStatus.
  if (startupGateCheckedFeed) return;
  (async () => {
    if (!isCheckingForUpdate && !isDownloading) {
      const autoUpdater = await getAutoUpdater();
      autoUpdater.checkForUpdates().catch(() => {});
    }
  })();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

const STARTUP_CHECK_TIMEOUT_MS = 10_000;
// Give the splash renderer a beat to paint the "installing" state before quit.
const PRE_INSTALL_SPLASH_DELAY_MS = 800;

export interface StartupUpdateGateResult {
  /** false → 업데이트 설치를 위해 종료 중이므로 메인 윈도우를 만들지 말 것 */
  continueLaunch: boolean;
  /**
   * 스플래시 창 정리. 반드시 메인 윈도우 생성 *이후*에 호출해야 한다 —
   * 먼저 닫으면 창이 0개가 되어 'window-all-closed' → app.quit()이 발화한다.
   */
  releaseSplash: () => void;
}

/**
 * Discord-style startup update gate. 메인 윈도우 생성 전에 호출한다.
 *
 * 스플래시만 띄운 채 버전을 체크해서 major/minor가 올라간(=mandatory)
 * 업데이트가 있으면 그 자리에서 다운로드 → 자동 설치 → 재실행한다.
 * 패치(x)만 바뀐 업데이트, 업데이트 없음, 체크 실패/타임아웃은 모두
 * 정상 부팅으로 폴백한다 (패치는 기존 인앱 수동 업데이트 플로우 유지).
 *
 * setupUpdaterHandlers가 완료된 뒤에 호출해야 이벤트가 스플래시에 전달된다.
 */
export async function runStartupUpdateGate(): Promise<StartupUpdateGateResult> {
  let splash: BrowserWindow | null = null;
  const releaseSplash = () => {
    if (splash && !splash.isDestroyed()) splash.destroy();
  };
  try {
    const autoUpdater = autoUpdaterRef ?? (await getAutoUpdater());
    splash = await openUpdaterSplash();

    storeSet('lastUpdateCheck', Date.now());
    const result = await withTimeout(autoUpdater.checkForUpdates(), STARTUP_CHECK_TIMEOUT_MS);
    startupGateCheckedFeed = true;

    const info = result?.isUpdateAvailable ? result.updateInfo : null;
    if (!info || !isMandatoryUpdate(app.getVersion(), info.version)) {
      return { continueLaunch: true, releaseSplash };
    }

    // Mandatory update: download in the splash (progress events stream to it
    // via the regular updater:* channels), then install + relaunch.
    await autoUpdater.downloadUpdate();
    await new Promise((resolve) => setTimeout(resolve, PRE_INSTALL_SPLASH_DELAY_MS));
    await installDownloadedUpdate(autoUpdater);
    return { continueLaunch: false, releaseSplash };
  } catch (err) {
    // 어떤 실패(오프라인, 타임아웃, 다운로드 중단)든 부팅을 막지 않는다.
    console.error('[Updater] Startup update gate failed, continuing launch:', err);
    isCheckingForUpdate = false;
    isDownloading = false;
    return { continueLaunch: true, releaseSplash };
  }
}
