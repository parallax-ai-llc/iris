import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Library Page E2E tests.
 *
 * Library 는 커뮤니티 공개 라이브러리 페이지다 (LibraryPage.tsx, 로그인 필요 — App.tsx LoginGate).
 * 주요 UI 요소가 정상 렌더링되는지 확인한다:
 * - 페이지 제목 (h1 "Community shared creations")
 * - Refresh 버튼
 * - 타입 필터 세그먼트 (All / Images / Videos)
 * - 항목 수 표시
 * - 에셋 그리드 또는 빈 상태 표시
 *
 * 예전 페이지에 있던 검색 입력·Filter/Sort 드롭다운은 없어졌다.
 *
 * Selectors (from LibraryPage.tsx):
 *   - Heading: 'h1:has-text("Community shared creations")'
 *   - Refresh: 'main button[title="Refresh"]'
 *   - Filter segments: main 안의 button "All" / "Images" / "Videos" (exact name)
 *   - Item count: '.t-eyebrow' ("N item(s)")
 *   - Cards: '.dt-libcard'
 *   - Empty state: 'text=No items in the library yet'
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
      page.locator('h1:has-text("Community shared creations")')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('page renders heading "Community shared creations"', async ({ page }) => {
    const headingVisible = await safeExpectVisible(
      page,
      'h1:has-text("Community shared creations")',
      'Library heading visible'
    );
    assertStep(headingVisible);
  });

  test('refresh button is visible', async ({ page }) => {
    const refreshVisible = await safeExpectVisible(
      page,
      'main button[title="Refresh"]',
      'Refresh button visible'
    );
    assertStep(refreshVisible);
  });

  test('type filter segments are visible and switchable', async ({ page }) => {
    // Segment buttons are matched by exact accessible name inside <main>, so the
    // sidebar's "Images 3" / "Videos 4" nav buttons cannot match.
    const main = page.locator('main');
    const allSegment = main.getByRole('button', { name: 'All', exact: true });
    const imagesSegment = main.getByRole('button', { name: 'Images', exact: true });
    const videosSegment = main.getByRole('button', { name: 'Videos', exact: true });

    await expect(allSegment).toBeVisible({ timeout: 5_000 });
    await expect(imagesSegment).toBeVisible({ timeout: 5_000 });
    await expect(videosSegment).toBeVisible({ timeout: 5_000 });

    // "All" is selected by default; clicking another segment moves the selection.
    await expect(allSegment).toHaveAttribute('data-active', 'true');
    await imagesSegment.click();
    await expect(imagesSegment).toHaveAttribute('data-active', 'true');
  });

  test('item count is displayed', async ({ page }) => {
    // "N item" / "N items" (rendered uppercase by CSS; the DOM text is lowercase).
    await expect(page.locator('main .t-eyebrow')).toHaveText(/\d+ items?/i, {
      timeout: 10_000,
    });
  });

  test('asset grid or empty state is displayed', async ({ page }) => {
    // Either library cards are shown in the grid or the empty state message appears.
    // The list loads asynchronously (skeleton placeholders first), so poll until one
    // of the two settled states is on screen.
    const emptyStateLocator = page.locator('text=No items in the library yet');
    const cardLocator = page.locator('.dt-libcard');

    await expect
      .poll(
        async () =>
          (await emptyStateLocator.isVisible().catch(() => false)) ||
          (await cardLocator.count()) > 0,
        {
          timeout: 15_000,
          message: 'Expected either the empty state message or library cards to be displayed',
        }
      )
      .toBeTruthy();
  });
});
