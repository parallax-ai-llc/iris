import { test as base, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Electron-specific test fixtures.
 *
 * - Launches the built Electron app from dist-electron/main.js
 * - Provides `electronApp` (ElectronApplication) and `page` (first BrowserWindow)
 * - Provides platform helpers: `isMac` and `modifier` (Meta on macOS, Control elsewhere)
 * - Automatically closes the app after each test
 */

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
  isMac: boolean;
  modifier: 'Meta' | 'Control';
};

export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  isMac: async ({}, use) => {
    await use(process.platform === 'darwin');
  },

  // eslint-disable-next-line no-empty-pattern
  modifier: async ({}, use) => {
    await use(process.platform === 'darwin' ? 'Meta' : 'Control');
  },

  electronApp: async ({}, use) => {
    // __dirname = e2e/fixtures/, go up two levels to iris-desktop/
    const mainPath = path.resolve(
      __dirname,
      '../../dist-electron/main.js'
    );

    // Remove ELECTRON_RUN_AS_NODE from env - if set (e.g. by bash/MSYS2), it causes
    // Electron to run as plain Node.js instead of browser mode, breaking the API.
    // Do NOT set executablePath on Windows: Playwright resolves electron.exe via
    // require('electron/index.js') and adds its own loader (-r) which makes
    // require('electron') return the real Electron API inside the main process.
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    // development → main.ts에서 loadURL('http://localhost:5173') 사용 (renderer 빌드 불필요)
    env.NODE_ENV = 'development';
    env.TEST_MODE = 'true';

    const app = await electron.launch({
      args: [mainPath],
      env,
    });

    // Capture main process output for debugging
    app.process().stdout?.on('data', (d: Buffer) => console.log('[MAIN]', d.toString().trim()));
    app.process().stderr?.on('data', (d: Buffer) => console.error('[MAIN ERR]', d.toString().trim()));

    await use(app);
    await app.close();
  },

  page: async ({ electronApp }, use) => {
    // Wait for the first BrowserWindow to open
    const window = await electronApp.firstWindow();

    // Wait for HTML to load, then wait for React to render a known element.
    // 'load' fires when HTML is parsed — React may not have rendered yet.
    // We wait for either the login form or the main app sidebar to appear,
    // which guarantees checkAuth() has completed and the UI is interactive.
    await window.waitForLoadState('load');
    await window.waitForSelector(
      'input[type="email"], nav[aria-label="sidebar"], [data-testid="sidebar"]',
      { state: 'visible', timeout: 30_000 }
    ).catch(() => {});

    await use(window);
  },
});

export { expect } from '@playwright/test';
