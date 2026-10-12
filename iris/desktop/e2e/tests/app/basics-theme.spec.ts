import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { _electron as electron } from 'playwright';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

type Page = import('@playwright/test').Page;

type App = import('playwright').ElectronApplication;

/**
 * Screenshot an open surface under test-results/theme-light/ (reviewed by hand when the theme
 * changes). The E2E window is hidden and a hidden window only repaints when asked: invalidate
 * it first, or the picture can be a frame behind the DOM.
 */
const shot = async (app: App, page: Page, name: string) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.invalidate());
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test-results/theme-light/overlay-${name}.png` });
};

/** Computed text colour of the first match as "r,g,b". */
const colorOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const m = getComputedStyle(el).color.match(/[\d.]+/g) ?? [];
    return m.slice(0, 3).join(',');
  }, selector);

/** Tag the innermost element whose text is exactly `text` so contrastOf can address it. */
const tagText = (page: Page, text: string, attr: string) =>
  page.evaluate(
    ([t, a]) => {
      // innermost visible element whose whole text is `t` (icons inside are fine)
      const el = Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((n) => n.textContent?.trim() === t && n.getClientRects().length > 0)
        .pop();
      el?.setAttribute(a, '');
      return !!el;
    },
    [text, attr] as const,
  );

test('light theme: overlays, menus and panels are readable', async ({ page, electronApp }) => {
  try {
    await setStoredTheme(page, 'light');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
    await expect.poll(() => htmlTheme(page)).toBe('light');
    await page.evaluate(() => localStorage.setItem('iris.assistant.open', 'false'));
    // A hidden window barely advances CSS animations: a fade-in dialog can sit at half opacity in
    // the picture and the contrast reading. Show every surface in its final state.
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });

    // --- assistant panel (Ctrl+/)
    await goTo(page, 'Home');
    await page.keyboard.press('Control+/');
    const assistant = page.getByRole('region', { name: 'Assistant', exact: true });
    await expect(assistant).toBeVisible();
    await page.waitForTimeout(400);
    await shot(electronApp, page, 'assistant');
    expect.soft(await contrastOf(page, '.ast-head-surface'), 'assistant: header').toBeGreaterThanOrEqual(4.5);
    expect.soft(await contrastOf(page, '.ast-empty-title'), 'assistant: empty-state text').toBeGreaterThanOrEqual(4.5);
    const example = await contrastOf(page, '.ast-example');
    if (example > 0) expect.soft(example, 'assistant: example prompt').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Control+/');
    await expect(assistant).toBeHidden();

    // --- announcements modal
    await page.locator('button[title="Announcements"]').click();
    await expect(page.locator('.fixed.inset-y-0 button:has-text("Announcements")')).toBeVisible();
    // The drawer slides in on requestAnimationFrame, which a hidden window never runs: pin it open for the picture.
    const pin = await page.addStyleTag({ content: '.translate-x-full{translate:none!important;transform:none!important}.fixed.inset-0.opacity-0{opacity:1!important}' });
    await shot(electronApp, page, 'announcements');
    await pin.evaluate((n) => n.remove());
    expect.soft(await contrastOf(page, '.fixed.inset-y-0 p.text-sm'), 'announcements: intro text').toBeGreaterThanOrEqual(4.5);
    expect(await tagText(page, 'Blog', 'data-e2e-ann-tab')).toBe(true);
    expect.soft(await contrastOf(page, '[data-e2e-ann-tab]'), 'announcements: inactive tab').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // --- bug report modal (nothing is sent)
    await page.locator('button[title="Bug Report"]').click();
    await expect(page.locator('textarea[placeholder="Please describe the bug..."]')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(electronApp, page, 'bug-report');
    expect.soft(await contrastOf(page, '.dt-modal-title'), 'bug report: title').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // --- toast
    await page.evaluate(() =>
      (window as any).__ZUSTAND_STORES__.ui.getState().addNotification({ type: 'success', title: 'E2E toast text', duration: 0 }),
    );
    await expect(page.locator('text=E2E toast text')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(electronApp, page, 'toast');
    expect(await tagText(page, 'E2E toast text', 'data-e2e-toast')).toBe(true);
    expect.soft(await contrastOf(page, '[data-e2e-toast]'), 'toast: text').toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => (window as any).__ZUSTAND_STORES__.ui.getState().clearNotifications());

    // --- images: generation panel, model dropdown, card hover overlay, delete confirmation
    await goTo(page, 'Images');
    await expect.poll(() => page.locator('.dt-gallery p.truncate').count(), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    await shot(electronApp, page, 'images-panel');
    expect.soft(await contrastOf(page, '.dt-sidepanel label'), 'generation panel: label').toBeGreaterThanOrEqual(4.5);

    const trigger = page.locator('.dt-sidepanel label:text-is("Model") + div > button');
    await trigger.click();
    const listbox = page.locator('.dt-sidepanel [role="listbox"]');
    await expect(listbox).toBeVisible();
    await page.waitForTimeout(200);
    await shot(electronApp, page, 'model-dropdown');
    expect.soft(await contrastOf(page, '.dt-sidepanel [role="option"] span.text-sm'), 'model dropdown: option name').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();

    // photo overlays keep a dark scrim with white text in every theme
    const card = page.locator('.dt-gallery div.group.rounded-xl.overflow-hidden').first();
    await card.hover();
    await page.waitForTimeout(400);
    await shot(electronApp, page, 'card-hover');
    expect.soft(
      await colorOf(page, '.dt-gallery div.group.rounded-xl.overflow-hidden [data-theme="dark"] p.truncate'),
      'card overlay title stays white on the photo',
    ).toBe('255,255,255');

    await card.locator('button[title="Delete"]').click();
    await expect(page.locator('text=Delete Selected Images')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(electronApp, page, 'confirm-delete');
    expect.soft(await contrastOf(page, '#modal-title'), 'confirm: title').toBeGreaterThanOrEqual(4.5);
    expect.soft(await contrastOf(page, '[role="dialog"] p'), 'confirm: message').toBeGreaterThanOrEqual(4.5);
    expect(await tagText(page, 'Cancel', 'data-e2e-cancel')).toBe(true);
    expect.soft(await contrastOf(page, '[data-e2e-cancel]'), 'confirm: cancel button').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');
    await expect(page.locator('text=Delete Selected Images')).toBeHidden();

    // --- projects: card menu (the shell's context menu) and its delete confirmation (not confirmed)
    await goTo(page, 'Projects');
    await expect(page.locator('text=Alpha project').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('.dt-proj-title:text-is("Alpha project")').locator('xpath=../..').locator('button.we-iconbtn').first().click();
    const menuDelete = page.locator('.glass-strong button:has-text("Delete")').first();
    await expect(menuDelete).toBeVisible();
    await page.waitForTimeout(200);
    await shot(electronApp, page, 'project-menu');
    expect(await tagText(page, 'Duplicate', 'data-e2e-dup')).toBe(true);
    expect.soft(await contrastOf(page, '[data-e2e-dup]'), 'menu: item').toBeGreaterThanOrEqual(4.5);
    expect(await tagText(page, 'Delete', 'data-e2e-del')).toBe(true);
    expect.soft(await contrastOf(page, '[data-e2e-del]'), 'menu: destructive item').toBeGreaterThanOrEqual(4.5);
    await menuDelete.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(electronApp, page, 'project-delete-confirm');
    expect.soft(await contrastOf(page, '[role="dialog"] p'), 'project delete: message').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toBeHidden();

    // --- extension marketplace
    await goTo(page, 'Extensions');
    await expect(page.locator('h3:has-text("Extension Marketplace"), h1:has-text("Extension Marketplace")').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await shot(electronApp, page, 'extensions');
    const extBody = await contrastOf(page, 'main p');
    if (extBody > 0) expect.soft(extBody, 'extensions: body text').toBeGreaterThanOrEqual(4.5);

    // the marketplace's register form (opened, not submitted)
    await page.locator('main button:has-text("Register")').first().click();
    const submitTitle = page.locator('.fixed.inset-0 h2').first();
    await expect(submitTitle).toBeVisible();
    await shot(electronApp, page, 'extension-register');
    expect.soft(await contrastOf(page, '.fixed.inset-0 h2'), 'extension register: title').toBeGreaterThanOrEqual(4.5);
    expect.soft(await contrastOf(page, '.fixed.inset-0 label'), 'extension register: field label').toBeGreaterThanOrEqual(4.5);
    await page.locator('.fixed.inset-0 button:text-is("Cancel")').last().click();
    await expect(submitTitle).toBeHidden();
  } finally {
    await setStoredTheme(page, 'dark').catch(() => {});
  }
});

test('the native window background follows the theme (no dark frame on a light launch)', async ({ page, electronApp }) => {
  const nativeBg = () =>
    electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBackgroundColor().toLowerCase());
  try {
    await setStoredTheme(page, 'light');
    await expect.poll(nativeBg, { message: 'switching to light repaints the open window' }).toBe('#f8f9fa');
    await setStoredTheme(page, 'dark');
    await expect.poll(nativeBg).toBe('#09090b');

    // A fresh launch with Light saved creates the window light. QA_INSTANCE gives the second
    // app its own userData (os.tmpdir()/iris-qa-<n>) and skips the single-instance lock.
    const userData = path.join(os.tmpdir(), 'iris-qa-7');
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ 'app:theme': 'light' }));
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    delete env.ELECTRON_RUN_AS_NODE;
    env.NODE_ENV = 'development';
    env.TEST_MODE = 'true';
    env.QA_INSTANCE = '7';
    if (process.env.E2E_SHOW_WINDOW !== 'true') env.E2E_HIDE_WINDOW = 'true';
    const second = await electron.launch({ args: [path.resolve(__dirname, '../../../dist-electron/main.js')], env });
    try {
      await second.firstWindow();
      const bg = await second.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBackgroundColor().toLowerCase());
      expect(bg, 'window created with the light background').toBe('#f8f9fa');
    } finally {
      await second.close().catch(() => {});
      try {
        fs.rmSync(userData, { recursive: true, force: true });
      } catch {
        // a file still held by the closing app: the next run overwrites settings.json anyway
      }
    }
  } finally {
    await setStoredTheme(page, 'dark').catch(() => {});
  }
});
