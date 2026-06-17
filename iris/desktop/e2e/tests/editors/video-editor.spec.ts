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
 * 흐름: Projects 페이지 → New Project → 모달에서 이름/해상도 선택 → Create → 에디터 열림
 *
 * Key selectors (VideoEditor.tsx, VideoEditorMenuBar.tsx, EditorTimeline.tsx):
 *   - Menu bar: "File", "Edit", "View", "Subtitles", "Tools"
 *   - Left panel tabs: "Media", "Effects", "Text"
 *   - Preview area: video preview + subtitle overlay
 *   - Timeline: track headers, clips, playhead
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
    const heading = page.locator('h1:has-text("Projects")');
    const overlay = page.locator('text=Server Connection Required');
    await expect(heading.or(overlay)).toBeVisible({ timeout: 10_000 });

    // If server disconnected, can't create project
    if (await overlay.isVisible().catch(() => false)) {
      return false;
    }

    // Click New Project
    const newBtn = await safeClick(
      page,
      'button:has-text("New Project")',
      'Click New Project'
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

    // Click Create
    await page.locator('button:has-text("Create")').click();

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

    // VideoEditorMenuBar has: File, Edit, View, Subtitles, Tools
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

    // Timeline should render with at least one track header (Video track)
    // Look for track-related elements or the timeline container
    // The timeline has a track with type icons and add track button
    const addTrackBtn = page.locator('button[title="Add Track"]');
    const trackArea = page.locator('text=Video').first();

    await expect(
      addTrackBtn.or(trackArea)
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

    // File menu items
    await expect(page.locator('button:has-text("Save Project")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Back to Videos")')).toBeVisible({ timeout: 5_000 });

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

    // File → Back to Videos
    await page.locator('button').filter({ hasText: /^File$/ }).first().click();
    await page.locator('button:has-text("Back to Videos")').click();

    // Should return to Projects/Videos page — nav sidebar should reappear
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

    const heading = page.locator('h1:has-text("Projects")');
    const overlay = page.locator('text=Server Connection Required');
    await expect(heading.or(overlay)).toBeVisible({ timeout: 10_000 });

    if (await overlay.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    // Open modal
    await page.locator('button:has-text("New Project")').click();

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
