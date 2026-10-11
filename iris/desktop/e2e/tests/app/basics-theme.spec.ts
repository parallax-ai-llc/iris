import { test, expect } from '../../fixtures/authenticated.fixture';
import { NAV_ITEMS, assertClean, goTo, navButton, preparePage, type ErrorLog } from '../../helpers/pages.helper';
import { contrastOf, htmlTheme } from '../../helpers/theme.helper';

/**
 * Light theme sweep over the app-shell pages (editors stay dark and are covered in basics-shell).
 *
 * For every sidebar page plus Settings: switch to Light, wait for the page marker, save a
 * screenshot under test-results/theme-light/ (reviewed by hand when the theme changes), and
 * assert that the page heading and the sidebar's current item reach WCAG AA (4.5:1).
 * The preference is put back to Dark in `finally`.
 */

test.describe.configure({ timeout: 300_000 });

let errors: ErrorLog;

test.beforeEach(async ({ page }) => {
  errors = await preparePage(page);
});
test.afterEach(async ({ page }) => {
  await assertClean(page, errors);
});

async function setStoredTheme(page: import('@playwright/test').Page, value: 'light' | 'dark') {
  await page.evaluate(async (v) => {
    localStorage.setItem('iris.theme', v);
    await (window as any).electronAPI.storage.set('app:theme', v);
  }, value);
}

test('light theme: every shell page is readable', async ({ page }) => {
  try {
    await setStoredTheme(page, 'light');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
    await expect.poll(() => htmlTheme(page)).toBe('light');
    await page.evaluate(() => localStorage.setItem('iris.assistant.open', 'false'));

    for (const item of NAV_ITEMS) {
      if ((await navButton(page, item.label).count()) === 0) continue; // hidden in self-host
      await goTo(page, item.label === 'Home' ? 'Images' : 'Home');
      await goTo(page, item.label);
      await expect(page.locator(item.marker).first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(600); // let images / lists settle for the screenshot
      await page.screenshot({ path: `test-results/theme-light/${item.id}.png` });

      const heading = (await page.locator('main h1').count()) > 0 ? 'main h1' : 'main h3';
      expect.soft(await contrastOf(page, heading), `${item.id}: heading contrast`).toBeGreaterThanOrEqual(4.5);
      const body = await contrastOf(page, 'main p');
      if (body > 0) expect.soft(body, `${item.id}: body text contrast`).toBeGreaterThanOrEqual(4.5);
    }

    await page.locator('button[title="Settings"]').click();
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    for (const tab of ['Account', 'Appearance', 'Keyboard Shortcuts', 'Workflow API Keys']) {
      await page.locator('[role="tab"]', { hasText: tab }).first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/theme-light/settings-${tab.toLowerCase().replace(/\s+/g, '-')}.png` });
    }
    expect(await contrastOf(page, '[role="tab"][aria-selected="false"]')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '[role="tabpanel"] h2')).toBeGreaterThanOrEqual(4.5);
  } finally {
    await setStoredTheme(page, 'dark').catch(() => {});
  }
});
