/**
 * Discord-style startup update splash window.
 * Shown before the main window while the startup update gate checks for /
 * downloads a mandatory (major/minor) update. Loads a self-contained
 * data: URL page that listens to the updater:* IPC events exposed by the
 * shared preload, so no extra renderer bundle or IPC channel is needed.
 */

import { BrowserWindow, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SplashStrings {
  checking: string;
  downloading: string;
  installing: string;
}

function getSplashStrings(): SplashStrings {
  const locale = app.getLocale().toLowerCase();
  if (locale.startsWith('ko')) {
    return {
      checking: '업데이트 확인 중…',
      downloading: '업데이트 다운로드 중…',
      installing: '설치 중… 곧 다시 시작됩니다',
    };
  }
  if (locale.startsWith('ja')) {
    return {
      checking: 'アップデートを確認中…',
      downloading: 'アップデートをダウンロード中…',
      installing: 'インストール中… まもなく再起動します',
    };
  }
  return {
    checking: 'Checking for updates…',
    downloading: 'Downloading update…',
    installing: 'Installing… restarting shortly',
  };
}

function buildSplashHtml(strings: SplashStrings): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  html,body{margin:0;height:100%;background:#09090b;color:#e4e4e7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-user-select:none;user-select:none;overflow:hidden}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;-webkit-app-region:drag}
  .logo{font-size:22px;font-weight:700;letter-spacing:.18em;background:linear-gradient(90deg,#9CA3AF,#E5E7EB);-webkit-background-clip:text;background-clip:text;color:transparent}
  .spinner{width:18px;height:18px;border:2px solid #3f3f46;border-top-color:#d4d4d8;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .status{font-size:12px;color:#a1a1aa;min-height:16px}
  .bar{width:240px;height:4px;border-radius:2px;background:#27272a;overflow:hidden;visibility:hidden}
  .bar>div{height:100%;width:0%;border-radius:2px;background:linear-gradient(90deg,#6B7280,#D1D5DB);transition:width .25s ease}
  .pct{font-size:11px;color:#71717a;min-height:14px}
</style>
</head>
<body>
  <div class="logo">IRIS</div>
  <div class="spinner" id="spinner"></div>
  <div class="status" id="status"></div>
  <div class="bar" id="bar"><div id="fill"></div></div>
  <div class="pct" id="pct"></div>
<script>
  var S = ${JSON.stringify(strings)};
  var byId = function (id) { return document.getElementById(id); };
  byId('status').textContent = S.checking;
  var updater = window.electronAPI && window.electronAPI.updater;
  if (updater) {
    updater.onDownloadProgress(function (p) {
      byId('spinner').style.display = 'none';
      byId('status').textContent = S.downloading;
      byId('bar').style.visibility = 'visible';
      byId('fill').style.width = p.percent + '%';
      byId('pct').textContent = Math.round(p.percent) + '%';
    });
    updater.onDownloaded(function () {
      byId('spinner').style.display = 'none';
      byId('status').textContent = S.installing;
      byId('bar').style.visibility = 'visible';
      byId('fill').style.width = '100%';
      byId('pct').textContent = '';
    });
  }
</script>
</body>
</html>`;
}

export async function openUpdaterSplash(): Promise<BrowserWindow> {
  const splash = new BrowserWindow({
    width: 360,
    height: 200,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    center: true,
    backgroundColor: '#09090b',
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // Same constraint as the main window: ESM preload (.mjs) requires
      // sandbox: false (see createWindow in main.ts).
      sandbox: false,
    },
  });
  const html = buildSplashHtml(getSplashStrings());
  await splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splash.show();
  return splash;
}
