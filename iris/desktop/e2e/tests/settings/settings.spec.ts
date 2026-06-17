import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Settings Page E2E tests (non-destructive).
 *
 * Settings 접근 경로:
 *   TitleBar의 Settings 기어 아이콘 버튼 (TitleBar.tsx)
 *   → button:has(svg.lucide-settings)
 *
 * Selectors:
 *   - Settings gear in TitleBar: button:has(svg.lucide-settings)
 *   - Settings h1: h1:has-text("Settings")
 *   - Account section: text=Account
 *   - Logout btn: button:has-text("Logout")
 */

test.describe('Settings Page', () => {
  test('can navigate to settings via TitleBar gear icon', async ({ page }) => {
    const settingsClick = await safeClick(
      page,
      'button:has(svg.lucide-settings)',
      'Click Settings gear button in TitleBar',
      { timeout: 10_000 }
    );
    assertStep(settingsClick);

    const headingVisible = await safeExpectVisible(
      page,
      'h1:has-text("Settings")',
      'Settings page heading visible',
      { timeout: 10_000 }
    );
    assertStep(headingVisible);
  });

  test('settings page renders account section', async ({ page }) => {
    await page.locator('button:has(svg.lucide-settings)').click();
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 10_000 });

    const accountSection = await safeExpectVisible(
      page,
      'text=Account',
      'Account section visible'
    );
    assertStep(accountSection);

    const logoutBtn = await safeExpectVisible(
      page,
      'button:has-text("Logout")',
      'Logout button in settings visible'
    );
    assertStep(logoutBtn);
  });
});
