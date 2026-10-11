import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  getRelightRequests,
  installOfflineServer,
  installRelightMock,
} from '../../helpers/offline-server.helper';
import { closeTabByX, discardIfAsked } from '../../helpers/lifecycle.helper';

/**
 * Relight (AI) in the image editor.
 *
 * Flow under test (static/docs/iris/desktop/image/relight-design.md, Phase 1):
 *   AI menu → Relight → FloatingAIPanel hosts RelightPanel (data-testid="relight-panel")
 *   → relightImage() POST /api/iris/assets/generate (editMode "relight")
 *   → waitForEditResult() polls GET /api/iris/assets/:id
 *   → applyAIResultLayer() adds a canvas-sized "Relight" layer (one history entry).
 *
 * Safety: the generate call and the job polling are answered by installRelightMock, so no
 * credits are spent and fal is never called. When the cloud server is down, the offline
 * stand-in supplies an image to open the editor.
 *
 * Key selectors:
 *   - Menu: button "AI" → menu item "Relight"
 *   - Panel: [data-testid="relight-panel"], run button name starts with "Relight"
 *   - Layers: span.truncate with the layer name, opacity "NN%" under it
 */

const panelOf = (page: Page) => page.getByTestId('relight-panel');
const runButtonOf = (page: Page) => panelOf(page).getByRole('button', { name: /^Relight/ });
// Scoped to the Layers list (innermost container that holds the "Flatten All" button) so the
// history entry and the panel title, which are also named "Relight", are not counted.
const relightLayers = (page: Page) =>
  page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: /Flatten All/ }) })
    .last()
    .locator('span.truncate')
    .filter({ hasText: /^Relight$/ });
const railButton = (page: Page, label: string) =>
  page.locator('nav[aria-label="sidebar"] button').filter({ hasText: new RegExp(`^${label}$`) });

async function openImageEditor(page: Page): Promise<boolean> {
  // Always use the stand-in's built-in data: URL image (e2e-mock-image.png): the real gallery image
  // may never finish loading, and the stand-in is idempotent and only answers the asset list/get.
  await installOfflineServer(page);
  await railButton(page, 'Images').click();
  await expect(page.locator('button:has-text("Generate Image")')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2_000);
  const cards = page.locator('.aspect-square.rounded-xl.cursor-pointer');
  if ((await cards.count()) === 0) return false;
  await cards.first().click();
  await expect(page.locator('button').filter({ hasText: /^File$/ }).first()).toBeVisible({ timeout: 15_000 });
  // The full-screen "Loading image" overlay intercepts clicks until the canvas has the image.
  await expect(page.getByText('Loading image')).toHaveCount(0, { timeout: 30_000 });
  return true;
}

async function openRelightFromMenu(page: Page) {
  await page.locator('button').filter({ hasText: /^AI$/ }).first().click();
  await page.locator('button').filter({ hasText: /^Relight$/ }).first().click();
  await expect(panelOf(page)).toBeVisible({ timeout: 10_000 });
}

async function closeEditor(page: Page) {
  // Close the editor tab itself (Escape alone may only leave the AI mode), discard the Relight
  // edit if asked, then wait until the sidebar is usable so the next test starts from a known page.
  await page.keyboard.press('Escape');
  await closeTabByX(page, 'e2e-mock-image').catch(() => {});
  await discardIfAsked(page);
  await railButton(page, 'Home').click({ timeout: 10_000 }).catch(() => {});
  await expect(railButton(page, 'Images')).toBeEnabled({ timeout: 10_000 });
}

test.describe('Image editor Relight', () => {
  test.beforeEach(async ({ page }) => {
    await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
  });

  test('AI menu opens the Relight panel with presets, direction, color and cost', async ({ page }) => {
    test.skip(!(await openImageEditor(page)), 'No image in the gallery to open the editor with');
    await openRelightFromMenu(page);

    for (const name of ['Natural', 'Studio', 'Dramatic', 'Soft']) {
      await expect(panelOf(page).getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(panelOf(page).getByRole('group', { name: 'Light direction' })).toBeVisible();
    for (const name of ['Warm', 'Neutral', 'Cool', 'Neon']) {
      await expect(panelOf(page).getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(panelOf(page).getByLabel('Strength')).toBeVisible();
    await expect(runButtonOf(page)).toBeEnabled();
    await closeEditor(page);
  });

  test('sends the composed prompt and adds one undoable Relight layer', async ({ page }) => {
    test.skip(!(await openImageEditor(page)), 'No image in the gallery to open the editor with');
    await installRelightMock(page, { outcome: 'ready', pendingPolls: 1 });
    await openRelightFromMenu(page);
    const before = await relightLayers(page).count();

    await panelOf(page).getByRole('button', { name: 'Dramatic', exact: true }).click();
    await panelOf(page).getByRole('button', { name: 'Left', exact: true }).click();
    await panelOf(page).getByRole('button', { name: 'Warm', exact: true }).click();
    await panelOf(page).getByLabel('Strength').fill('60');
    await runButtonOf(page).click();

    // Merge dialog appears only for multi-layer documents.
    const merge = page.getByRole('button', { name: /Merge/i });
    if (await merge.isVisible({ timeout: 1_000 }).catch(() => false)) await merge.click();

    await expect(relightLayers(page)).toHaveCount(before + 1, { timeout: 30_000 });
    const requests = await getRelightRequests(page);
    expect(requests).toHaveLength(1);
    expect(requests[0].editMode).toBe('relight');
    expect(requests[0].prompt).toBe(
      'dramatic side lighting, strong shadows, cinematic mood, light coming from the left, warm golden light'
    );
    await expect(page.getByText('60%').first()).toBeVisible();

    await page.locator('button').filter({ hasText: /^Edit$/ }).first().click();
    await page.locator('button').filter({ hasText: /^Undo/ }).first().click();
    await expect(relightLayers(page)).toHaveCount(before, { timeout: 10_000 });
    await closeEditor(page);
  });

  test('shows the server error when the job fails', async ({ page }) => {
    test.skip(!(await openImageEditor(page)), 'No image in the gallery to open the editor with');
    await installRelightMock(page, { outcome: 'fail', pendingPolls: 0 });
    await openRelightFromMenu(page);
    await runButtonOf(page).click();
    const merge = page.getByRole('button', { name: /Merge/i });
    if (await merge.isVisible({ timeout: 1_000 }).catch(() => false)) await merge.click();

    await expect(panelOf(page).getByRole('alert')).toContainText('E2E relight failure', { timeout: 20_000 });
    await expect(runButtonOf(page)).toBeEnabled();
    await closeEditor(page);
  });

  test('Stop waiting ends the wait without adding a layer', async ({ page }) => {
    test.skip(!(await openImageEditor(page)), 'No image in the gallery to open the editor with');
    await installRelightMock(page, { outcome: 'hang' });
    await openRelightFromMenu(page);
    const before = await relightLayers(page).count();
    await runButtonOf(page).click();
    const merge = page.getByRole('button', { name: /Merge/i });
    if (await merge.isVisible({ timeout: 1_000 }).catch(() => false)) await merge.click();

    await panelOf(page).getByRole('button', { name: 'Stop waiting' }).click({ timeout: 10_000 });
    await expect(runButtonOf(page)).toBeEnabled({ timeout: 10_000 });
    await expect(panelOf(page).getByRole('alert')).toHaveCount(0);
    await expect(relightLayers(page)).toHaveCount(before);
    await closeEditor(page);
  });
});
