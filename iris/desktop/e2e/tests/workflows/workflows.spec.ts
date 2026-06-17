import { test, expect } from '../../fixtures/authenticated.fixture';
import { safeClick, safeExpectVisible, assertStep } from '../../helpers/step.helper';

/**
 * Workflows list page — LOCAL engine (BYOK) E2E.
 *
 * After the cloud→local transition the page is backed by the embedded local
 * engine (electron/ipc/iris.ts → iris-host-local). This verifies the new list
 * UI renders in a real Electron window.
 *
 * New-UI selectors (src/app/workflows/WorkflowsPage.tsx):
 *   - Sidebar nav:    button:has-text("Workflows")
 *   - Heading:        h1:has-text("Workflows")
 *   - Subtitle:       text=Local workflows run on your machine
 *   - New workflow:   button:has-text("New workflow")
 *   - API keys:       button:has-text("API keys")
 *   - Empty state:    text=No workflows yet
 */

test.describe('Workflows Page (local engine)', () => {
  test.beforeEach(async ({ page }) => {
    const navClick = await safeClick(
      page,
      'button:has-text("Workflows")',
      'Navigate to Workflows',
      { timeout: 15_000 }
    );
    assertStep(navClick);

    const heading = await safeExpectVisible(
      page,
      'h1:has-text("Workflows")',
      'Workflows page loaded',
      { timeout: 15_000 }
    );
    assertStep(heading);
  });

  test('renders local BYOK heading + subtitle', async ({ page }) => {
    assertStep(
      await safeExpectVisible(
        page,
        'h1:has-text("Workflows")',
        'Workflows heading is visible'
      )
    );

    assertStep(
      await safeExpectVisible(
        page,
        'text=Local workflows run on your machine',
        'BYOK subtitle is visible'
      )
    );
  });

  test('shows New workflow + API keys actions', async ({ page }) => {
    assertStep(
      await safeExpectVisible(
        page,
        'button:has-text("New workflow")',
        'New workflow button is visible'
      )
    );

    assertStep(
      await safeExpectVisible(
        page,
        'button:has-text("API keys")',
        'API keys button is visible'
      )
    );
  });

  test('shows workflow cards or empty state (no loading hang)', async ({ page }) => {
    // The list loads from the local engine REST. Wait for the "Loading…"
    // placeholder to clear, which proves the renderer reached the engine.
    await page
      .locator('text=Loading…')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {
        /* may never have rendered if the list resolved instantly */
      });

    const hasEmptyState = await page
      .locator('text=No workflows yet')
      .isVisible()
      .catch(() => false);

    const hasCards = await page
      .locator('div.grid > button')
      .first()
      .isVisible()
      .catch(() => false);

    // Either an empty-state or a populated grid must be present — and crucially
    // NOT an error banner (which would mean the engine REST failed).
    const hasError = await page
      .locator('text=Failed to load workflows')
      .isVisible()
      .catch(() => false);

    expect(hasError, 'local engine REST should not error').toBeFalsy();
    expect(hasEmptyState || hasCards, 'list or empty state visible').toBeTruthy();
  });
});
