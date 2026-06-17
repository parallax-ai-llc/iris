import { test, expect } from '../../fixtures/authenticated.fixture';
import { safeClick, safeExpectVisible, assertStep } from '../../helpers/step.helper';

/**
 * Settings → Workflow API Keys (BYOK) E2E.
 *
 * Verifies the override round-trip backed by the main process safeStorage
 * (electron/ipc/iris.ts setKey/getKeyStatus). Setting a value shows an
 * "Overridden ••••<last4>" badge; clearing it reverts to "Not set"/"From .env".
 *
 * Selectors (src/app/settings/WorkflowApiKeysSection.tsx):
 *   - Settings gear:  button:has(svg.lucide-settings)   (TitleBar)
 *   - Section:        h2:has-text("Workflow API Keys")
 *   - OpenAI input:   input[placeholder^="OPENAI_API_KEY"]
 *   - Row Save:       (row-scoped) button "Save"
 *   - Overridden:     text=Overridden
 *   - Remove:         button[title="Remove override"]
 */

const DUMMY_KEY = 'sk-e2e-openai-9999';

test.describe('Settings — Workflow API Keys (BYOK)', () => {
  test.beforeEach(async ({ page }) => {
    assertStep(
      await safeClick(
        page,
        'button:has(svg.lucide-settings)',
        'Open Settings via TitleBar gear',
        { timeout: 15_000 }
      )
    );
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible({
      timeout: 15_000,
    });

    // Scroll the BYOK section into view (it's below the account section).
    const section = page.locator('h2:has-text("Workflow API Keys")');
    await section.scrollIntoViewIfNeeded().catch(() => {});
    assertStep(
      await safeExpectVisible(
        page,
        'h2:has-text("Workflow API Keys")',
        'Workflow API Keys section visible'
      )
    );
  });

  test('set override shows badge, clear reverts', async ({ page }) => {
    const openaiInput = page.locator('input[placeholder^="OPENAI_API_KEY"]');
    await openaiInput.scrollIntoViewIfNeeded();
    await expect(openaiInput).toBeVisible({ timeout: 10_000 });

    // The OpenAI row container (has the input + its own Save button).
    const openaiRow = page
      .locator('div.p-4')
      .filter({ has: page.locator('input[placeholder^="OPENAI_API_KEY"]') });

    // Clean slate: if a prior run left an override, remove it first.
    const existingRemove = openaiRow.locator('button[title="Remove override"]');
    if (await existingRemove.isVisible().catch(() => false)) {
      await existingRemove.click();
      await expect(openaiRow.locator('text=Overridden')).toHaveCount(0, {
        timeout: 10_000,
      });
    }

    // Set the override.
    await openaiInput.fill(DUMMY_KEY);
    await openaiRow.getByRole('button', { name: 'Save' }).click();

    // Badge shows "Overridden ••••9999".
    await expect(openaiRow.locator('text=Overridden')).toBeVisible({
      timeout: 10_000,
    });
    await expect(openaiRow.locator(`text=${DUMMY_KEY.slice(-4)}`)).toBeVisible({
      timeout: 10_000,
    });

    // Clear it — badge must disappear (reverts to Not set / From .env).
    await openaiRow.locator('button[title="Remove override"]').click();
    await expect(openaiRow.locator('text=Overridden')).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
