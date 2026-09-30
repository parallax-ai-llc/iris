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
 *   Sidebar (Sidebar.tsx): navItems 10개, <nav> 안의 <button>.
 *   각 버튼은 라벨 옆에 단축키 숫자(kbd)를 함께 렌더해서 접근성 이름이 "Images 3"
 *   처럼 나온다 → role + exact name 으로는 잡히지 않는다. Home 의 Quick Start 타일
 *   설명에도 "images"/"videos" 가 들어 있어 페이지 전체에서 `button:has-text("Images")`
 *   는 strict mode 위반이다 → `nav` 로 범위를 좁힌다.
 *   각 페이지의 식별 요소:
 *     - Home       → "Ready to create something amazing?" (static subtitle)
 *     - Templates  → h1 "Workflow templates"
 *     - Images     → button "Generate Image"
 *     - Videos     → h1 "Video Gallery"
 *     - Projects   → h1 "Video projects"
 *     - Workflows  → h1 "Workflows"
 *     - Batch      → h1 "Batch jobs"
 *     - Extensions → heading "Extension Marketplace" (서버 미연결 시에는 같은 제목의 h3)
 *     - Library    → h1 "Community shared creations" (로그인 필요)
 *     - Storage    → h1 "Cloud storage" 또는 ServerRequiredOverlay (로그인 필요)
 */

/** Sidebar nav button — scoped to <nav> so page content with the same word cannot match. */
const navButton = (label: string) => `nav button:has-text("${label}")`;

test.describe('Navigation - Sidebar', () => {
  test('home page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Home'), 'Click Home nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'text=Ready to create something amazing?',
      'Home subtitle visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('templates page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Templates'), 'Click Templates nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Workflow templates")',
      'Templates heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('images page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Images'), 'Click Images nav');
    assertStep(click);

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
    const click = await safeClick(page, navButton('Videos'), 'Click Videos nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Video Gallery")',
      'Video Gallery heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('projects page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Projects'), 'Click Projects nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Video projects")',
      'Video projects heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('workflows page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Workflows'), 'Click Workflows nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Workflows")',
      'Workflows heading visible',
      { timeout: 15_000 }
    );
    assertStep(visible);
  });

  test('batch page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Batch'), 'Click Batch nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Batch jobs")',
      'Batch jobs heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('extensions page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Extensions'), 'Click Extensions nav');
    assertStep(click);

    // 연결 시에는 h1, 서버 미연결 게이트에서는 h3 로 같은 제목을 렌더한다 (ExtensionsPage.tsx).
    await expect(
      page.getByRole('heading', { name: 'Extension Marketplace' })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('library page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Library'), 'Click Library nav');
    assertStep(click);

    const visible = await safeExpectVisible(
      page,
      'h1:has-text("Community shared creations")',
      'Library heading visible',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('storage page loads', async ({ page }) => {
    const click = await safeClick(page, navButton('Storage'), 'Click Storage nav');
    assertStep(click);

    // StoragePage 는 서버 미연결 시 ServerRequiredOverlay 를 대신 렌더한다.
    await expect(
      page
        .locator('h1:has-text("Cloud storage")')
        .or(page.locator('text=Server Connection Required'))
    ).toBeVisible({ timeout: 15_000 });
  });
});
