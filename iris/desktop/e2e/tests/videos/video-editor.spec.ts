import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeFill,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Video Editor E2E tests.
 *
 * 흐름:
 * 1. Projects 페이지 이동
 * 2. "New project" 클릭 → 모달 열림
 * 3. 프로젝트 이름 입력 → "Create" 클릭
 * 4. VideoEditorPage 열림 확인 (loadFromTimelineData → isEditorOpen: true)
 * 5. VideoEditorMenuBar ("File" 메뉴) 표시 확인
 * 6. 에디터 닫기 확인
 *
 * Selectors:
 *   - Projects nav: button:has-text("Projects")
 *   - Heading: h1:has-text("Video projects")
 *   - New project btn: button:has-text("New project")
 *   - Project name input: input[placeholder="Untitled Project"]
 *   - Create btn: button:text-is("Create")  (정확히 일치 — 같은 화면의 "Created" 정렬 탭,
 *     빈 상태의 "Create project" 버튼과 구분)
 *   - Editor menu: button 텍스트가 정확히 "File" / "Edit" (VideoEditorMenuBar.tsx)
 *   - Close: loading spinner or editor heading
 */

test.describe('Video Editor', () => {
  test('can open video editor via new project creation', async ({ page }) => {
    // 1. Projects 페이지 이동
    const navClick = await safeClick(
      page,
      'button:has-text("Projects")',
      'Navigate to Projects'
    );
    assertStep(navClick);

    const projectsHeading = await safeExpectVisible(
      page,
      'h1:has-text("Video projects")',
      'Projects page loaded',
      { timeout: 10_000 }
    );
    assertStep(projectsHeading);

    // 2. New project 버튼 클릭 (modal open)
    const newProjectBtn = await safeClick(
      page,
      'button:has-text("New project")',
      'Click New project button'
    );
    assertStep(newProjectBtn);

    // 3. 모달이 열리면 프로젝트 이름 입력
    const nameInputVisible = await safeExpectVisible(
      page,
      'input[placeholder="Untitled Project"]',
      'Project name input visible',
      { timeout: 10_000 }
    );
    assertStep(nameInputVisible);

    // 테스트 프로젝트 이름 입력
    const fillName = await safeFill(
      page,
      'input[placeholder="Untitled Project"]',
      'E2E Test Project',
      'Fill project name'
    );
    assertStep(fillName);

    // 4. Create 버튼 클릭
    const createBtn = await safeClick(
      page,
      'button:text-is("Create")',
      'Click Create button'
    );
    assertStep(createBtn);

    // 5. VideoEditorPage 로딩 상태 대기 (Loading project... → editor)
    // loadFromTimelineData가 isEditorOpen: true를 설정 → VideoEditorPage 렌더링
    await page
      .locator('text=Loading project...')
      .waitFor({ state: 'hidden', timeout: 20_000 })
      .catch(() => {
        // 로딩 텍스트가 처음부터 없을 수도 있음
      });

    // 6. VideoEditorMenuBar의 "File" 메뉴 확인 — 텍스트가 정확히 "File" 인 버튼
    await expect(
      page.locator('button').filter({ hasText: /^File$/ }).first()
    ).toBeVisible({ timeout: 20_000 });

    // 에디터의 "Edit" 메뉴도 확인
    await expect(
      page.locator('button').filter({ hasText: /^Edit$/ }).first()
    ).toBeVisible();
  });

  test('projects page shows new project button', async ({ page }) => {
    // Projects 페이지에 핵심 UI 요소들이 있는지 확인
    const navClick = await safeClick(
      page,
      'button:has-text("Projects")',
      'Navigate to Projects'
    );
    assertStep(navClick);

    const heading = await safeExpectVisible(
      page,
      'h1:has-text("Video projects")',
      'Projects heading',
      { timeout: 10_000 }
    );
    assertStep(heading);

    const newBtn = await safeExpectVisible(
      page,
      'button:has-text("New project")',
      'New project button visible'
    );
    assertStep(newBtn);
  });
});
