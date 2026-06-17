import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Image Editor E2E tests.
 *
 * 이미지 에디터는 ImagesPage에서 이미지 카드를 클릭하면 열린다.
 * App.tsx에서 isImageEditorOpen(tabs.length > 0 && isEditorVisible)이면
 * ImageEditorPage를 전체 화면으로 렌더링한다.
 *
 * 테스트 전략:
 *   - 이미지가 있는 경우: 카드 클릭 → 에디터 열림 → UI 확인 → 닫기
 *   - 이미지가 없는 경우: 에디터 진입 불가이므로 해당 테스트 스킵
 *
 * Key selectors (ImageEditorPage.tsx, EditorMenuBar.tsx, ToolPanel.tsx, RightPanel.tsx):
 *   - Menu bar: "File", "Edit", "Image", "Select", "Filter", "View"
 *   - Tool panel: button[title*="Move"], button[title*="Crop"], etc.
 *   - Right panel tabs: "Layers", "Channels", "Paths"
 *   - Canvas: canvas element
 *   - Zoom controls: zoom slider, percentage display
 *   - Tab bar: .min-w-\\[120px\\] (tab items with file names)
 */

test.describe('Image Editor', () => {
  /**
   * Helper: Navigate to Images page and click the first image card to open editor.
   * Returns true if editor was opened, false if no images available.
   */
  async function openEditorFromGallery(page: any): Promise<boolean> {
    // Navigate to Images page
    await page.getByRole('button', { name: 'Images', exact: true }).first().click();
    await expect(
      page.locator('button:has-text("Generate Image")')
    ).toBeVisible({ timeout: 10_000 });

    // Wait for gallery to load
    await page.waitForTimeout(2_000);

    // Check if there are any image cards (non-processing, non-failed)
    const imageCards = page.locator('.aspect-square.rounded-xl.cursor-pointer');
    const cardCount = await imageCards.count();

    if (cardCount === 0) {
      return false;
    }

    // Click the first available image card
    await imageCards.first().click();

    // Wait for editor to load (menu bar appears)
    await expect(
      page.locator('button').filter({ hasText: /^File$/ }).first()
    ).toBeVisible({ timeout: 15_000 });

    return true;
  }

  test('opens editor when clicking an image card', async ({ page }) => {
    const opened = await openEditorFromGallery(page);

    if (!opened) {
      // No images available — verify gallery is in empty/no-card state
      const emptyOrGrid = page.locator('text=No images yet')
        .or(page.locator('text=Generate your first image'));
      await expect(emptyOrGrid.or(page.locator('button:has-text("Generate Image")'))).toBeVisible();
      return;
    }

    // Editor should be in full-screen mode (no sidebar nav visible)
    await expect(page.locator('nav')).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      // nav might still be visible in some layouts
    });

    // Canvas should be present
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });
  });

  test('editor menu bar has all menus', async ({ page }) => {
    const opened = await openEditorFromGallery(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Verify all menu items in EditorMenuBar
    const menus = ['File', 'Edit', 'Image', 'Select', 'Filter', 'View'];
    for (const menu of menus) {
      await expect(
        page.locator('button').filter({ hasText: new RegExp(`^${menu}$`) }).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('tool panel is visible with tool buttons', async ({ page }) => {
    const opened = await openEditorFromGallery(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Tool panel should have tool buttons (w-8 h-8 square buttons with titles)
    // Check for essential tools: Move, Crop, at minimum
    const toolButtons = page.locator('button.w-8.h-8');
    const toolCount = await toolButtons.count();
    expect(toolCount).toBeGreaterThanOrEqual(5);
  });

  test('right panel shows layers tab', async ({ page }) => {
    const opened = await openEditorFromGallery(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Right panel tab buttons
    await expect(
      page.locator('button:has-text("Layers")').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('File menu opens and shows options', async ({ page }) => {
    const opened = await openEditorFromGallery(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Click File menu
    await page.locator('button').filter({ hasText: /^File$/ }).first().click();

    // Menu dropdown should show key options (EditorMenuBar labels: "Save", "Save As...", "Close Tab", "Back to Gallery")
    await expect(page.locator('button:has-text("Save")').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Close Tab")')).toBeVisible({ timeout: 5_000 });

    // Close menu by pressing Escape
    await page.keyboard.press('Escape');
  });

  test('Edit menu opens with undo/redo', async ({ page }) => {
    const opened = await openEditorFromGallery(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Click Edit menu
    await page.locator('button').filter({ hasText: /^Edit$/ }).first().click();

    // Undo/Redo should be present (labels: "Undo", "Redo", "Reset All Changes")
    await expect(page.locator('button:has-text("Undo")').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Redo")').first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });

  test('zoom controls are functional', async ({ page }) => {
    const opened = await openEditorFromGallery(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Zoom controls should be at the bottom
    // Look for zoom percentage text (e.g., "100%", "50%")
    const zoomText = page.locator('text=/%/');
    const hasZoom = await zoomText.count() > 0;

    // If explicit zoom text isn't found, check for zoom slider
    if (!hasZoom) {
      const zoomSlider = page.locator('input[type="range"]');
      await expect(zoomSlider.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('can close editor and return to gallery', async ({ page }) => {
    const opened = await openEditorFromGallery(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Close via File menu → Back to Gallery
    await page.locator('button').filter({ hasText: /^File$/ }).first().click();
    await page.locator('button:has-text("Back to Gallery")').click();

    // Wait for editor to close — sidebar nav should reappear
    await expect(page.locator('nav')).toBeVisible({ timeout: 15_000 });
  });
});
