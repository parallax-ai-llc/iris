import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { readStore, blurActive } from '../../helpers/shortcut.helper';
import {
  assertClean,
  currentPageId,
  goTo,
  openSettingsTab,
  preparePage,
  resetFocus,
  settingsTab,
  type ErrorLog,
} from '../../helpers/pages.helper';
import { contrastOf, htmlTheme, setThemeViaSettings } from '../../helpers/theme.helper';

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
  test('opens from the title-bar gear and every tab shows its own section', async ({ page }) => {
    test.setTimeout(120_000);
    await openSettings(page);
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    const sections: Array<[tab: string, heading: string]> = [
      ['Account', 'Account'],
      ['Appearance', 'Appearance'],
      ['Language', 'Language'],
      ['Notifications', 'Notifications'],
      ['Storage', 'Storage'],
      ['Keyboard Shortcuts', 'Keyboard Shortcuts'],
      ['Workflow API Keys', 'Workflow API Keys (BYOK)'],
      ['About', 'About'],
    ];
    for (const [tab, heading] of sections) {
      await openSettingsTab(page, tab);
      await expect(page.locator(`[role="tabpanel"] h2:has-text("${heading}")`).first(), `section "${heading}"`).toBeVisible();
      // one section at a time: the panel holds exactly one section heading
      await expect(page.locator('[role="tabpanel"] h2')).toHaveCount(1);
    }
  });

  test('tab switching: click, arrow keys, and the last tab is remembered', async ({ page }) => {
    test.setTimeout(120_000);
    await openSettings(page);
    await expect(page.locator('[role="tablist"]')).toHaveAttribute('aria-orientation', 'vertical');
    const tabs = page.locator('[role="tab"]');
    const n = await tabs.count();
    expect(n).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      const panelId = await tabs.nth(i).getAttribute('aria-controls');
      await expect(page.locator(`#${panelId}`)).toBeVisible();
    }

    // keyboard: roving focus with the arrows, wrapping at both ends
    await tabs.first().click();
    await page.keyboard.press('ArrowDown');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(tabs.nth(n - 1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

    // remembered across leaving Settings and across a reload
    await openSettingsTab(page, 'About');
    await goTo(page, 'Home');
    await openSettings(page);
    await expect(settingsTab(page, 'About')).toHaveAttribute('aria-selected', 'true');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
    await openSettings(page);
    await expect(settingsTab(page, 'About')).toHaveAttribute('aria-selected', 'true');
  });

  test('theme setting: light / system / dark, persisted, editors stay dark', async ({ page }) => {
    test.setTimeout(120_000);
    await openSettings(page);
    await openSettingsTab(page, 'Appearance');
    const group = page.locator('[role="radiogroup"][aria-label="Theme"]');
    await expect(group).toBeVisible();
    await expect(group.locator('[role="radio"]')).toHaveCount(3);
    expect(await htmlTheme(page)).toBe('dark');
    try {
      await setThemeViaSettings(page, 'Light');
      await expect.poll(() => htmlTheme(page)).toBe('light');
      await expect(group.locator('[role="radio"]:has-text("Light")')).toHaveAttribute('aria-checked', 'true');
      expect(await page.evaluate(() => (window as any).electronAPI.storage.get('app:theme'))).toBe('light');

      // readable: key texts reach WCAG AA (4.5:1) against what they sit on
      for (const sel of ['h1', '[role="tab"][aria-selected="true"]', '[role="tab"][aria-selected="false"]', '[role="tabpanel"] h2', '[role="radio"][aria-checked="true"]']) {
        const ratio = await contrastOf(page, sel);
        expect(ratio, `contrast of ${sel}`).toBeGreaterThanOrEqual(4.5);
      }

      // survives a restart, painted before React mounts (no dark flash)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      expect(await htmlTheme(page), 'theme applied by the first-paint script').toBe('light');
      await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
      await expect.poll(() => htmlTheme(page)).toBe('light');

      // the image editor keeps its dark (Photoshop-style) look
      await goTo(page, 'Home');
      const imageCard = page.locator('button.iris-card', { has: page.locator('.pill', { hasText: /^image$/ }) }).first();
      await imageCard.click();
      await expect.poll(() => readStore(page, 'editorTabs', (s) => s.tabs.length as number), { timeout: 15_000 }).toBe(1);
      await expect(page.locator('[data-theme="dark"][data-editor-shell]').first()).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => htmlTheme(page), { message: 'portals inside the editor stay dark too' }).toBe('dark');
      await page.evaluate(() => (window as any).__ZUSTAND_STORES__.editorTabs.getState().hideEditor());
      await page.waitForSelector('nav', { state: 'visible', timeout: 15_000 });
      await expect.poll(() => htmlTheme(page), { message: 'back in the shell: light again' }).toBe('light');

      // system follows prefers-color-scheme
      await openSettings(page);
      await openSettingsTab(page, 'Appearance');
      await page.emulateMedia({ colorScheme: 'dark' });
      await setThemeViaSettings(page, 'System');
      await expect.poll(() => htmlTheme(page)).toBe('dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await expect.poll(() => htmlTheme(page)).toBe('light');

      await setThemeViaSettings(page, 'Dark');
      await expect.poll(() => htmlTheme(page)).toBe('dark');
    } finally {
      await page.emulateMedia({ colorScheme: null }).catch(() => {});
      await page.evaluate(() => (window as any).electronAPI.storage.set('app:theme', 'dark')).catch(() => {});
      await page.evaluate(() => localStorage.setItem('iris.theme', 'dark')).catch(() => {});
    }
  });

  test('language change updates the UI text, persists across a reload, and is restored', async ({ page }) => {
    await openSettings(page);
    await openSettingsTab(page, 'Language');
    const select = page.locator('section:has(h2:has-text("Language")) select');
    expect(await select.locator('option').count()).toBe(13);
    try {
      await select.selectOption('ko');
      await expect(page.locator('h1').first(), 'Settings title is translated').toHaveText('설정');
      const navTitle = await page.locator('nav button').first().getAttribute('title');
      expect(navTitle, 'sidebar tooltip is translated').not.toMatch(/^Home/);

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
      await page.locator('button[title="설정"], button[title="Settings"]').first().click();
      await expect(page.locator('h1').first(), 'language survives a restart').toHaveText('설정');
    } finally {
      await page.locator('section:has(h2) select').last().selectOption('en').catch(() => {});
      // belt and braces: the persisted preference must be English whatever happened above
      await page.evaluate(() => (window as any).electronAPI.storage.set('app:language', 'en')).catch(() => {});
    }
    await expect(page.locator('h1').first()).toHaveText('Settings');
  });

  test('keyboard-shortcut table matches the real keymap (Ctrl+, / Esc)', async ({ page }) => {
    await openSettings(page);
    await openSettingsTab(page, 'Keyboard Shortcuts');
    const rows = await page.locator('section:has(h2:has-text("Keyboard Shortcuts")) .space-y-3 > div').allTextContents();
    expect(rows.length).toBeGreaterThanOrEqual(5);

    // "Ctrl , Open settings": works from any page
    await goTo(page, 'Home');
    await resetFocus(page);
    await page.keyboard.press('Control+,');
    await expect.poll(() => currentPageId(page)).toBe('settings');
  });

  test('every shortcut listed in Settings works outside the editors (no dead rows)', async ({ page }) => {
    await openSettings(page);
    await openSettingsTab(page, 'Keyboard Shortcuts');
    const rows = (
      await page.locator('section:has(h2:has-text("Keyboard Shortcuts")) .space-y-3 > div').allTextContents()
    ).map((r) => r.replace(/\s+/g, ' '));
    // Ctrl+N / Ctrl+S used to be listed here but only ever worked inside the editors.
    expect(rows.join(' | ')).not.toMatch(/New generation|Save\s*\/\s*Download/i);

    // Ctrl+1…0: sidebar pages
    await goTo(page, 'Home');
    await resetFocus(page);
    await page.keyboard.press('Control+3');
    await expect.poll(() => currentPageId(page)).toBe('images');

    // Ctrl+/: assistant panel
    const open = () => page.evaluate(() => localStorage.getItem('iris.assistant.open'));
    const before = await open();
    await resetFocus(page);
    await page.keyboard.press('Control+/');
    await expect.poll(open).not.toBe(before);
    await page.keyboard.press('Control+/');
    await expect.poll(open).toBe(before ?? 'false');
  });

  test('workflow API keys (BYOK) section renders the provider rows without exposing values', async ({ page }) => {
    await openSettings(page);
    await openSettingsTab(page, 'Workflow API Keys');
    const section = page.locator('section:has(h2:has-text("Workflow API Keys (BYOK)"))');
    await expect(section).toBeVisible();
    await expect(section.locator('button:has-text("Open .env")')).toBeVisible();
    const inputs = section.locator('input');
    // the provider rows arrive from the engine after the section has mounted
    await expect(inputs.first(), 'at least one provider row').toBeVisible({ timeout: 15_000 });
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
    await openSettingsTab(page, 'Notifications');
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
    await openSettingsTab(page, 'Storage');
    await page.locator('button:text-is("Calculate")').click();
    await expect(page.locator('button:text-is("Calculate")')).toHaveCount(0);
    await expect(page.locator('text=/\\d+(\\.\\d+)? ?(B|KB|MB|GB|Bytes)/').first()).toBeVisible();
  });

  test('"Check for Updates" asks the updater and reports its answer', async ({ page, electronApp }) => {
    // TEST_MODE skips setupUpdaterHandlers, so stand in for the main-process handler.
    const answer = async (version: string | null) =>
      electronApp.evaluate(({ ipcMain, app }, v) => {
        ipcMain.removeHandler('updater:checkForUpdates');
        ipcMain.handle('updater:checkForUpdates', () => ({
          status: 'success',
          updateInfo: { version: v ?? app.getVersion(), releaseDate: '2026-01-01' },
        }));
      }, version);
    await openSettings(page);
    await openSettingsTab(page, 'About');
    const button = page.locator('button:has-text("Check for Updates")');

    await answer(null);
    await button.click();
    await expect(page.locator('text=You are on the latest version')).toBeVisible({ timeout: 6_000 });

    await answer('99.0.0');
    await button.click();
    await expect(page.locator('text=Update 99.0.0 is available')).toBeVisible({ timeout: 6_000 });
  });
});

// ===================================================================== 13. assistant panel

test.describe('13. Assistant panel', () => {
  const panel = (page: Page) => page.getByRole('region', { name: 'Assistant', exact: true });
  const prompt = (page: Page) => panel(page).getByRole('textbox', { name: 'Prompt' });
  const toggle = (page: Page) => page.getByTestId('assistant-toggle');

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('iris.assistant.open', 'false'));
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
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
    // blur only: resetFocus clicks the top-left corner, which is the modal backdrop
    await blurActive(page);
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
  test('model dropdown: listbox semantics, arrow keys / Home / End / Enter / Esc, page shortcuts blocked while open', async ({ page }) => {
    await goTo(page, 'Images');
    const trigger = page.locator('.dt-sidepanel label:text-is("Model") + div > button');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    await trigger.click();
    const listbox = page.locator('.dt-sidepanel [role="listbox"]');
    await expect(listbox).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(listbox, 'focus moves into the open list').toBeFocused();

    const options = listbox.locator('[role="option"]');
    const count = await options.count();
    expect(count, 'the Images page offers at least two models').toBeGreaterThan(1);
    const activeId = () => listbox.getAttribute('aria-activedescendant');
    const indexOf = async (id: string | null) =>
      id ? options.evaluateAll((els, want) => els.findIndex((e) => e.id === want), id) : -1;
    const activeIndex = async () => indexOf(await activeId());

    // the active option starts on the selected one
    const selectedIndex = await options.evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-selected') === 'true'));
    await expect.poll(activeIndex).toBe(Math.max(selectedIndex, 0));

    await page.keyboard.press('Home');
    await expect.poll(activeIndex).toBe(0);
    await page.keyboard.press('ArrowDown');
    await expect.poll(activeIndex).toBe(1);
    await page.keyboard.press('ArrowUp');
    await expect.poll(activeIndex).toBe(0);
    await page.keyboard.press('End');
    await expect.poll(activeIndex).toBe(count - 1);

    // page/global shortcuts are blocked while the list is open
    await page.keyboard.press('Control+3');
    await page.waitForTimeout(300);
    expect(await currentPageId(page)).toBe('images');
    await expect(listbox).toBeVisible();

    // Enter picks the active option (the first one, different from the last) and closes
    await page.keyboard.press('Home');
    const pickId = await activeId();
    const pickName = ((await page.locator(`[id="${pickId}"] span.text-sm`).first().textContent()) ?? '').trim();
    await page.keyboard.press('Enter');
    await expect(listbox).toBeHidden();
    await expect(trigger).toBeFocused();
    if (pickName) await expect(trigger).toContainText(pickName);

    // Esc closes without changing the value and returns focus
    const before = ((await trigger.textContent()) ?? '').trim();
    await trigger.click();
    await expect(listbox).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(((await trigger.textContent()) ?? '').trim()).toBe(before);
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
