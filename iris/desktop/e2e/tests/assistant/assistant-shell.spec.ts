import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { installOfflineServer, isServerDisconnected } from '../../helpers/offline-server.helper';

/**
 * Assistant shell E2E — the app-wide prompt panel ("프롬프트 메인" 셸).
 *
 * Layout under test (src/app/layout/ShellBody.tsx, AssistantDock.tsx):
 *   regular pages : [icon rail 60px][assistant panel][main]
 *   editors       : [assistant panel][editor]       (FullScreenLayout → ShellBody)
 *
 * Key selectors:
 *   - Panel      : <section aria-label="Assistant" data-surface="workspace|image-editor|video-editor">
 *   - Rail       : aside.dt-rail, nav[aria-label="sidebar"] (icon-only; label = sr-only text + title tooltip)
 *   - Main       : main.dt-main
 *   - Toggle     : [data-testid="assistant-toggle"], placed right before the Bell ("Announcements") button
 *   - Resize     : role=separator "Resize assistant panel" (clamp 280..560, double-click resets to 340)
 *   - Prefs      : localStorage iris.assistant.open / iris.assistant.width
 *
 * Safety: these tests never click an example chip (a chip click SENDS the prompt) and never run a
 * generation. The only message sent is a harmless one-sentence question that is aborted right away.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOT_DIR = path.resolve(__dirname, '../../test-results/assistant-shell');

const PANEL_MIN = 280;
const PANEL_MAX = 560;
const PANEL_DEFAULT = 340;

const panelOf = (page: Page) => page.getByRole('region', { name: 'Assistant', exact: true });
const toggleOf = (page: Page) => page.getByTestId('assistant-toggle');
const bellOf = (page: Page) => page.locator('button[title="Announcements"]');
const railOf = (page: Page) => page.locator('aside.dt-rail');
const mainOf = (page: Page) => page.locator('main.dt-main');
const promptOf = (page: Page) => panelOf(page).getByRole('textbox', { name: 'Prompt' });
const resizeOf = (page: Page) =>
  page.getByRole('separator', { name: 'Resize assistant panel' });
const railButton = (page: Page, label: string) =>
  page.locator('nav[aria-label="sidebar"] button').filter({ hasText: new RegExp(`^${label}$`) });

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'element must have a bounding box').not.toBeNull();
  return b!;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
}

/** Known panel state for every test: open, default width. Electron instances share localStorage. */
async function resetPanelPrefs(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('iris.assistant.open', 'true');
    localStorage.removeItem('iris.assistant.width');
  });
  await page.reload();
  await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
  await railButton(page, 'Home').click();
  await expect(panelOf(page)).toBeVisible({ timeout: 10_000 });
  // checkAuth() finishes after first paint: until then the panel shows the sign-in notice.
  await expect(railOf(page).locator('.dt-chip')).toBeVisible({ timeout: 20_000 });
  await expect(panelOf(page).locator('.ast-blocked')).toHaveCount(0, { timeout: 10_000 });
}

/** Editors need the cloud server; when it is down, answer the few calls needed to open them. */
async function stubServerIfDown(page: Page) {
  if (await isServerDisconnected(page)) await installOfflineServer(page);
}

async function openImageEditor(page: Page): Promise<boolean> {
  await stubServerIfDown(page);
  await railButton(page, 'Images').click();
  await expect(page.locator('button:has-text("Generate Image")')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2_000);
  const cards = page.locator('.aspect-square.rounded-xl.cursor-pointer');
  if ((await cards.count()) === 0) return false;
  await cards.first().click();
  await expect(page.locator('button').filter({ hasText: /^File$/ }).first()).toBeVisible({
    timeout: 15_000,
  });
  return true;
}

async function openVideoEditor(page: Page): Promise<boolean> {
  await stubServerIfDown(page);
  await railButton(page, 'Projects').click();
  const heading = page.locator('h1:has-text("Video projects")');
  const overlay = page.locator('text=Server Connection Required');
  await expect(heading.or(overlay)).toBeVisible({ timeout: 10_000 });
  if (await overlay.isVisible().catch(() => false)) return false;

  await page.locator('button:has-text("New project")').first().click();
  const nameInput = page.locator('input[placeholder="Untitled Project"]');
  await expect(nameInput).toBeVisible({ timeout: 10_000 });
  await nameInput.fill('E2E Assistant Shell');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page
    .locator('text=Loading project...')
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => {});
  await expect(page.locator('button').filter({ hasText: /^File$/ }).first()).toBeVisible({
    timeout: 20_000,
  });
  return true;
}

test.describe('Assistant shell', () => {
  test.beforeEach(async ({ page }) => {
    await resetPanelPrefs(page);
  });

  test('home: panel sits between the icon rail and main, toggle sits next to Bell', async ({
    page,
  }) => {
    const rail = await box(railOf(page));
    const panel = await box(panelOf(page));
    const main = await box(mainOf(page));

    // Order left → right: rail, panel, main (1px tolerance for borders).
    expect(rail.x + rail.width).toBeLessThanOrEqual(panel.x + 1);
    expect(panel.x + panel.width).toBeLessThanOrEqual(main.x + 1);
    // Rail is the narrow icon-only column.
    expect(rail.width).toBeLessThanOrEqual(80);
    expect(Math.round(panel.width)).toBe(PANEL_DEFAULT);

    // Title bar: Assistant toggle immediately before Bell.
    const toggle = await box(toggleOf(page));
    const bell = await box(bellOf(page));
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(bell.x + 1);
    expect(bell.x - (toggle.x + toggle.width)).toBeLessThan(16);
    expect(Math.abs(toggle.y + toggle.height / 2 - (bell.y + bell.height / 2))).toBeLessThan(4);
    const adjacent = await toggleOf(page).evaluate(
      (el) => (el.nextElementSibling as HTMLElement | null)?.getAttribute('title') ?? null
    );
    expect(adjacent).toBe('Announcements');

    // Rail is icon-only: labels live in the title tooltip and sr-only text.
    await expect(railButton(page, 'Images')).toHaveAttribute('title', /Images/);
    await expect(page.locator('text=Ready to create something amazing?')).toBeVisible();

    await shot(page, '01-home-panel-open');
  });

  test('toggle button, Ctrl+/ and the close button open/close the panel; state survives a reload', async ({
    page,
    modifier,
  }) => {
    const panel = panelOf(page);
    const toggle = toggleOf(page);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Toggle button closes ...
    await toggle.click();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // ... main stretches to the rail.
    const rail = await box(railOf(page));
    const main = await box(mainOf(page));
    expect(Math.abs(main.x - (rail.x + rail.width))).toBeLessThanOrEqual(2);
    await shot(page, '02-home-panel-closed');

    // ... and opens again.
    await toggle.click();
    await expect(panel).toBeVisible();

    // Keyboard shortcut (Ctrl+/ , Cmd+/ on macOS).
    await page.locator('main.dt-main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(`${modifier}+/`);
    await expect(panel).toBeHidden();
    await page.keyboard.press(`${modifier}+/`);
    await expect(panel).toBeVisible();

    // Close button inside the panel.
    await panel.getByRole('button', { name: 'Close assistant' }).click();
    await expect(panel).toBeHidden();

    // Closed state is persisted across a reload ...
    expect(await page.evaluate(() => localStorage.getItem('iris.assistant.open'))).toBe('false');
    await page.reload();
    await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
    await expect(panel).toBeHidden();
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'false');

    // ... and so is the open state.
    await toggleOf(page).click();
    await expect(panel).toBeVisible();
    await page.reload();
    await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
    await expect(panelOf(page)).toBeVisible({ timeout: 10_000 });
  });

  test('dragging the right edge resizes the panel within 280..560, double-click resets', async ({
    page,
  }) => {
    const panel = panelOf(page);
    const dragHandleBy = async (dx: number) => {
      const handle = await box(resizeOf(page));
      const startX = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(startX + dx / 2, y, { steps: 5 });
      await page.mouse.move(startX + dx, y, { steps: 5 });
      await page.mouse.up();
    };

    expect(Math.round((await box(panel)).width)).toBe(PANEL_DEFAULT);

    // +100 px → 440 (within range).
    await dragHandleBy(100);
    await expect.poll(async () => Math.round((await box(panel)).width)).toBe(PANEL_DEFAULT + 100);
    expect(await page.evaluate(() => localStorage.getItem('iris.assistant.width'))).toBe(
      String(PANEL_DEFAULT + 100)
    );

    // Far right → clamped to max.
    await dragHandleBy(600);
    await expect.poll(async () => Math.round((await box(panel)).width)).toBe(PANEL_MAX);

    // Far left → clamped to min.
    await dragHandleBy(-900);
    await expect.poll(async () => Math.round((await box(panel)).width)).toBe(PANEL_MIN);

    // The main column keeps up with the panel edge.
    const p = await box(panel);
    const main = await box(mainOf(page));
    expect(p.x + p.width).toBeLessThanOrEqual(main.x + 1);

    // Double-click on the handle restores the default.
    await resizeOf(page).dblclick();
    await expect.poll(async () => Math.round((await box(panel)).width)).toBe(PANEL_DEFAULT);
  });

  test('rail icons navigate (title / sr-only label) while the panel and its draft stay', async ({
    page,
  }) => {
    const draft = 'draft that must survive navigation';
    const input = promptOf(page);
    await expect(input).toBeVisible();
    const canType = await input.isEnabled();

    if (canType) {
      await input.fill(draft);
    }
    const panelBefore = await box(panelOf(page));

    const targets: Array<{ label: string; marker: string }> = [
      { label: 'Images', marker: 'button:has-text("Generate Image")' },
      { label: 'Videos', marker: 'h1:has-text("Video Gallery")' },
      { label: 'Projects', marker: 'h1:has-text("Video projects")' },
      { label: 'Workflows', marker: 'h1:has-text("Workflows")' },
      { label: 'Batch', marker: 'h1:has-text("Batch jobs")' },
      { label: 'Home', marker: 'text=Ready to create something amazing?' },
    ];

    for (const { label, marker } of targets) {
      const btn = railButton(page, label);
      await expect(btn).toHaveAttribute('title', new RegExp(label));
      await btn.click();
      await expect(page.locator(marker).first()).toBeVisible({ timeout: 10_000 });
      await expect(btn).toHaveAttribute('data-active', 'true');

      // Panel unchanged: same place, same width, same surface, same draft.
      const panel = panelOf(page);
      await expect(panel).toBeVisible();
      const now = await box(panel);
      expect(Math.round(now.x)).toBe(Math.round(panelBefore.x));
      expect(Math.round(now.width)).toBe(Math.round(panelBefore.width));
      await expect(panel).toHaveAttribute('data-surface', 'workspace');
      if (canType) {
        await expect(promptOf(page)).toHaveValue(draft);
      }
    }
  });

  test('workspace surface: label, example chips, Shift+Enter and send/abort', async ({ page }) => {
    const panel = panelOf(page);
    await expect(panel).toHaveAttribute('data-surface', 'workspace');
    await expect(panel.locator('.ast-head-surface')).toHaveText('Workspace');

    const input = promptOf(page);
    if (!(await input.isEnabled())) {
      // Blocked build (self-host) — only the notice is shown, no chips.
      await expect(panel.locator('.ast-blocked')).toBeVisible();
      test.skip(true, 'assistant is blocked in this build/session');
      return;
    }

    // Empty state with example chips (never click them: a chip click sends the prompt).
    await expect(panel.getByText('What do you want to make?')).toBeVisible();
    await expect(panel.locator('.ast-example')).toHaveCount(3);
    await expect(
      panel.getByRole('button', {
        name: 'Generate a product photo of a ceramic mug on a wooden table',
      })
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Make a 5 second video of waves at sunset' })).toBeVisible();

    // Send is disabled while empty; Shift+Enter adds a line instead of sending.
    const send = panel.getByRole('button', { name: 'Send' });
    await expect(send).toBeDisabled();
    await input.click();
    await page.keyboard.type('first line');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second line');
    await expect(input).toHaveValue('first line\nsecond line');
    await expect(send).toBeEnabled();
    await expect(panel.locator('.ast-msg')).toHaveCount(0);

    // Replace with a harmless question, send with Enter, abort right away.
    await input.fill('Reply with one short greeting sentence. Do not perform any action.');
    await page.keyboard.press('Enter');
    await expect(panel.locator('.ast-msg[data-role="user"]').first()).toContainText(
      'Reply with one short greeting sentence',
      { timeout: 5_000 }
    );
    await expect(input).toHaveValue('');
    await expect(panel.locator('.ast-examples')).toHaveCount(0);

    const stop = panel.getByRole('button', { name: 'Stop' });
    if (await stop.isVisible().catch(() => false)) {
      await stop.click();
    }
    await expect(stop).toBeHidden({ timeout: 10_000 });
    await expect(panel.getByRole('button', { name: 'Clear conversation' })).toBeVisible();
  });

  test('image editor: panel on the left of the editor, titlebar Bell + toggle, no old AI Assistant UI', async ({
    page,
  }) => {
    const opened = await openImageEditor(page);
    if (!opened) {
      test.skip(true, 'no images in the gallery, so the image editor cannot be opened');
      return;
    }

    const panel = panelOf(page);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-surface', 'image-editor');
    await expect(panel.locator('.ast-head-surface')).toHaveText('Image editor');

    // Editor is to the right of the panel; there is no icon rail.
    // The menu bar lives in the title bar (full width, above the panel), so compare against
    // the editor body: the tool panel's first button.
    const editorBody = page.locator('button.w-8.h-8').first();
    await expect(editorBody).toBeVisible();
    const p = await box(panel);
    const body = await box(editorBody);
    expect(p.x + p.width).toBeLessThanOrEqual(body.x + 1);
    expect(p.x).toBeLessThanOrEqual(2);
    await expect(railOf(page)).toHaveCount(0);

    // Titlebar keeps Bell and toggle in the editor.
    await expect(toggleOf(page)).toBeVisible();
    await expect(bellOf(page)).toBeVisible();

    // Example chips for this surface (not clicked).
    if (await promptOf(page).isEnabled()) {
      await expect(panel.getByText('What should we change in this image?')).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Remove the background' })).toBeVisible();
    }

    // The old bottom "AI Assistant" chat panel is gone.
    await expect(page.getByText('AI Assistant')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /AI Assistant/ })).toHaveCount(0);

    await page
      .getByText('Loading image')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});
    await shot(page, '03-image-editor');

    // Toggle closes the panel and the editor takes the space.
    await toggleOf(page).click();
    await expect(panel).toBeHidden();
    const bodyAfter = await box(editorBody);
    expect(bodyAfter.x).toBeLessThan(body.x);
  });

  test('video editor: panel on the left of the editor, titlebar Bell + toggle, no old AI Assistant UI', async ({
    page,
  }) => {
    const opened = await openVideoEditor(page);
    if (!opened) {
      test.skip(true, 'server not reachable, so a video project cannot be created');
      return;
    }

    const panel = panelOf(page);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-surface', 'video-editor');
    await expect(panel.locator('.ast-head-surface')).toHaveText('Video editor');

    // Menu bar is in the title bar; compare against the media panel tab instead.
    const mediaTab = page.locator('button:has-text("Media")').first();
    await expect(mediaTab).toBeVisible();
    const p = await box(panel);
    const media = await box(mediaTab);
    expect(p.x + p.width).toBeLessThanOrEqual(media.x + 1);
    expect(p.x).toBeLessThanOrEqual(2);
    await expect(railOf(page)).toHaveCount(0);

    await expect(toggleOf(page)).toBeVisible();
    await expect(bellOf(page)).toBeVisible();

    if (await promptOf(page).isEnabled()) {
      await expect(panel.getByText('What should we do with this video?')).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Remove the silent parts' })).toBeVisible();
    }

    // The old titlebar "AI Assistant" button and right chat panel are gone.
    await expect(page.getByText('AI Assistant')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /AI Assistant/ })).toHaveCount(0);

    await shot(page, '04-video-editor');
  });
});
