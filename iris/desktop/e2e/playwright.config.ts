import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './tests',
  globalTeardown: './global-teardown',
  // Vite dev server를 development 모드로 시작 (.env → VITE_API_URL=http://localhost:4000)
  // reuseExistingServer 없음 → 항상 새로 시작해 production 서버 재사용 방지
  webServer: {
    command: 'npx vite --config e2e/vite.e2e.config.ts --mode development',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    cwd: path.resolve(__dirname, '..'),
  },
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Electron은 단일 워커 (동시에 같은 electron-store 접근 불가)
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Setup: 로그인 1회 → electron-store에 토큰 저장
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts$/,
    },
    // 인증 불필요 테스트 (로그인 페이지 UI 테스트 등)
    {
      name: 'no-auth',
      testMatch: /\.noauth\.spec\.ts$/,
    },
    // 인증 필요 테스트 — auth-setup 완료 후 실행 (electron-store에 토큰 존재)
    {
      name: 'authenticated',
      testIgnore: /\.(noauth\.spec|setup)\.ts$|screenshots/,
      dependencies: ['auth-setup'],
    },
    // 스크린샷 캡처 — 자체 로그인 수행 (authenticated fixture 불필요)
    {
      name: 'screenshots',
      testMatch: /screenshots\/.*\.spec\.ts$/,
    },
  ],
});
