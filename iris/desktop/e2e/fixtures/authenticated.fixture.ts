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
 * 앱 실행 시 checkAuth()가 토큰을 발견 → 자동 인증.
 * 테스트는 바로 메인 앱 UI에서 시작.
 *
 * ⚠️ 앱에는 로그인 게이트가 없다 (App.tsx): 토큰이 없어도 셸(nav)은 그대로 뜨고
 * 로그인 화면은 사이드바 "Sign in" 버튼으로 여는 선택형 오버레이다. 그래서 인증 여부는
 * 화면이 아니라 실제 액세스 토큰으로 판별한다 (auth.setup.ts 와 같은 기준).
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
    // Run with a hidden window unless explicitly headed (--headed / E2E_SHOW_WINDOW=true).
    if (process.env.E2E_SHOW_WINDOW !== 'true') env.E2E_HIDE_WINDOW = 'true';

    const app = await electron.launch({
      args: [mainPath],
      env,
    });

    await use(app);
    await app.close();
  },

  page: async ({ electronApp }, use) => {
    const appWindow = await electronApp.firstWindow();
    await appWindow.waitForLoadState('load');

    // React 렌더링 완료 대기 — nav(sidebar)는 로그인 여부와 관계없이 항상 렌더된다.
    await appWindow.waitForSelector('nav', { state: 'visible', timeout: 30_000 });

    // 자동 인증 확인: nav 는 비로그인 상태에서도 보이므로 실제 토큰으로 판별한다.
    // 토큰이 없으면 로그인이 필요한 페이지(Library/Storage/Settings 등)가 비로그인 화면으로
    // 렌더되어 셀렉터 타임아웃으로만 드러나므로 여기서 바로 실패시킨다.
    const hasToken = await appWindow.evaluate(
      async () => Boolean(await window.electronAPI?.auth?.getToken())
    );

    if (!hasToken) {
      throw new Error(
        'Authenticated fixture: no access token in electron-store. ' +
        'auth-setup may have failed or auth.json tokens were cleared. ' +
        'Run "auth-setup" project first.'
      );
    }

    await use(appWindow);
  },
});

export { expect } from '@playwright/test';
