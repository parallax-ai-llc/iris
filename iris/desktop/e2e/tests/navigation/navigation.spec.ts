import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Navigation E2E tests — 사이드바의 각 페이지로 이동 후 핵심 UI 렌더링 확인.
 *
 * Selectors rationale:
 *   Sidebar (Sidebar.tsx): navItems 10개, 기본 expanded 상태 → 텍스트 셀렉터 사용 가능
 *   각 페이지의 h1 텍스트:
 *     - Home     → "Ready to create something amazing?" (static subtitle)
 *     - Tools    → h1 "All Tools"
 *     - Templates → h1 "Workflow Templates"
 *     - Images   → button "Generate Image"
 *     - Videos   → h1 "Video Gallery"
 *     - Projects → h1 "Projects"
 *     - Workflows → h1 "My Workflows"
 *     - Batch    → h1 "Batch Jobs"
 *     - Library  → h1 "Library"
 *     - Storage  → h1 "Storage"
 */

test.describe('Navigation - Sidebar', () => {
  test('home page loads', async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Home")', 'Click Home nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'text=Ready to create something amazing?',
      'Home subtitle visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('tools page loads', async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Tools")', 'Click Tools nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("All Tools")',
      'Tools heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('templates page loads', async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Templates")', 'Click Templates nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Workflow Templates")',
      'Templates heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('images page loads', async ({ page }) => {
    // Use exact role matching to avoid matching tool card buttons on the page
    await page.getByRole('button', { name: 'Images', exact: true }).first().click();

    // Images 페이지는 Generate Image 버튼으로 식별 (ImagesPage.tsx)
    const visible = await safeExpectVisible(
      page,
      'button:has-text("Generate Image")',
      'Generate Image button visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('videos page loads', async ({ page }) => {
    // Use exact role matching to avoid matching tool card buttons on the page
    await page.getByRole('button', { name: 'Videos', exact: true }).first().click();

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Video Gallery")',
      'Video Gallery heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('projects page loads', async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Projects")', 'Click Projects nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Projects")',
      'Projects heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('workflows page loads', async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Workflows")', 'Click Workflows nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("My Workflows")',
      'My Workflows heading visible',
      { timeout: 15_000 }
    );
    assertStep(visible);
  });

  test('batch page loads', async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Batch")', 'Click Batch nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Batch Jobs")',
      'Batch Jobs heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('library page loads', async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Library")', 'Click Library nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Library")',
      'Library heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('storage page loads', async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Storage")', 'Click Storage nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Storage")',
      'Storage heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });
});
