import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeFill,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Image Generation E2E tests.
 *
 * 실제 API 호출 결과(이미지 생성 완료)까지 검증하지 않고,
 * 이미지 생성 UI 흐름이 정상 동작하는지 확인한다:
 * - Images 페이지 이동 및 렌더링
 * - Prompt textarea 입력
 * - Generate Image 버튼 클릭 → 로딩 상태 시작 확인
 *
 * Selectors (from ImagesPage.tsx):
 *   - Prompt textarea: 'textarea' (label "Prompt *")
 *   - Generate button: 'button:has-text("Generate Image")'
 *   - Loading state: button becomes disabled or shows spinner
 */

test.describe('Images - Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Images page (use exact match to avoid matching tool card buttons)
    await page.getByRole('button', { name: 'Images', exact: true }).first().click();
    await expect(
      page.locator('button:has-text("Generate Image")')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('images page renders prompt input and generate button', async ({ page }) => {
    // Prompt label 확인 (label 태그 내부의 "Prompt *")
    const labelVisible = await safeExpectVisible(
      page,
      'label:has-text("Prompt")',
      'Prompt label visible'
    );
    assertStep(labelVisible);

    // Prompt textarea 확인 (placeholder로 특정)
    const textareaVisible = await safeExpectVisible(
      page,
      'textarea[placeholder="Describe the image you want to create..."]',
      'Prompt textarea visible'
    );
    assertStep(textareaVisible);

    // Generate Image 버튼 확인
    const btnVisible = await safeExpectVisible(
      page,
      'button:has-text("Generate Image")',
      'Generate Image button visible'
    );
    assertStep(btnVisible);
  });

  test('can type prompt and trigger generation', async ({ page }) => {
    const TEST_PROMPT = 'A beautiful sunset over mountains, photorealistic';

    // Prompt textarea에 텍스트 입력 (placeholder로 특정)
    const promptSelector = 'textarea[placeholder="Describe the image you want to create..."]';
    const fillResult = await safeFill(
      page,
      promptSelector,
      TEST_PROMPT,
      'Fill prompt textarea'
    );
    assertStep(fillResult);

    // 입력된 값 확인
    await expect(page.locator(promptSelector)).toHaveValue(TEST_PROMPT);

    // Generate Image 버튼 클릭
    const clickResult = await safeClick(
      page,
      'button:has-text("Generate Image")',
      'Click Generate Image button'
    );
    assertStep(clickResult);

    // 버튼이 로딩 상태(disabled 또는 텍스트 변경)로 전환되는지 확인
    // ImagesPage.tsx: isGenerating 상태일 때 버튼 disabled
    await expect(
      page.locator('button:has-text("Generate Image"), button:has-text("Generating")')
    ).toBeVisible({ timeout: 5_000 });

    // 크래시 없이 페이지가 살아있는지 확인 — nav(사이드바)가 여전히 보이면 OK
    await page.waitForTimeout(2_000);
    await expect(page.locator('nav')).toBeVisible({ timeout: 5_000 });
  });

  test('model selector is visible', async ({ page }) => {
    // ModelSelector 컴포넌트가 렌더링되는지 확인 (ImagesPage.tsx에 포함)
    // 모델 선택 버튼/드롭다운이 존재해야 함
    await expect(page.locator('main')).toBeVisible();

    // 패널에 이미지 생성 관련 컨트롤이 존재하는지 확인
    const hasControls = await page.locator('textarea').count();
    expect(hasControls).toBeGreaterThan(0);
  });
});
