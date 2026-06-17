import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeFill,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Tools Page E2E tests.
 *
 * ToolsPage.tsx UI 요소:
 *   - h1 "All Tools"
 *   - Search input: placeholder "Search tools..."
 *   - Filter tabs: "All", "Video", "Image"
 *   - Tool cards: button elements with tool title + description
 *   - Sections: "Video Tools", "Image Tools" (when filter is "All")
 */

test.describe('Tools Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Tools page via sidebar
    const click = await safeClick(
      page,
      'button:has-text("Tools")',
      'Click Tools nav'
    );
    assertStep(click);

    // Wait for page heading
    await expect(
      page.locator('h1:has-text("All Tools")')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('page renders heading and search input', async ({ page }) => {
    // h1 "All Tools" heading
    const headingVisible = await safeExpectVisible(
      page,
      'h1:has-text("All Tools")',
      'All Tools heading visible'
    );
    assertStep(headingVisible);

    // Subtitle text
    const subtitleVisible = await safeExpectVisible(
      page,
      'text=Explore all AI-powered tools for image and video creation',
      'Subtitle text visible'
    );
    assertStep(subtitleVisible);

    // Search input with placeholder
    const searchVisible = await safeExpectVisible(
      page,
      'input[placeholder="Search tools..."]',
      'Search input visible'
    );
    assertStep(searchVisible);
  });

  test('category filter tabs are visible', async ({ page }) => {
    // Filter tabs use exact text matching to avoid matching tool card buttons
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Video', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible();
  });

  test('tool cards are displayed', async ({ page }) => {
    // At least one tool card should be visible (cards are <button> with group class)
    // Check for section headings that appear when "All" filter is active
    const videoSectionVisible = await safeExpectVisible(
      page,
      'h2:has-text("Video Tools")',
      'Video Tools section heading visible'
    );
    assertStep(videoSectionVisible);

    const imageSectionVisible = await safeExpectVisible(
      page,
      'h2:has-text("Image Tools")',
      'Image Tools section heading visible'
    );
    assertStep(imageSectionVisible);

    // Verify at least one tool card is rendered (check for a known tool title)
    const toolCardVisible = await safeExpectVisible(
      page,
      'text=Text to Video',
      'Text to Video tool card visible'
    );
    assertStep(toolCardVisible);
  });

  test('search functionality filters tools', async ({ page }) => {
    const searchInput = 'input[placeholder="Search tools..."]';

    // Type a search query that should match a specific tool
    const fillResult = await safeFill(
      page,
      searchInput,
      'Inpaint',
      'Type search query "Inpaint"'
    );
    assertStep(fillResult);

    // Wait for filtering to take effect
    await page.waitForTimeout(500);

    // "Video Inpaint" should still be visible (matches search)
    const matchVisible = await safeExpectVisible(
      page,
      'text=Video Inpaint',
      'Matching tool "Video Inpaint" visible after search',
      { timeout: 5_000 }
    );
    assertStep(matchVisible);

    // "Text to Video" should NOT be visible (doesn't match "Inpaint")
    const nonMatchHidden = await page
      .locator('button:has-text("Text to Video")')
      .isVisible();
    expect(nonMatchHidden).toBe(false);

    // Clear search and verify all tools reappear
    const clearResult = await safeFill(
      page,
      searchInput,
      '',
      'Clear search query'
    );
    assertStep(clearResult);

    await page.waitForTimeout(500);

    const textToVideoVisible = await safeExpectVisible(
      page,
      'text=Text to Video',
      'Text to Video reappears after clearing search'
    );
    assertStep(textToVideoVisible);
  });

  test('search with no results shows empty state', async ({ page }) => {
    const searchInput = 'input[placeholder="Search tools..."]';

    // Type a query that matches nothing
    const fillResult = await safeFill(
      page,
      searchInput,
      'xyznonexistenttool123',
      'Type non-matching search query'
    );
    assertStep(fillResult);

    await page.waitForTimeout(500);

    // Empty state message should appear
    const emptyVisible = await safeExpectVisible(
      page,
      'text=No tools found matching your search',
      'Empty state message visible',
      { timeout: 5_000 }
    );
    assertStep(emptyVisible);
  });

  test('clicking a category tab filters the grid', async ({ page }) => {
    // Click "Video" tab
    // Use exact match to avoid clicking tool card buttons
    await page.getByRole('button', { name: 'Video', exact: true }).click();

    await page.waitForTimeout(500);

    // Video tools should be visible
    const videoToolVisible = await safeExpectVisible(
      page,
      'text=Text to Video',
      'Video tool visible after Video filter',
      { timeout: 5_000 }
    );
    assertStep(videoToolVisible);

    // Section headings should NOT appear (only shown in "All" view)
    const sectionHeadingHidden = await page
      .locator('h2:has-text("Video Tools")')
      .isVisible();
    expect(sectionHeadingHidden).toBe(false);

    // Click "Image" tab
    await page.getByRole('button', { name: 'Image', exact: true }).click();

    await page.waitForTimeout(500);

    // Video-only tools should NOT be visible
    const videoToolHidden = await page
      .locator('button:has-text("Text to Video")')
      .isVisible();
    expect(videoToolHidden).toBe(false);

    // Click "All" tab to restore full view
    await page.getByRole('button', { name: 'All', exact: true }).click();

    await page.waitForTimeout(500);

    // Both section headings should reappear
    const videoSectionBack = await safeExpectVisible(
      page,
      'h2:has-text("Video Tools")',
      'Video Tools section visible after All filter',
      { timeout: 5_000 }
    );
    assertStep(videoSectionBack);

    const imageSectionBack = await safeExpectVisible(
      page,
      'h2:has-text("Image Tools")',
      'Image Tools section visible after All filter',
      { timeout: 5_000 }
    );
    assertStep(imageSectionBack);
  });
});
