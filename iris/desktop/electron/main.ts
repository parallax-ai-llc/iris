import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { setupAuthHandlers } from './ipc/auth';
import { setupFileHandlers } from './ipc/files';
import { setupStorageHandlers } from './ipc/storage';
import { setupUpdaterHandlers, checkForUpdatesOnStartup, runStartupUpdateGate } from './ipc/updater';
import { setupExportHandlers } from './ipc/export';
import { setupProxyHandlers } from './ipc/proxy';
import { setupPrerenderHandlers } from './ipc/prerender';
import { setupSilenceRemovalHandlers } from './ipc/silence-removal';
import { setupAudioExtractHandlers } from './ipc/audio-extract';
import { setupAssetStorageHandlers } from './ipc/asset-storage';
import { setupBugReportHandlers } from './ipc/bug-report';
import { setupExtensionHandlers } from './ipc/extensions';
import { setupIrisHandlers, startIrisServer, stopIrisServer, startDaemon, stopDaemon } from './ipc/iris';
import { ExtensionManager } from './extensions/extensionManager';

// ESM build - __dirname is not available natively, use import.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Custom protocol for OAuth callbacks
const PROTOCOL_NAME = 'iris-desktop';

const isTestMode = process.env.TEST_MODE === 'true';
const qaInstance = process.env.QA_INSTANCE; // "1", "2", etc. — enables multi-instance QA

// Override userData path for E2E tests so tokens persist across test launches
// Must be called before app.requestSingleInstanceLock()
if (isTestMode) {
  const testUserDataDir = path.resolve(__dirname, '../e2e/.test-user-data');
  app.setPath('userData', testUserDataDir);
}

// QA multi-instance: isolate userData and set unique CDP port
if (qaInstance) {
  app.setPath('userData', path.join(os.tmpdir(), `iris-qa-${qaInstance}`));
  app.commandLine.appendSwitch('remote-debugging-port', String(9224 + parseInt(qaInstance, 10)));
}

// Force Electron's safeStorage to use a basic (file-based) password store on
// macOS instead of the system Keychain. The Keychain ACL is bound to the exact
// code-signing identity of the binary that created the entry — every release
// build (and every cert renewal in the future) ends up triggering a "this app
// wants to use 'iris-desktop Safe Storage'" prompt for every user, on every
// launch. Switching to "basic" stores the encryption key inside Application
// Support and avoids the prompt entirely.
// Must be called before app.whenReady() / any safeStorage usage.
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('password-store', 'basic');
}

// MIME type map for local media server
const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.aac': 'audio/aac', '.flac': 'audio/flac',
};

// Local HTTP server to serve media files with proper Range support
let localMediaPort = 0;

function startLocalMediaServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);
      const filePath = url.searchParams.get('path');
      if (!filePath) { res.writeHead(400).end('Missing path'); return; }

      let stat: fs.Stats;
      try { stat = fs.statSync(filePath); } catch { res.writeHead(404).end('Not found'); return; }

      const fileSize = stat.size;
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');

      // Range request handling (required for <video> seeking)
      const range = req.headers.range;
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          res.writeHead(206, {
            'Content-Type': contentType,
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }
      }

      // Full file response
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': fileSize,
      });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      localMediaPort = typeof addr === 'object' ? addr?.port ?? 0 : 0;
      console.log(`[LocalMedia] HTTP server on port ${localMediaPort}`);
      resolve(localMediaPort);
    });
    server.on('error', reject);
  });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const extensionManager = new ExtensionManager();

/** Bring the main window forward, creating one if all windows were closed. */
function showOrCreateWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

/**
 * System-tray indicator for the detached local engine daemon. The daemon runs
 * independently of the UI (close the app, batch/scheduled workflows keep going);
 * the tray surfaces that while the app is open and lets the user explicitly stop
 * or restart it. Skipped in TEST_MODE.
 */
function setupTray(): void {
  if (tray || process.env.TEST_MODE === 'true') return;
  let image = nativeImage.createFromPath(
    path.join(__dirname, '../resources/icon.png'),
  );
  if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('Iris — local workflow engine (background)');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Iris workflow engine', enabled: false },
      { type: 'separator' },
      { label: 'Open Iris', click: showOrCreateWindow },
      {
        label: 'Start background engine',
        click: () =>
          startDaemon().catch(err =>
            console.error('[tray] startDaemon failed:', err),
          ),
      },
      {
        label: 'Stop background engine',
        click: () =>
          stopDaemon().catch(err =>
            console.error('[tray] stopDaemon failed:', err),
          ),
      },
      { type: 'separator' },
      {
        label: 'Quit Iris',
        click: () => {
          const w = mainWindow as
            | (BrowserWindow & { _forceClose?: boolean })
            | null;
          if (w) w._forceClose = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showOrCreateWindow);
}

/**
 * Handle OAuth callback URL
 * URL format: iris-desktop://auth/callback?accessToken=...&refreshToken=...&user=...
 */
function handleProtocolUrl(url: string) {
  console.log('Received protocol URL:', url);

  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.replace(/^\/+/, ''); // Remove leading slashes

    if (parsedUrl.host === 'auth' || pathname === 'auth/callback' || pathname === 'callback') {
      const accessToken = parsedUrl.searchParams.get('accessToken');
      const refreshToken = parsedUrl.searchParams.get('refreshToken');
      const userParam = parsedUrl.searchParams.get('user');
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        mainWindow?.webContents.send('auth:error', { error });
        return;
      }

      if (accessToken && refreshToken && userParam) {
        try {
          const user = JSON.parse(decodeURIComponent(userParam));
          mainWindow?.webContents.send('auth:callback', { accessToken, refreshToken, user });
          console.log('Auth callback processed successfully');
        } catch (parseError) {
          console.error('Failed to parse user data:', parseError);
          mainWindow?.webContents.send('auth:error', { error: 'Failed to parse authentication data' });
        }
      } else {
        console.error('Missing auth parameters in callback URL');
        mainWindow?.webContents.send('auth:error', { error: 'Missing authentication parameters' });
      }
    }
  } catch (err) {
    console.error('Failed to parse protocol URL:', err);
  }
}

function createWindow() {
  // Only use vite dev server in explicit development mode (not test/production)
  const isDev = (process.env.NODE_ENV === 'development' || !app.isPackaged) && process.env.USE_BUILT !== 'true';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    // macOS: frameless with hidden titlebar + traffic lights
    ...(process.platform === 'darwin' ? {
      frame: false,
      titleBarStyle: 'hidden' as const,
      trafficLightPosition: { x: 18, y: 18 },
    } : {}),
    // Windows: frameless (custom buttons rendered in TitleBar component)
    ...(process.platform === 'win32' ? {
      frame: false,
    } : {}),
    // Linux: frameless (custom buttons)
    ...(process.platform === 'linux' ? {
      frame: false,
    } : {}),
    backgroundColor: '#09090b',
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox: false — Required for ESM preload (.mjs) compatibility.
      // When sandbox is true, the preload script runs in a restricted
      // environment that does not support ES module syntax, causing
      // "Cannot use import statement outside a module" errors.
      // TODO: Re-enable sandbox once Electron supports ESM preloads
      // in sandboxed renderers (track: https://github.com/electron/electron/issues/40462)
      sandbox: false,
      webSecurity: !isTestMode && !qaInstance,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    if (!isTestMode && !qaInstance) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximizeChanged', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximizeChanged', false);
  });

  // Intercept native close button — ask renderer to confirm before closing
  mainWindow.on('close', (event) => {
    if ((mainWindow as BrowserWindow & { _forceClose?: boolean })._forceClose) return;
    const wc = mainWindow?.webContents;
    // If renderer is unavailable (crashed/destroyed/still loading), close immediately
    if (!wc || wc.isDestroyed() || wc.isCrashed() || !mainWindow?.isVisible()) return;
    event.preventDefault();
    wc.send('window:close-requested');
    // Safety net: if renderer never calls forceClose within 3s, force-close anyway
    setTimeout(() => {
      if (mainWindow && !(mainWindow as BrowserWindow & { _forceClose?: boolean })._forceClose) {
        (mainWindow as BrowserWindow & { _forceClose?: boolean })._forceClose = true;
        mainWindow.close();
      }
    }, 3000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocol handler (must be called before app.ready)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}

app.on('open-url', (_event, url) => {
  handleProtocolUrl(url);
});

// QA instances skip the single-instance lock entirely.
// macOS lock is based on execPath, not userData, so setPath alone won't help.
const skipSingleInstanceLock = !!qaInstance;

if (!skipSingleInstanceLock) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  }

  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) handleProtocolUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Setup IPC handlers
setupAuthHandlers();
setupFileHandlers();
setupStorageHandlers();
setupExportHandlers();
setupProxyHandlers();
setupPrerenderHandlers();
setupSilenceRemovalHandlers();
setupAudioExtractHandlers();
setupAssetStorageHandlers();
setupBugReportHandlers();
setupExtensionHandlers(extensionManager);
setupIrisHandlers();

let updaterReady: Promise<unknown> = Promise.resolve();
if (!isTestMode) {
  updaterReady = setupUpdaterHandlers({
    // Awaited inside updater:installUpdate so child processes/file locks are
    // released before NSIS runs the silent installer.
    preQuit: () => extensionManager.shutdown(),
  }).catch(console.error);
}

ipcMain.handle('window:minimize', () => { mainWindow?.minimize(); });
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('window:close', () => { mainWindow?.close(); });
ipcMain.handle('window:force-close', () => {
  if (mainWindow) {
    (mainWindow as BrowserWindow & { _forceClose?: boolean })._forceClose = true;
    mainWindow.close();
  }
});
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getLocalMediaPort', () => localMediaPort);

ipcMain.handle('auth:openOAuth', (_event, provider: 'google' | 'apple') => {
  const isDev = (process.env.NODE_ENV === 'development' || !app.isPackaged) && process.env.USE_BUILT !== 'true';
  // Canonical API domain in prod (matches the renderer's VITE_API_URL and the
  // OAuth redirect_uri registered in the Google/Apple console).
  const baseUrl = isDev
    ? 'http://localhost:4000'
    : 'https://api.parallax.kr';
  shell.openExternal(`${baseUrl}/auth/desktop/${provider}`);
});

// Windows: Set App User Model ID for taskbar integration
if (process.platform === 'win32') {
  app.setAppUserModelId('com.parallax.iris-desktop');
}

app.whenReady().then(async () => {
  // Start local HTTP server for serving media files with proper Range support
  await startLocalMediaServer();

  // Start the embedded local Iris workflow engine server (BYOK, fully local).
  // Non-fatal: the rest of the app works even if it fails to bind.
  try {
    await startIrisServer();
  } catch (err) {
    console.error('[main] Failed to start local Iris engine server:', err);
  }

  // Discord-style startup update gate: major/minor가 올라간 업데이트는 메인
  // 윈도우를 띄우기 전에 스플래시에서 다운로드 → 자동 설치 → 재실행한다.
  // 패치 업데이트는 기존 인앱(사이드바/알림) 수동 플로우를 유지한다.
  // IRIS_FORCE_UPDATE_GATE=true로 dev에서도 게이트를 강제할 수 있다 (dev feed 사용).
  let releaseUpdaterSplash: (() => void) | null = null;
  if (!isTestMode && (app.isPackaged || process.env.IRIS_FORCE_UPDATE_GATE === 'true')) {
    await updaterReady;
    const gate = await runStartupUpdateGate();
    if (!gate.continueLaunch) return; // quitting to install the update
    releaseUpdaterSplash = gate.releaseSplash;
  }

  createWindow();
  // Close the splash only AFTER the main window exists — otherwise
  // 'window-all-closed' fires and quits the app.
  releaseUpdaterSplash?.();
  setupTray();
  if (!isTestMode && app.isPackaged) checkForUpdatesOnStartup();

  // Initialize extension system after window is created
  if (mainWindow) {
    try {
      await extensionManager.initialize(mainWindow);
    } catch (err) {
      console.error('[Main] Failed to initialize extension manager:', err);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  // Fire-and-forget. Electron does NOT await async before-quit handlers, so
  // marking this `async` previously created a race with the auto-updater quit
  // sequence and could drop NSIS's --force-run flag (no auto-relaunch).
  // The updater path explicitly awaits extensionManager.shutdown() via the
  // preQuit hook in setupUpdaterHandlers, so no shutdown is missed.
  extensionManager.shutdown().catch((err) => {
    console.error('[main] extensionManager shutdown failed:', err);
  });
  stopIrisServer().catch((err) => {
    console.error('[main] local Iris engine server shutdown failed:', err);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
