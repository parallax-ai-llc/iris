import { test, expect } from '../../fixtures/electron.fixture';

/**
 * Auth setup — 직접 page API 사용, 헬퍼 추상화 없음.
 * 각 단계에서 console.log로 진행 상태 출력.
 *
 * ⚠️ 인증 여부는 `nav` 존재로 판별하면 안 된다.
 * 데스크톱은 로그인 없이 사용 가능하고(로그인은 사이드바 "Sign in" 버튼으로
 * 여는 선택 사항), 로그아웃 상태에서도 `nav`가 항상 렌더된다. 예전 로직은
 * 로그아웃 상태를 "이미 인증됨"으로 오판해 로그인을 건너뛴 뒤 토큰 단언에서
 * 실패했고, 그 결과 `authenticated` 프로젝트 전체가 실행 불가였다.
 * 판별 기준은 오직 실제 액세스 토큰이다.
 */
test('login and persist tokens', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in e2e/.env');
  }

  // Step 1: 렌더러 부팅 대기 — nav(비로그인 포함) 또는 로그인 폼 중 먼저 뜨는 것
  console.log('[setup] waiting for renderer to boot...');
  await page.waitForSelector('input[type="email"], nav', { state: 'visible', timeout: 30_000 });

  const readToken = () =>
    page.evaluate(async () => (await window.electronAPI?.auth?.getToken()) ?? null);

  // Step 2: 실제 토큰으로 인증 상태 판별 (nav 존재 여부가 아님)
  const existingToken = await readToken();
  if (existingToken) {
    console.log('[setup] already authenticated (token present) — skipping login');
    return;
  }
  console.log('[setup] no token — logging in');

  // Step 3: 로그인 폼 열기. 로그인은 선택 사항이라 오버레이가 닫혀 있을 수 있으므로
  //         사이드바의 "Sign in" 버튼을 눌러 연다.
  const emailInput = page.locator('input[type="email"]');
  if (!(await emailInput.isVisible().catch(() => false))) {
    console.log('[setup] opening login overlay...');
    await page.getByRole('button', { name: /sign in/i }).first().click();
  }
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  console.log('[setup] email input visible');

  // Step 4: 자격 증명 입력
  await page.fill('input[type="email"]', email);
  console.log('[setup] filled email');

  await page.fill('input[placeholder="••••••••"]', password);
  console.log('[setup] filled password');

  // Step 5: Sign In 제출
  await page.click('button[type="submit"]');
  console.log('[setup] clicked Sign In');

  // Step 6: 성공 = 토큰 저장됨, 실패 = 에러 메시지.
  //         nav는 로그인 전에도 보이므로 완료 신호로 쓸 수 없다.
  console.log('[setup] waiting for token or error...');
  await expect
    .poll(
      async () => {
        if (await page.locator('.text-red-400').isVisible().catch(() => false)) {
          return 'error';
        }
        return (await readToken()) ? 'token' : 'pending';
      },
      { timeout: 30_000, message: 'Login should persist an access token' }
    )
    .not.toBe('pending');

  if (await page.locator('.text-red-400').isVisible().catch(() => false)) {
    const errorText = await page.locator('.text-red-400').textContent();
    throw new Error(`Login failed: ${errorText}`);
  }

  const token = await readToken();
  console.log('[setup] token:', token ? '[exists]' : 'null');
  expect(token, 'Token should be persisted in auth.json').not.toBeNull();
});
