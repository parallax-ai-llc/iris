import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeFill,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Video Editor E2E tests — 비디오 에디터 핵심 기능 테스트.
 *
 * 흐름: Projects 페이지 → New project → 모달에서 이름/해상도 선택 → Create → 에디터 열림
 *
 * Key selectors (VideoEditor.tsx, VideoEditorMenuBar.tsx, EditorTimeline.tsx):
 *   - Menu bar: "File", "Edit", "View", "Subtitles", "AI" (+ "Tools" only when opened from an asset)
 *   - File menu items: "New Project...", "Open Project...", "Save Project", "Save Project As...", "Go Back"
 *   - Left panel tabs: "Media", "Effects", "Color", "History", "Text"
 *   - Preview area: video preview + subtitle overlay
 *   - Timeline: track headers, clips, playhead, "Add track" button (aria-label)
 *   - Playback controls: play/pause, speed, split, snap
 *   - Inspector (right panel): selected clip properties
 *   - New project modal: input[placeholder="Untitled Project"], resolution presets, Create button
 */

test.describe('Video Editor - Full', () => {
  /**
   * Helper: Create a new project and wait for editor to load.
   */
  async function createProjectAndOpenEditor(page: any, projectName: string = 'E2E Editor Test'): Promise<boolean> {
    // Navigate to Projects
    const navClick = await safeClick(
      page,
      'button:has-text("Projects")',
      'Navigate to Projects'
    );
    assertStep(navClick);

    // Wait for page or ServerRequiredOverlay
    const heading = page.locator('h1:has-text("Video projects")');
    const overlay = page.locator('text=Server Connection Required');
    await expect(heading.or(overlay)).toBeVisible({ timeout: 10_000 });

    // If server disconnected, can't create project
    if (await overlay.isVisible().catch(() => false)) {
      return false;
    }

    // Click New project
    const newBtn = await safeClick(
      page,
      'button:has-text("New project")',
      'Click New project'
    );
    assertStep(newBtn);

    // Fill project name
    const nameInput = await safeExpectVisible(
      page,
      'input[placeholder="Untitled Project"]',
      'Project name input visible',
      { timeout: 10_000 }
    );
    assertStep(nameInput);

    await safeFill(
      page,
      'input[placeholder="Untitled Project"]',
      projectName,
      'Fill project name'
    );

    // Click Create — exact name, because the page behind the modal also has a
    // "Created" sort tab and (when empty) a "Create project" button.
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // Wait for loading to finish
    await page
      .locator('text=Loading project...')
      .waitFor({ state: 'hidden', timeout: 30_000 })
      .catch(() => {});

    // Wait for editor menu bar
    await expect(
      page.locator('button').filter({ hasText: /^File$/ }).first()
    ).toBeVisible({ timeout: 20_000 });

    return true;
  }

  test('editor renders menu bar with all menus', async ({ page }) => {
    const opened = await createProjectAndOpenEditor(page);
    if (!opened) {
      test.skip();
      return;
    }

    // VideoEditorMenuBar has: File, Edit, View, Subtitles, AI (Tools only with an asset)
    const menus = ['File', 'Edit', 'View', 'Subtitles'];
    for (const menu of menus) {
      await expect(
        page.locator('button').filter({ hasText: new RegExp(`^${menu}$`) }).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('editor has left panel with Media tab', async ({ page }) => {
    const opened = await createProjectAndOpenEditor(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Left panel should have Media, Effects tabs
    await expect(
      page.locator('button:has-text("Media")').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('timeline area is visible', async ({ page }) => {
    const opened = await createProjectAndOpenEditor(page);
    if (!opened) {
      test.skip();
      return;
    }

    // The timeline toolbar always renders the add-track button. It is labelled
    // through aria-label ("Add track"); the visible "Add Track" text is only a
    // hover tooltip, and there is no title attribute.
    await expect(
      page.getByRole('button', { name: 'Add track', exact: true })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('File menu shows project options', async ({ page }) => {
    const opened = await createProjectAndOpenEditor(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Open File menu
    await page.locator('button').filter({ hasText: /^File$/ }).first().click();

    // File menu items. "Save Project" is matched on its exact label because
    // "Save Project As..." sits right below it.
    await expect(
      page.locator('button:has(span:text-is("Save Project"))')
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Go Back")')).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });

  test('Edit menu shows undo/redo', async ({ page }) => {
    const opened = await createProjectAndOpenEditor(page);
    if (!opened) {
      test.skip();
      return;
    }

    await page.locator('button').filter({ hasText: /^Edit$/ }).first().click();

    await expect(page.locator('button:has-text("Undo")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Redo")')).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });

  test('Subtitles menu shows caption options', async ({ page }) => {
    const opened = await createProjectAndOpenEditor(page);
    if (!opened) {
      test.skip();
      return;
    }

    await page.locator('button').filter({ hasText: /^Subtitles$/ }).first().click();

    // "Generate Auto Captions..." and "Import Subtitles..." should be in dropdown
    await expect(
      page.locator('button:has-text("Import Subtitles")')
    ).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });

  test('View menu shows zoom and display options', async ({ page }) => {
    const opened = await createProjectAndOpenEditor(page);
    if (!opened) {
      test.skip();
      return;
    }

    await page.locator('button').filter({ hasText: /^View$/ }).first().click();

    // "Zoom In" should be visible in the View dropdown
    await expect(
      page.locator('button:has-text("Zoom In")').first()
    ).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });

  test('can close editor via File menu', async ({ page }) => {
    const opened = await createProjectAndOpenEditor(page);
    if (!opened) {
      test.skip();
      return;
    }

    // File → Go Back
    await page.locator('button').filter({ hasText: /^File$/ }).first().click();
    await page.locator('button:has-text("Go Back")').click();

    // Should return to the Projects page — nav sidebar should reappear
    await expect(page.locator('nav')).toBeVisible({ timeout: 15_000 });
  });

  test('new project modal shows resolution presets', async ({ page }) => {
    // Navigate to Projects
    const navClick = await safeClick(
      page,
      'button:has-text("Projects")',
      'Navigate to Projects'
    );
    assertStep(navClick);

    const heading = page.locator('h1:has-text("Video projects")');
    const overlay = page.locator('text=Server Connection Required');
    await expect(heading.or(overlay)).toBeVisible({ timeout: 10_000 });

    if (await overlay.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    // Open modal
    await page.locator('button:has-text("New project")').click();

    await expect(
      page.locator('input[placeholder="Untitled Project"]')
    ).toBeVisible({ timeout: 10_000 });

    // Resolution presets should be visible
    await expect(page.locator('button:has-text("Full HD")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("4K")')).toBeVisible({ timeout: 5_000 });

    // Cancel
    await page.locator('button:has-text("Cancel")').click();
  });
});
