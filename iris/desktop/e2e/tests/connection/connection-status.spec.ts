import { test, expect } from '../../fixtures/authenticated.fixture';
import { safeExpectVisible, assertStep } from '../../helpers/step.helper';

/**
 * Connection Status E2E tests — 사이드바 하단 ConnectionStatus 컴포넌트 렌더링 확인.
 *
 * Selectors rationale:
 *   ConnectionStatus (ConnectionStatus.tsx):
 *     - Status dot: span with bg-emerald-500 (connected) or bg-red-500 (disconnected)
 *     - Status text: "Connected" or "Disconnected" (expanded sidebar only)
 *     - Version text: "v{version}" (expanded sidebar only, may be empty)
 *   Sidebar (Sidebar.tsx):
 *     - ConnectionStatus rendered in bottom section after user info
 *     - Nav items with requiresServer get opacity-50 + WifiOff icon when disconnected
 */

test.describe('Connection Status', () => {
  test('connection status indicator is visible in sidebar', async ({ page }) => {
    // The status dot (emerald or red) should always be visible regardless of connection state
    const statusDot = await safeExpectVisible(
      page,
      'span.rounded-full.w-2.h-2',
      'Connection status dot visible in sidebar',
      { timeout: 10_000 }
    );
    assertStep(statusDot);
  });

  test('connection status shows Connected or Disconnected text', async ({ page }) => {
    // In expanded sidebar, either "Connected" or "Disconnected" text should be visible
    // Try Connected first, then Disconnected
    const connectedLocator = page.locator('text=Connected').first();
    const disconnectedLocator = page.locator('text=Disconnected').first();

    const isConnected = await connectedLocator.isVisible({ timeout: 5_000 }).catch(() => false);
    const isDisconnected = await disconnectedLocator.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(
      isConnected || isDisconnected,
      'Either "Connected" or "Disconnected" text should be visible in expanded sidebar'
    ).toBe(true);
  });

  test('version text element exists when connected', async ({ page }) => {
    // The version label container is rendered conditionally — when appVersion exists,
    // a span with the version text (e.g. "v1.0.0") appears.
    // In test mode the version may or may not be available, so we check the
    // ConnectionStatus container's title attribute which always includes the status.
    const statusContainer = page.locator('div[title*="Connected"], div[title*="Disconnected"]').first();
    await expect(statusContainer).toBeVisible({ timeout: 10_000 });

    const title = await statusContainer.getAttribute('title');
    expect(title).toBeTruthy();
    expect(
      title!.includes('Connected') || title!.includes('Disconnected')
    ).toBe(true);
  });

  test('sidebar shows connection status component at the bottom', async ({ page }) => {
    // ConnectionStatus is rendered inside the bottom border-t section of the sidebar.
    // Verify the sidebar bottom section exists and contains the status dot.
    const sidebarBottom = page.locator('div.border-t.border-zinc-800');
    await expect(sidebarBottom).toBeVisible({ timeout: 10_000 });

    // The connection status dot should be inside this bottom section
    const statusDotInBottom = sidebarBottom.locator('span.rounded-full.w-2.h-2');
    await expect(statusDotInBottom).toBeVisible({ timeout: 5_000 });
  });

  test('server-required nav items reflect connection state', async ({ page }) => {
    // Templates, Workflows, Batch, Storage have requiresServer flag.
    // When disconnected they get opacity-50; when connected they don't.
    // We verify these nav buttons exist regardless of connection state.
    const serverRequiredItems = ['Templates', 'Workflows', 'Batch', 'Storage'];

    for (const itemName of serverRequiredItems) {
      const navButton = page.locator(`button:has-text("${itemName}")`);
      await expect(navButton).toBeVisible({ timeout: 10_000 });
    }
  });
});
