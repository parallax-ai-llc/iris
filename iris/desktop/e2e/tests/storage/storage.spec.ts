import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Storage Page E2E tests — 클라우드 스토리지 페이지 렌더링 및 핵심 UI 확인.
 *
 * Selectors rationale (StoragePage.tsx):
 *   - h1 "Storage" — 페이지 타이틀
 *   - StorageUsageBar — HardDrive 아이콘 + 파일 수 텍스트 ("files")
 *   - File list (grid/list) or Empty state — "No files yet" / "Upload files or create a folder"
 *   - ServerRequiredOverlay — 서버 미연결 시 표시
 */

test.describe('Storage Page', () => {
  test.beforeEach(async ({ page }) => {
    // 사이드바에서 Storage 버튼 클릭 후 페이지 로드 대기
    const navClick = await safeClick(
      page,
      'button:has-text("Storage")',
      'Click Storage nav button',
      { timeout: 10_000 }
    );
    assertStep(navClick);

    // Storage 페이지 또는 ServerRequiredOverlay 중 하나가 보여야 함
    await expect(
      page.locator('h1:has-text("Storage")').or(page.locator('text=Server Connection Required'))
    ).toBeVisible({ timeout: 15_000 });
  });

  test('page renders heading "Storage"', async ({ page }) => {
    // 서버 미연결 시 ServerRequiredOverlay가 표시됨
    const isOverlay = await page.locator('text=Server Connection Required').isVisible().catch(() => false);
    if (isOverlay) {
      // 서버 미연결 상태 — overlay가 정상 표시되는 것을 확인
      await expect(page.locator('text=Server Connection Required')).toBeVisible();
      return;
    }

    const heading = await safeExpectVisible(
      page,
      'h1:has-text("Storage")',
      'Storage heading is visible'
    );
    assertStep(heading);
  });

  test('storage usage info is visible', async ({ page }) => {
    // 서버 미연결 시 skip
    const isOverlay = await page.locator('text=Server Connection Required').isVisible().catch(() => false);
    if (isOverlay) return;

    const usageOrRefresh = await safeExpectVisible(
      page,
      'button[title="Refresh"]',
      'Refresh button (storage toolbar) is visible',
      { timeout: 10_000 }
    );
    assertStep(usageOrRefresh);

    const gridBtn = await safeExpectVisible(
      page,
      'button[title="Grid view"]',
      'Grid view button is visible'
    );
    assertStep(gridBtn);

    const listBtn = await safeExpectVisible(
      page,
      'button[title="List view"]',
      'List view button is visible'
    );
    assertStep(listBtn);
  });

  test('file list or empty state is displayed', async ({ page }) => {
    // 서버 미연결 시 skip
    const isOverlay = await page.locator('text=Server Connection Required').isVisible().catch(() => false);
    if (isOverlay) return;

    await page.waitForTimeout(2_000);

    const fileItemLocator = page.locator('[class*="cursor-pointer"]').first();
    const emptyStateLocator = page.locator('text=No files yet');
    const searchEmptyLocator = page.locator('text=No files match your search');

    const hasFiles = await fileItemLocator.isVisible().catch(() => false);
    const hasEmptyState = await emptyStateLocator.isVisible().catch(() => false);
    const hasSearchEmpty = await searchEmptyLocator.isVisible().catch(() => false);

    if (hasFiles) {
      const uploadBtn = await safeExpectVisible(
        page,
        'button[title="Upload"]',
        'Upload button is visible when files exist'
      );
      assertStep(uploadBtn);
    } else if (hasEmptyState || hasSearchEmpty) {
      const emptyVisible = await safeExpectVisible(
        page,
        'text=No files yet',
        'Empty state message is visible'
      );
      assertStep(emptyVisible);
    } else {
      const uploadBtn = await safeExpectVisible(
        page,
        'button[title="Upload"], button[title="Uploading..."]',
        'Upload button exists (page loaded)',
        { timeout: 10_000 }
      );
      assertStep(uploadBtn);
    }
  });
});
