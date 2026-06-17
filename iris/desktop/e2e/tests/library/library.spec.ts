import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeFill,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Library Page E2E tests.
 *
 * Library 페이지의 주요 UI 요소가 정상 렌더링되는지 확인한다:
 * - 페이지 제목 (h1 "Library")
 * - 검색 입력 필드
 * - 필터 드롭다운 (All Files / Images / Videos)
 * - 정렬 드롭다운
 * - 에셋 그리드 또는 빈 상태 표시
 *
 * Selectors (from LibraryPage.tsx):
 *   - Heading: 'h1:has-text("Library")'
 *   - Search input: 'input[placeholder="Search files..."]'
 *   - Filter dropdown: 'button:has-text("Filter")'
 *   - Sort dropdown: 'button:has-text("Sort")'
 *   - Empty state: 'text=Your library is empty'
 */

test.describe('Library Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Library page before each test
    const navResult = await safeClick(
      page,
      'button:has-text("Library")',
      'Click Library nav button'
    );
    assertStep(navResult);

    // Wait for the Library heading to appear
    await expect(
      page.locator('h1:has-text("Library")')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('page renders heading "Library"', async ({ page }) => {
    const headingVisible = await safeExpectVisible(
      page,
      'h1:has-text("Library")',
      'Library heading visible'
    );
    assertStep(headingVisible);
  });

  test('search input is visible', async ({ page }) => {
    const searchVisible = await safeExpectVisible(
      page,
      'input[placeholder="Search files..."]',
      'Search input visible'
    );
    assertStep(searchVisible);
  });

  test('filter dropdown is visible and shows options', async ({ page }) => {
    // Filter dropdown button shows "Filter: <selected>" text
    const filterVisible = await safeExpectVisible(
      page,
      'button:has-text("Filter")',
      'Filter dropdown button visible'
    );
    assertStep(filterVisible);

    // Click the Filter dropdown to reveal options
    const clickResult = await safeClick(
      page,
      'button:has-text("Filter")',
      'Click Filter dropdown'
    );
    assertStep(clickResult);

    // Verify filter options in the dropdown menu (use exact role matching to avoid
    // matching sidebar nav buttons or the filter trigger button itself)
    await expect(page.locator('.absolute button:has-text("All Files")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.absolute button:has-text("Images")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.absolute button:has-text("Videos")')).toBeVisible({ timeout: 5_000 });
  });

  test('sort dropdown is visible', async ({ page }) => {
    const sortVisible = await safeExpectVisible(
      page,
      'button:has-text("Sort")',
      'Sort dropdown button visible'
    );
    assertStep(sortVisible);
  });

  test('asset grid or empty state is displayed', async ({ page }) => {
    // Either assets are shown in the grid or the empty state message appears.
    // We check for one of the two states.
    const emptyStateLocator = page.locator('text=Your library is empty');
    const assetGridLocator = page.locator(
      '.grid > div, [class*="space-y"] > div'
    );

    const hasEmptyState = await emptyStateLocator.isVisible().catch(() => false);
    const hasAssets = (await assetGridLocator.count()) > 0;

    expect(
      hasEmptyState || hasAssets,
      'Expected either the empty state message or asset cards to be displayed'
    ).toBeTruthy();
  });
});
