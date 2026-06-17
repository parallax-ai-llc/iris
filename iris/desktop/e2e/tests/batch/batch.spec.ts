import { test, expect } from '../../fixtures/authenticated.fixture';
import { safeClick, safeExpectVisible, assertStep } from '../../helpers/step.helper';

/**
 * Batch Page E2E tests.
 *
 * BatchPage.tsx -> BatchJobList 컴포넌트 렌더링 확인.
 *
 * Selectors:
 *   - Batch nav: button:has-text("Batch")
 *   - Heading: h1:has-text("Batch Jobs")
 *   - New Batch Job btn: button:has-text("New Batch Job")
 *   - Search input: input[placeholder*="Search batch jobs"]  (placeholder uses an ellipsis)
 *   - Empty state: text="No batch jobs yet"
 *   - Empty state CTA: button:has-text("Create Batch Job")
 */

test.describe('Batch Page', () => {
  test.beforeEach(async ({ page }) => {
    const navClick = await safeClick(
      page,
      'button:has-text("Batch")',
      'Navigate to Batch page'
    );
    assertStep(navClick);

    const heading = await safeExpectVisible(
      page,
      'h1:has-text("Batch Jobs")',
      'Batch Jobs heading visible',
      { timeout: 10_000 }
    );
    assertStep(heading);
  });

  test('page renders heading "Batch Jobs"', async ({ page }) => {
    const heading = await safeExpectVisible(
      page,
      'h1:has-text("Batch Jobs")',
      'Batch Jobs heading is displayed'
    );
    assertStep(heading);

    const subtitle = await safeExpectVisible(
      page,
      'text=Process workflows in bulk with spreadsheet data',
      'Batch subtitle is displayed'
    );
    assertStep(subtitle);
  });

  test('create batch job button is visible', async ({ page }) => {
    const newBatchBtn = await safeExpectVisible(
      page,
      'button:has-text("New Batch Job")',
      'New Batch Job button visible'
    );
    assertStep(newBatchBtn);
  });

  test('page shows job list or empty state', async ({ page }) => {
    // Wait for loading to finish
    await page
      .locator('[class*="animate-spin"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {
        // Loading spinner may not appear if data loads quickly
      });

    // Check for either job cards (grid) or empty state
    const hasJobs = await page.locator('[class*="grid"] >> [class*="rounded"]').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=No batch jobs yet').isVisible().catch(() => false);

    if (hasEmptyState) {
      // Empty state should show descriptive text and a create button
      const emptyHeading = await safeExpectVisible(
        page,
        'text=No batch jobs yet',
        'Empty state heading visible'
      );
      assertStep(emptyHeading);

      const emptyDescription = await safeExpectVisible(
        page,
        'text=Create your first batch job to process data in bulk',
        'Empty state description visible'
      );
      assertStep(emptyDescription);

      const createBtn = await safeExpectVisible(
        page,
        'button:has-text("Create Batch Job")',
        'Empty state Create Batch Job button visible'
      );
      assertStep(createBtn);
    } else {
      // Jobs exist - the search input should be visible for filtering
      const searchInput = await safeExpectVisible(
        page,
        'input[placeholder*="Search batch jobs"]',
        'Search input visible when jobs exist'
      );
      assertStep(searchInput);
    }

    // Regardless of state, the search input and filter should be present
    const searchInput = await safeExpectVisible(
      page,
      'input[placeholder*="Search batch jobs"]',
      'Search input is always visible'
    );
    assertStep(searchInput);
  });
});
