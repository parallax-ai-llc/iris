import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  safeClick,
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Home Page E2E tests — 홈 대시보드의 핵심 UI 요소 렌더링 및 네비게이션 검증.
 *
 * Selectors rationale (from HomePage.tsx):
 *   - Greeting: h1 with dynamic time-based greeting + user name
 *   - Subtitle: "Ready to create something amazing?" (i18n key: home.subtitle)
 *   - Stats: 3 stat cards (Images Created, Videos Created, This Week)
 *   - Quick Actions: 3 <button> elements with h3 titles (Create Image, Create Video, Build Workflow)
 *   - Recent Activity: heading "Recent Activity" + optional "View all" link + item list or empty state
 *   - Pro Tip: keyboard shortcut hint with <kbd> elements ("Ctrl" + "0-9")
 */

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    const click = await safeClick(page, 'button:has-text("Home")', 'Click Home nav');
    assertStep(click);

    // Wait for Home page to fully render
    const visible = await safeExpectVisible(
      page,
      'text=Ready to create something amazing?',
      'Home subtitle visible after navigation',
      { timeout: 10_000 }
    );
    assertStep(visible);
  });

  test('page renders greeting and subtitle', async ({ page }) => {
    // Greeting h1 should contain a time-based greeting (morning/afternoon/evening)
    const greetingVisible = await safeExpectVisible(
      page,
      'h1',
      'Greeting heading visible'
    );
    assertStep(greetingVisible);

    // Verify the h1 text contains one of the expected greeting prefixes
    const h1Text = await page.locator('h1').first().textContent();
    const hasGreeting =
      h1Text?.includes('Good morning') ||
      h1Text?.includes('Good afternoon') ||
      h1Text?.includes('Good evening');
    expect(hasGreeting).toBe(true);

    // Subtitle text
    const subtitleVisible = await safeExpectVisible(
      page,
      'text=Ready to create something amazing?',
      'Subtitle text visible'
    );
    assertStep(subtitleVisible);
  });

  test('stats section displays 3 stat cards', async ({ page }) => {
    // Verify each stat label is visible
    const imagesStatVisible = await safeExpectVisible(
      page,
      'text=Images Created',
      'Images Created stat visible'
    );
    assertStep(imagesStatVisible);

    const videosStatVisible = await safeExpectVisible(
      page,
      'text=Videos Created',
      'Videos Created stat visible'
    );
    assertStep(videosStatVisible);

    const thisWeekStatVisible = await safeExpectVisible(
      page,
      'text=This Week',
      'This Week stat visible'
    );
    assertStep(thisWeekStatVisible);
  });

  test('quick action cards are visible', async ({ page }) => {
    // 3 quick action cards with h3 titles
    const createImageVisible = await safeExpectVisible(
      page,
      'h3:has-text("Create Image")',
      'Create Image quick action visible'
    );
    assertStep(createImageVisible);

    const createVideoVisible = await safeExpectVisible(
      page,
      'h3:has-text("Create Video")',
      'Create Video quick action visible'
    );
    assertStep(createVideoVisible);

    const buildWorkflowVisible = await safeExpectVisible(
      page,
      'h3:has-text("Build Workflow")',
      'Build Workflow quick action visible'
    );
    assertStep(buildWorkflowVisible);
  });

  test('clicking Create Image navigates to Images page', async ({ page }) => {
    // Click the Create Image quick action button
    const click = await safeClick(
      page,
      'button:has(h3:has-text("Create Image"))',
      'Click Create Image quick action'
    );
    assertStep(click);

    // Verify Images page loaded (ImagesPage has a "Generate Image" button)
    const imagesPageVisible = await safeExpectVisible(
      page,
      'button:has-text("Generate Image")',
      'Images page loaded after clicking Create Image',
      { timeout: 10_000 }
    );
    assertStep(imagesPageVisible);
  });

  test('recent activity section is visible', async ({ page }) => {
    // Recent Activity heading should always be visible
    const recentActivityVisible = await safeExpectVisible(
      page,
      'text=Recent Activity',
      'Recent Activity heading visible'
    );
    assertStep(recentActivityVisible);

    // Either recent items or empty state should be visible
    const hasRecentItems = await page.locator('text=View all').isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=No recent activity yet').isVisible().catch(() => false);

    expect(hasRecentItems || hasEmptyState).toBe(true);
  });

  test('pro tip section with keyboard shortcut hint is visible', async ({ page }) => {
    // Pro tip text
    const proTipVisible = await safeExpectVisible(
      page,
      'text=Pro tip:',
      'Pro tip label visible'
    );
    assertStep(proTipVisible);

    // Keyboard shortcut kbd elements
    const ctrlKbdVisible = await safeExpectVisible(
      page,
      'kbd:has-text("Ctrl")',
      'Ctrl kbd element visible'
    );
    assertStep(ctrlKbdVisible);

    const numberKbdVisible = await safeExpectVisible(
      page,
      'kbd:has-text("0-9")',
      '0-9 kbd element visible'
    );
    assertStep(numberKbdVisible);
  });
});
