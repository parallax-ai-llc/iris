import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { readStore } from '../../helpers/shortcut.helper';
import {
  assertClean,
  currentPageId,
  goTo,
  preparePage,
  resetFocus,
  type ErrorLog,
} from '../../helpers/pages.helper';

/**
 * Basic-feature specs, part 4: the app shell around the pages.
 *   12 Settings   13 Assistant panel   14 Announcements / Bug report modals
 *   15 Window controls   16 Keyboard handling outside the editors
 *
 * Nothing is submitted: no bug report is sent, no assistant prompt is sent, no API key is saved.
 * Local preferences that a test flips (language, a notification toggle) are put back in `finally`.
 */

let errors: ErrorLog;

test.beforeEach(async ({ page }) => {
  errors = await preparePage(page);
});
test.afterEach(async ({ page }) => {
  await assertClean(page, errors);
});

const notImplemented = (what: string) =>
  test.info().annotations.push({ type: 'not-implemented', description: what });

const openSettings = async (page: Page) => {
  await page.locator('button[title="Settings"]').click();
  await expect(page.locator('h1').first()).toBeVisible();
  await expect.poll(() => currentPageId(page)).toBe('settings');
};

// ===================================================================== 12. settings

test.describe('12. Settings', () => {
  test('opens from the title-bar gear and renders every section', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    for (const title of ['Account', 'Storage', 'Notifications', 'Keyboard Shortcuts', 'About', 'Language', 'Workflow API Keys (BYOK)']) {
      await expect(page.locator(`h2:has-text("${title}")`).first(), `section "${title}"`).toBeVisible();
    }
  });

  test('tab switching', async ({ page }) => {
    await openSettings(page);
    if ((await page.locator('[role="tablist"]').count()) === 0) {
      notImplemented('Settings has no tabs: it is a single scrolling page of sections');
      return;
    }
    const tabs = page.locator('[role="tab"]');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('theme setting', async ({ page }) => {
    await openSettings(page);
    const theme = page.locator('text=/theme|dark mode|light mode/i');
    if ((await theme.count()) === 0) {
      notImplemented('Settings has no theme option');
      return;
    }
    await expect(theme.first()).toBeVisible();
  });

  test('language change updates the UI text, persists across a reload, and is restored', async ({ page }) => {
    await openSettings(page);
    const select = page.locator('section:has(h2:has-text("Language")) select');
    expect(await select.locator('option').count()).toBe(13);
    try {
      await select.selectOption('ko');
      await expect(page.locator('h1').first(), 'Settings title is translated').toHaveText('설정');
      const navTitle = await page.locator('nav button').first().getAttribute('title');
      expect(navTitle, 'sidebar tooltip is translated').not.toMatch(/^Home/);

      await page.reload();
      await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
      await page.locator('button[title="설정"], button[title="Settings"]').first().click();
      await expect(page.locator('h1').first(), 'language survives a restart').toHaveText('설정');
    } finally {
      await page.locator('section:has(h2) select').last().selectOption('en').catch(() => {});
    }
    await expect(page.locator('h1').first()).toHaveText('Settings');
  });

  test('keyboard-shortcut table matches the real keymap (Ctrl+, / Esc)', async ({ page }) => {
    await openSettings(page);
    const rows = await page.locator('section:has(h2:has-text("Keyboard Shortcuts")) .space-y-3 > div').allTextContents();
    expect(rows.length).toBeGreaterThanOrEqual(5);

    // "Ctrl , Open settings": works from any page
    await goTo(page, 'Home');
    await resetFocus(page);
    await page.keyboard.press('Control+,');
    await expect.poll(() => currentPageId(page)).toBe('settings');
  });

  test('documented "Ctrl+N: New generation" does something outside the editors', async ({ page }) => {
    await goTo(page, 'Images');
    const prompt = page.locator('.dt-sidepanel textarea').first();
    await prompt.fill('keep or clear me');
    await resetFocus(page);
    const before = await page.evaluate(() => document.body.innerHTML.length);
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(600);
    const reacted =
      (await prompt.inputValue()) !== 'keep or clear me' ||
      (await prompt.evaluate((el) => el === document.activeElement)) ||
      (await page.locator('[role="dialog"], .dt-modal, [class*="fixed"][class*="inset-0"]').count()) > 0 ||
      (await page.evaluate(() => document.body.innerHTML.length)) !== before;
    expect(reacted, 'Settings lists Ctrl+N "New generation" but the key does nothing on the Images page').toBe(true);
  });

  test('workflow API keys (BYOK) section renders the provider rows without exposing values', async ({ page }) => {
    await openSettings(page);
    const section = page.locator('section:has(h2:has-text("Workflow API Keys (BYOK)"))');
    await expect(section).toBeVisible();
    await expect(section.locator('button:has-text("Open .env")')).toBeVisible();
    const inputs = section.locator('input');
    expect(await inputs.count()).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(await inputs.count(), 5); i++) {
      expect(await inputs.nth(i).getAttribute('type')).toBe('password');
    }
  });

  test('local engine status is reachable from Settings / Workflows', async ({ page }) => {
    // The local engine has no dedicated settings screen: its health is the contract the BYOK section relies on.
    const base = await page.evaluate(() => (window as any).electronAPI.iris.getApiBaseUrl() as Promise<string>);
    expect(base).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+/);
    const ok = await page.evaluate(async (b) => (await fetch(`${b}/api/health`)).ok, base);
    expect(ok).toBe(true);
    notImplemented('no dedicated "local engine" settings screen (engine path/port/status); only the BYOK key section exists');
  });

  test('notification toggle flips, persists to the store and is restored', async ({ page }) => {
    await openSettings(page);
    const toggle = page.locator('section:has(h2:has-text("Notifications")) [role="switch"]').first();
    const was = (await toggle.getAttribute('aria-checked')) === 'true';
    try {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', String(!was));
      const stored = await page.evaluate(() => (window as any).electronAPI.storage.get('notifications') as Promise<Record<string, boolean>>);
      expect(Object.values(stored).includes(!was)).toBe(true);
    } finally {
      if ((await toggle.getAttribute('aria-checked')) === String(!was)) await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-checked', String(was));
  });

  test('cache size can be calculated', async ({ page }) => {
    await openSettings(page);
    await page.locator('button:text-is("Calculate")').click();
    await expect(page.locator('button:text-is("Calculate")')).toHaveCount(0);
    await expect(page.locator('text=/\\d+(\\.\\d+)? ?(B|KB|MB|GB|Bytes)/').first()).toBeVisible();
  });

  test('"Check for Updates" reports a result', async ({ page }) => {
    await openSettings(page);
    await page.locator('button:has-text("Check for Updates")').click();
    await expect(page.locator('text=You are on the latest version')).toBeVisible({ timeout: 6_000 });
    // SettingsPage.handleCheckUpdates is a 2 s timer, not a call to the updater IPC.
    notImplemented('Settings "Check for Updates" is simulated (fixed 2 s delay + "latest version" toast); it never asks the updater');
  });
});

// ===================================================================== 13. assistant panel

test.describe('13. Assistant panel', () => {
  const panel = (page: Page) => page.getByRole('region', { name: 'Assistant', exact: true });
  const prompt = (page: Page) => panel(page).getByRole('textbox', { name: 'Prompt' });
  const toggle = (page: Page) => page.getByTestId('assistant-toggle');

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('iris.assistant.open', 'false'));
    await page.reload();
    await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
    await goTo(page, 'Home');
    await expect(panel(page)).toHaveCount(0);
  });

  test('Ctrl+/ opens and closes the panel (button state follows)', async ({ page }) => {
    await resetFocus(page);
    await page.keyboard.press('Control+/');
    await expect(panel(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+/');
    await expect(panel(page)).toHaveCount(0);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the toggle button opens it and the prompt box takes focus', async ({ page }) => {
    await toggle(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(prompt(page), 'prompt textbox is focused on open').toBeFocused({ timeout: 3_000 });
  });

  test('typing in the prompt is not intercepted by global shortcuts; nothing is sent', async ({ page }) => {
    await goTo(page, 'Images');
    await toggle(page).click();
    await expect(prompt(page)).toBeVisible();
    await prompt(page).click();
    await page.keyboard.type('hello 123 /,');
    await page.keyboard.press('Control+3');
    await page.keyboard.press('Control+,');
    await expect(prompt(page)).toHaveValue('hello 123 /,');
    expect(await currentPageId(page)).toBe('images');
    // no message bubble was created
    expect(await panel(page).locator('[data-role="user"], .ast-msg-user').count()).toBe(0);
  });
});

// ===================================================================== 14. announcements + bug report

test.describe('14. Announcements and bug report modals', () => {
  const overlay = (page: Page) => page.locator('div.fixed.inset-0.z-50');

  test('announcements open from the bell and close with Esc', async ({ page }) => {
    await page.locator('button[title="Announcements"]').click();
    await expect(overlay(page).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay(page)).toHaveCount(0, { timeout: 3_000 });
  });

  test('announcements close with the backdrop and reopen on the first tab', async ({ page }) => {
    await page.locator('button[title="Announcements"]').click();
    await expect(overlay(page).first()).toBeVisible();
    await page.mouse.click(5, 300); // outside the right-hand panel
    await expect(overlay(page)).toHaveCount(0, { timeout: 3_000 });
    await page.locator('button[title="Announcements"]').click();
    await expect(overlay(page).first()).toBeVisible();
  });

  test('page shortcuts do not act underneath the open announcements modal', async ({ page }) => {
    await goTo(page, 'Images');
    await page.locator('button[title="Announcements"]').click();
    await expect(overlay(page).first()).toBeVisible();
    await resetFocus(page);
    await page.keyboard.press('Control+1');
    await page.waitForTimeout(400);
    expect(await currentPageId(page), 'Ctrl+1 must not navigate behind an open modal').toBe('images');
  });

  test('bug report opens, refuses an empty report, and Esc discards it (nothing is sent)', async ({ page }) => {
    await page.locator('button[title="Bug Report"]').click();
    const text = page.locator('textarea[placeholder="Please describe the bug..."]');
    await expect(text).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('button:has-text("Submit")')).toBeDisabled();

    await text.fill('e2e draft that must never be sent');
    const submit = page.locator('button:has-text("Submit")');
    if (await submit.isDisabled()) {
      // Submit needs a captured screenshot as well as text: without one the user cannot send a report.
      test.info().annotations.push({ type: 'note', description: 'Submit stays disabled with text typed (no screenshot captured in this window)' });
    }
    await page.keyboard.press('Escape');
    await expect(text).toHaveCount(0);

    await page.locator('button[title="Bug Report"]').click();
    await expect(text).toBeVisible({ timeout: 15_000 });
    await expect(text, 'draft is discarded on close').toHaveValue('');
    await page.keyboard.press('Escape');
  });
});

// ===================================================================== 15. window controls

test.describe('15. Window controls', () => {
  test('minimize and maximize buttons reach the main process', async ({ page, electronApp }) => {
    await electronApp.evaluate(({ ipcMain }) => {
      const g = globalThis as unknown as { __e2eWin?: Record<string, number> };
      g.__e2eWin = { minimize: 0, maximize: 0 };
      const map = (ipcMain as unknown as { _invokeHandlers?: Map<string, (...a: unknown[]) => unknown> })._invokeHandlers;
      for (const name of ['minimize', 'maximize']) {
        const orig = map?.get(`window:${name}`);
        if (map && orig) {
          map.set(`window:${name}`, (...a: unknown[]) => {
            g.__e2eWin![name]++;
            return orig(...a);
          });
        }
      }
    });
    const calls = () =>
      electronApp.evaluate(() => (globalThis as unknown as { __e2eWin: Record<string, number> }).__e2eWin);

    // maximize toggles window state (hidden window still reports it)
    const wasMax = await page.evaluate(() => (window as any).electronAPI.window.isMaximized() as Promise<boolean>);
    await page.locator('button[title="Maximize"]').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).electronAPI.window.isMaximized() as Promise<boolean>), { timeout: 5_000 })
      .toBe(!wasMax);
    await page.locator('button[title="Maximize"]').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).electronAPI.window.isMaximized() as Promise<boolean>), { timeout: 5_000 })
      .toBe(wasMax);

    await page.locator('button[title="Minimize"]').click();
    await page.waitForTimeout(500);
    await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w.isMinimized()) w.restore();
    });

    const c = await calls();
    if (c) {
      expect.soft(c.maximize, 'window:maximize invoked once per click').toBe(2);
      expect.soft(c.minimize, 'window:minimize invoked').toBe(1);
    }
  });

  test('close button is present and asks before discarding unsaved work (not clicked)', async ({ page }) => {
    // Clicking Close would quit the app under test; the dirty-state guard is covered by the editors' lifecycle specs.
    await expect(page.locator('button[title="Close"]')).toBeVisible();
    await expect(page.locator('button[title="Minimize"]')).toBeVisible();
    await expect(page.locator('button[title="Maximize"]')).toBeVisible();
  });
});

// ===================================================================== 16. keys outside the editors

test.describe('16. Keyboard handling outside the editors', () => {
  test('model dropdown: Esc closes it; arrow keys move through the options', async ({ page }) => {
    await goTo(page, 'Images');
    const trigger = page.locator('.dt-sidepanel label:text-is("Model") + div > button');
    await trigger.click();
    const menu = page.locator('.dt-sidepanel div.absolute.z-50');
    await expect(menu).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const movedByArrow = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && !!a.closest('div.absolute.z-50');
    });
    if (!movedByArrow) {
      notImplemented('ModelSelector dropdown has no arrow-key navigation (options are plain buttons, no listbox semantics)');
    }

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  const fields: Array<{ page: string; selector: string }> = [
    { page: 'Images', selector: 'input[placeholder="Search images..."]' },
    { page: 'Templates', selector: 'input[placeholder^="Search templates"]' },
    { page: 'Projects', selector: 'input[placeholder^="Search projects"]' },
  ];
  for (const f of fields) {
    test(`typing in the ${f.page} search field is not intercepted`, async ({ page }) => {
      await goTo(page, f.page);
      const before = await currentPageId(page);
      const input = page.locator(f.selector);
      await input.click();
      const text = 'a1b2 /,.nvmz0';
      await page.keyboard.type(text);
      await expect(input).toHaveValue(text);
      // modifier combos while a text field has focus must not navigate away or eat the text
      for (const combo of ['Control+3', 'Control+,', 'Control+0']) await page.keyboard.press(combo);
      await page.waitForTimeout(300);
      expect(await currentPageId(page)).toBe(before);
      await expect(input).toHaveValue(text);
      expect(await readStore(page, 'editorTabs', (s) => s.tabs.length as number)).toBe(0);
    });
  }
});
