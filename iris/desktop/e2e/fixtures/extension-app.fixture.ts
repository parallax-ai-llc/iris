import { test as base, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Electron fixture for tests that need to control the app lifecycle themselves.
 *
 * `electron.fixture` / `authenticated.fixture` launch exactly one app per test
 * and close it on teardown, which cannot express "install, then restart the app
 * and check that the contribution survived". This fixture hands the test a
 * `launchApp()` factory instead: call it as many times as the scenario needs,
 * and every app it produced is closed on teardown.
 *
 * Launch parameters mirror electron.fixture (TEST_MODE userData under
 * e2e/.test-user-data, NODE_ENV=development so main.ts loads the Vite dev
 * server the Playwright webServer starts).
 */

type LaunchedApp = { app: ElectronApplication; page: Page };

type ExtensionAppFixtures = {
  launchApp: () => Promise<LaunchedApp>;
};

/** Launch the built Electron main process against the E2E user-data dir. */
export async function launchElectronApp(): Promise<LaunchedApp> {
  // __dirname = e2e/fixtures/, go up two levels to iris/desktop/
  const mainPath = path.resolve(__dirname, '../../dist-electron/main.js');

  // Remove ELECTRON_RUN_AS_NODE from env — if set (e.g. by bash/MSYS2), Electron
  // runs as plain Node.js instead of browser mode and the API breaks.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.NODE_ENV = 'development';
  env.TEST_MODE = 'true';

  const app = await electron.launch({ args: [mainPath], env });

  app.process().stdout?.on('data', (d: Buffer) => console.log('[MAIN]', d.toString().trim()));
  app.process().stderr?.on('data', (d: Buffer) => console.error('[MAIN ERR]', d.toString().trim()));

  const page = await app.firstWindow();
  await page.waitForLoadState('load');

  // React has rendered once either the sidebar (logged in or not — desktop is
  // usable without an account) or the login form is on screen.
  await page.waitForSelector('input[type="email"], nav', {
    state: 'visible',
    timeout: 30_000,
  });

  return { app, page };
}

export const test = base.extend<ExtensionAppFixtures>({
  // eslint-disable-next-line no-empty-pattern
  launchApp: async ({}, use) => {
    const launched: ElectronApplication[] = [];

    await use(async () => {
      const result = await launchElectronApp();
      launched.push(result.app);
      return result;
    });

    for (const app of launched) {
      await app.close().catch(() => {
        // Already gone (test closed it explicitly) — nothing to clean up.
      });
    }
  },
});

export { expect } from '@playwright/test';
