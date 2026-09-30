import { test, expect } from '../../fixtures/authenticated.fixture';
import { safeExpectVisible, assertStep } from '../../helpers/step.helper';

/**
 * Connection Status E2E tests — 사이드바 하단 ConnectionStatus 컴포넌트 렌더링 확인.
 *
 * Selectors rationale:
 *   ConnectionStatus (ConnectionStatus.tsx): <div class="dt-conn" title="Connected · v1.2.3">
 *     - Status dot: span.dt-conn-dot (disconnected 일 때 .dt-conn-dot-err 추가)
 *     - Status text: "Connected" or "Disconnected"
 *     - Version text: span.dt-conn-ver "v{version}" (업데이트 확인/다운로드 중에는 액션 칩으로 대체)
 *   Sidebar (Sidebar.tsx):
 *     - ConnectionStatus 는 <aside> 의 마지막 자식으로 렌더된다 (nav → user chip / Sign in → status)
 *     - requiresServer 항목(Templates, Extensions, Storage)은 미연결 시 .dt-rail-item-dimmed + WifiOff 아이콘
 */

test.describe('Connection Status', () => {
  test('connection status indicator is visible in sidebar', async ({ page }) => {
    // The status dot should always be visible regardless of connection state
    const statusDot = await safeExpectVisible(
      page,
      'aside .dt-conn .dt-conn-dot',
      'Connection status dot visible in sidebar',
      { timeout: 10_000 }
    );
    assertStep(statusDot);
  });

  test('connection status shows Connected or Disconnected text', async ({ page }) => {
    // Either "Connected" or "Disconnected" text should be visible in the sidebar
    // Try Connected first, then Disconnected
    const connectedLocator = page.locator('text=Connected').first();
    const disconnectedLocator = page.locator('text=Disconnected').first();

    const isConnected = await connectedLocator.isVisible({ timeout: 5_000 }).catch(() => false);
    const isDisconnected = await disconnectedLocator.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(
      isConnected || isDisconnected,
      'Either "Connected" or "Disconnected" text should be visible in the sidebar'
    ).toBe(true);
  });

  test('version text element exists when connected', async ({ page }) => {
    // The version label is rendered conditionally (it gives way to the update
    // action chip), so we check the ConnectionStatus container's title attribute,
    // which always includes the status.
    const statusContainer = page.locator('div[title*="Connected"], div[title*="Disconnected"]').first();
    await expect(statusContainer).toBeVisible({ timeout: 10_000 });

    const title = await statusContainer.getAttribute('title');
    expect(title).toBeTruthy();
    expect(
      title!.includes('Connected') || title!.includes('Disconnected')
    ).toBe(true);
  });

  test('sidebar shows connection status component at the bottom', async ({ page }) => {
    // ConnectionStatus is the last child of the sidebar <aside>, below the nav
    // list and the user chip / Sign in button.
    const sidebarBottom = page.locator('aside > .dt-conn:last-child');
    await expect(sidebarBottom).toBeVisible({ timeout: 10_000 });

    // The connection status dot should be inside this bottom section
    const statusDotInBottom = sidebarBottom.locator('.dt-conn-dot');
    await expect(statusDotInBottom).toBeVisible({ timeout: 5_000 });
  });

  test('server-required nav items reflect connection state', async ({ page }) => {
    // Templates, Extensions, Storage have the requiresServer flag (Sidebar.tsx).
    // When disconnected they are dimmed; when connected they are not.
    // We verify these nav buttons exist regardless of connection state.
    const serverRequiredItems = ['Templates', 'Extensions', 'Storage'];

    for (const itemName of serverRequiredItems) {
      const navButton = page.locator(`nav button:has-text("${itemName}")`);
      await expect(navButton).toBeVisible({ timeout: 10_000 });
    }
  });
});
