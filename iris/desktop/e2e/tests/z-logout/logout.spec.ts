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
 */

test.describe('Logout Flow', () => {
  test('logout from settings page returns to login page', async ({ page }) => {
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

    // 로그인 페이지로 돌아가는지 확인
    const loginPageVisible = await safeExpectVisible(
      page,
      'h1:has-text("Welcome to Iris")',
      'Login page appears after logout',
      { timeout: 15_000 }
    );
    assertStep(loginPageVisible);
  });
});
