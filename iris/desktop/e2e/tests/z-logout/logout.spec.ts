import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Logout Flow E2E test.
 *
 * ⚠️ 이 테스트는 electron-store에서 토큰을 삭제하므로 반드시 마지막에 실행해야 합니다.
 * z-logout/ 디렉토리에 위치하여 알파벳 순서로 마지막에 실행됩니다.
 *
 * 앱에는 로그인 게이트가 없다 (App.tsx): 로그아웃해도 로그인 페이지로 넘어가지 않고
 * 앱 셸에 그대로 남으며, 사이드바에 "Sign in" 버튼이 생긴다. 로그인 화면(LoginPage)은
 * 그 버튼으로 여는 선택형 오버레이다.
 */

test.describe('Logout Flow', () => {
  test('logout from settings page signs the user out', async ({ page }) => {
    // Settings 페이지로 이동
    await page.locator('button:has(svg.lucide-settings)').click();
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 10_000 });

    // Settings Account 섹션의 Logout 버튼 클릭
    const logoutClick = await safeClick(
      page,
      'button:has-text("Logout")',
      'Click Logout button in settings'
    );
    assertStep(logoutClick);

    // 로그아웃 후에도 Settings 에 남고, Account 섹션이 비로그인 상태로 바뀐다
    const loggedOutVisible = await safeExpectVisible(
      page,
      'text=Not logged in',
      'Account section shows the logged-out state',
      { timeout: 15_000 }
    );
    assertStep(loggedOutVisible);

    // 사이드바에 "Sign in" 버튼이 나타난다 (Sidebar.tsx — user 가 없을 때만 렌더)
    const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(signInButton).toBeVisible({ timeout: 10_000 });

    // electron-store 의 액세스 토큰이 지워졌는지 확인
    const token = await page.evaluate(
      async () => (await window.electronAPI?.auth?.getToken()) ?? null
    );
    expect(token, 'Access token should be cleared after logout').toBeNull();

    // "Sign in" 은 로그인 오버레이를 연다
    await signInButton.click();
    const loginPageVisible = await safeExpectVisible(
      page,
      'h1:has-text("Welcome to Iris")',
      'Login overlay opens from the Sign in button',
      { timeout: 15_000 }
    );
    assertStep(loginPageVisible);
  });
});
