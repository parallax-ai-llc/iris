import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeFill,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Templates Page E2E tests.
 *
 * Workflow templates 페이지의 핵심 UI 흐름을 검증한다:
 * - 페이지 렌더링 (heading, template cards)
 * - 검색 입력 기능
 * - 카테고리 필터(세그먼트) 버튼 표시
 *
 * Selectors (from TemplatesPage.tsx):
 *   - Heading: h1 "Workflow templates"
 *   - Search input: input[placeholder^="Search templates"]  (placeholder ends with an ellipsis "…")
 *   - Category segments: main 안의 button "All" / "Image" / "Video" / "Content" / "Automation"
 *   - Template cards: .dt-tpl (title: .dt-tpl-title, CTA: button "Use template")
 */

test.describe('Templates Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Templates page before each test
    await page.locator('button:has-text("Templates")').click();
    await expect(
      page.locator('h1:has-text("Workflow templates")')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('page renders heading "Workflow templates"', async ({ page }) => {
    const headingVisible = await safeExpectVisible(
      page,
      'h1:has-text("Workflow templates")',
      'Workflow templates heading visible'
    );
    assertStep(headingVisible);

    // Subtitle 확인
    const subtitleVisible = await safeExpectVisible(
      page,
      'text=Start your workflow with pre-built templates',
      'Subtitle text visible'
    );
    assertStep(subtitleVisible);
  });

  test('template cards are displayed', async ({ page }) => {
    // "Use template" 버튼이 있는 카드가 최소 1개 이상 존재하는지 확인
    const useTemplateButtons = page.locator('button:has-text("Use template")');
    await expect(useTemplateButtons.first()).toBeVisible({ timeout: 10_000 });

    const count = await useTemplateButtons.count();
    expect(count).toBeGreaterThan(0);

    // 템플릿 카드에 제목(.dt-tpl-title)이 표시되는지 확인
    const templateTitles = page.locator('.dt-tpl .dt-tpl-title');
    const titleCount = await templateTitles.count();
    expect(titleCount).toBeGreaterThan(0);
  });

  test('search input is visible and functional', async ({ page }) => {
    const searchSelector = 'input[placeholder^="Search templates"]';

    // 검색 입력 필드가 표시되는지 확인
    const searchVisible = await safeExpectVisible(
      page,
      searchSelector,
      'Search input visible'
    );
    assertStep(searchVisible);

    // 검색어 입력
    const fillResult = await safeFill(
      page,
      searchSelector,
      'image',
      'Fill search input with "image"'
    );
    assertStep(fillResult);

    // 입력된 값 확인
    await expect(page.locator(searchSelector)).toHaveValue('image');

    // 검색 결과가 필터링되었는지 확인 (페이지가 크래시 없이 동작)
    await page.waitForTimeout(500);
    const mainVisible = await safeExpectVisible(
      page,
      'main',
      'Page still alive after search',
      { timeout: 5_000 }
    );
    assertStep(mainVisible);
  });

  test('category filter buttons are displayed', async ({ page }) => {
    // 세그먼트 버튼은 exact name 으로 잡는다 — 사이드바의 "Images 3" 나 카드의
    // "Use template" 과 겹치지 않도록 main 으로 범위를 좁힌다.
    const main = page.locator('main');
    const allSegment = main.getByRole('button', { name: 'All', exact: true });
    const imageSegment = main.getByRole('button', { name: 'Image', exact: true });

    // "All" 카테고리 버튼 확인 (기본 선택)
    await expect(allSegment).toBeVisible();
    await expect(allSegment).toHaveAttribute('data-active', 'true');

    // "Image" 카테고리 버튼 확인
    await expect(imageSegment).toBeVisible();

    // 카테고리 버튼 클릭 시 필터 동작 확인
    await imageSegment.click();
    await expect(imageSegment).toHaveAttribute('data-active', 'true');

    // 클릭 후 페이지가 정상 동작하는지 확인
    await page.waitForTimeout(500);
    await expect(
      page.locator('h1:has-text("Workflow templates")')
    ).toBeVisible();
  });
});
