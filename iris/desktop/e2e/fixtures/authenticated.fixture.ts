import { test as base, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Authenticated Electron fixture.
 *
 * auth-setup에서 로그인 후 electron-store에 토큰이 저장된 상태를 전제.
 * 앱 실행 시 checkAuth()가 토큰을 발견 → 자동 인증 → LoginPage 스킵.
 * 테스트는 바로 메인 앱 UI에서 시작.
 */

type AuthenticatedFixtures = {
  electronApp: ElectronApplication;
  page: Page;
  isMac: boolean;
  modifier: 'Meta' | 'Control';
};

export const test = base.extend<AuthenticatedFixtures>({
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
    const mainPath = path.resolve(__dirname, '../../dist-electron/main.js');

    // Remove ELECTRON_RUN_AS_NODE from env - if set (e.g. by bash/MSYS2), it causes
    // Electron to run as plain Node.js instead of browser mode, breaking the API.
    // Do NOT set executablePath: Playwright resolves electron.exe via
    // require('electron/index.js') and adds its own loader (-r) which makes
    // require('electron') return the real Electron API inside the main process.
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env.NODE_ENV = 'development';;
    env.TEST_MODE = 'true';

    const app = await electron.launch({
      args: [mainPath],
      env,
    });

    await use(app);
    await app.close();
  },

  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('load');

    // React 렌더링 완료 대기.
    // 토큰이 있으면 checkAuth() → 자동 인증 → nav(sidebar) 표시.
    // 토큰이 없으면 로그인 페이지 → input[type="email"] 표시.
    await window.waitForSelector(
      'input[type="email"], nav',
      { state: 'visible', timeout: 30_000 }
    );

    // 자동 인증 확인: 로그인 페이지가 나타나면 안 됨
    const isLoginPage = await window.locator('input[type="email"]').isVisible();

    if (isLoginPage) {
      throw new Error(
        'Authenticated fixture: LoginPage is still visible. ' +
        'auth-setup may have failed or auth.json tokens were cleared. ' +
        'Run "auth-setup" project first.'
      );
    }

    await use(window);
  },
});

export { expect } from '@playwright/test';
