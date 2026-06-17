import { test, expect } from '../../fixtures/electron.fixture';

/**
 * Auth setup — 직접 page API 사용, 헬퍼 추상화 없음.
 * 각 단계에서 console.log로 진행 상태 출력.
 */
test('login and persist tokens', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in e2e/.env');
  }

  // Step 1: 로그인 폼 또는 이미 인증된 앱(nav)이 나타날 때까지 대기
  console.log('[setup] waiting for email input or nav (already authenticated)...');
  await page.waitForSelector('input[type="email"], nav', { state: 'visible', timeout: 30_000 });

  // 이미 로그인된 상태라면 토큰 확인 후 바로 종료
  const isAlreadyAuthenticated = await page.locator('nav').isVisible().catch(() => false);
  if (isAlreadyAuthenticated) {
    console.log('[setup] already authenticated — skipping login');
    const token = await page.evaluate(async () => {
      return (await window.electronAPI?.auth?.getToken()) ?? null;
    });
    console.log('[setup] token:', token ? '[exists]' : 'null');
    expect(token, 'Token should be persisted in auth.json').not.toBeNull();
    return;
  }
  console.log('[setup] email input visible');

  // Step 2: 이메일 입력
  await page.fill('input[type="email"]', email);
  console.log('[setup] filled email');

  // Step 3: 비밀번호 입력 (placeholder의 bullet 문자 • 로 특정)
  await page.fill('input[placeholder="••••••••"]', password);
  console.log('[setup] filled password');

  // Step 4: Sign In 버튼 클릭
  await page.click('button[type="submit"]');
  console.log('[setup] clicked Sign In');

  // Step 5: 로그인 성공 = nav(사이드바) 표시, 실패 = 에러 메시지
  console.log('[setup] waiting for nav or error...');
  await page.waitForSelector('nav, .text-red-400', { state: 'visible', timeout: 30_000 });

  const hasError = await page.locator('.text-red-400').isVisible();
  if (hasError) {
    const errorText = await page.locator('.text-red-400').textContent();
    throw new Error(`Login failed: ${errorText}`);
  }
  console.log('[setup] nav visible — login succeeded');

  // Step 6: 토큰이 auth.json에 저장됐는지 확인
  const token = await page.evaluate(async () => {
    return (await window.electronAPI?.auth?.getToken()) ?? null;
  });
  console.log('[setup] token:', token ? '[exists]' : 'null');

  expect(token, 'Token should be persisted in auth.json').not.toBeNull();
});
