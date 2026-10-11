import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  PROBE_ID,
  PROBE_HELLO_TITLE,
  PROBE_TOOL_TITLE,
  approvePermissionDialog,
  commandChip,
  expectExtensionActive,
  getExtensionStatus,
  installExtension,
  materializeProbe,
  openExtensionsPage,
  resetInstalledExtensions,
  statusBarItem,
  toolChip,
} from '../../helpers/extension.helper';
import { assertClean, installSandbox, trackErrors, type ErrorLog } from '../../helpers/pages.helper';

/**
 * Basic-feature specs, part 5: Extensions (9), with the existing e2e-probe extension.
 *
 * The cloud marketplace is not used. The extension is installed from the local test folder
 * (IPC, the same call the "Install from local folder" button makes after its native picker) and
 * the surfaces it produces are checked on the Extensions page. The page has no enable/disable
 * switch, so on/off goes through the IPC the main process exposes (recorded as not-implemented UI).
 * /health is answered by the sandbox so the page is not gated behind the cloud connection.
 *
 * Serial: later tests build on the installed probe; afterAll removes it again.
 */

let errors: ErrorLog;

test.describe.serial('9. Extensions', () => {
  test.afterAll(() => {
    resetInstalledExtensions();
  });

  test.beforeEach(async ({ page }) => {
    errors = trackErrors(page);
    await installSandbox(page);
    await page.reload();
    await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
  });
  test.afterEach(async ({ page }) => {
    await assertClean(page, errors);
  });

  test('page lists the marketplace shell and the local-install entry point', async ({ page }) => {
    resetInstalledExtensions();
    await openExtensionsPage(page);
    await expect(page.getByRole('heading', { name: 'Extension Marketplace' })).toBeVisible();
    await expect(page.locator('button:has-text("Install from local folder")')).toBeVisible();
    await expect(page.locator('h2:has-text("Installed extensions")')).toHaveCount(0); // nothing installed yet
  });

  test('installing the probe asks for permissions, activates it and lists its commands', async ({ page }) => {
    await openExtensionsPage(page);
    const result = await installExtension(page, materializeProbe('v1'));
    expect(result, `install failed: ${result.error ?? ''}`).toMatchObject({ success: true, extensionId: PROBE_ID });
    await approvePermissionDialog(page);
    await expectExtensionActive(page);

    await openExtensionsPage(page);
    await expect(page.locator('h2:has-text("Installed extensions")')).toBeVisible({ timeout: 20_000 });
    await expect(commandChip(page)).toHaveText(PROBE_HELLO_TITLE);
    await expect(toolChip(page)).toHaveText(PROBE_TOOL_TITLE);
    await expect(statusBarItem(page, 'v1')).toBeVisible({ timeout: 20_000 });
  });

  test('running an installed command from the list reports its result', async ({ page }) => {
    await openExtensionsPage(page);
    await expect(commandChip(page)).toBeVisible({ timeout: 20_000 });
    await commandChip(page).click();
    await expect(page.getByText('hello from extension v1').first()).toBeVisible({ timeout: 15_000 });
  });

  test('disable removes the extension contributions; enable brings them back', async ({ page }) => {
    await openExtensionsPage(page);
    await expect(commandChip(page)).toBeVisible({ timeout: 20_000 });

    // The page itself has no switch: that gap is recorded, the behaviour is checked through the IPC.
    const switches = page.locator('[role="switch"], input[type="checkbox"]');
    if ((await switches.count()) === 0) {
      test.info().annotations.push({
        type: 'not-implemented',
        description: 'Extensions page has no enable/disable control for an installed extension (uninstall exists only on marketplace cards)',
      });
    }

    const off = await page.evaluate((id) => window.electronAPI.extensions.disable(id), PROBE_ID);
    expect(off, 'disable result').toBeTruthy();
    await expect
      .poll(async () => (await getExtensionStatus(page))?.status ?? 'missing', { timeout: 20_000 })
      .not.toBe('active');
    await openExtensionsPage(page);
    await expect(commandChip(page), 'a disabled extension offers no runnable command').toHaveCount(0, { timeout: 10_000 });
    await expect(statusBarItem(page, 'v1')).toHaveCount(0);

    const on = await page.evaluate((id) => window.electronAPI.extensions.enable(id), PROBE_ID);
    expect(on, 'enable result').toBeTruthy();
    await expectExtensionActive(page);
    await openExtensionsPage(page);
    await expect(commandChip(page)).toBeVisible({ timeout: 20_000 });
  });

  test('uninstalling removes it from the list', async ({ page }) => {
    await openExtensionsPage(page);
    const res = await page.evaluate((id) => window.electronAPI.extensions.uninstall(id), PROBE_ID);
    expect(res).toBeTruthy();
    await expect
      .poll(async () => {
        const list = (await page.evaluate(() => window.electronAPI.extensions.getInstalled())) as Array<{ id?: string; manifest?: { id?: string } }>;
        return list.some((e) => e.id === PROBE_ID || e.manifest?.id === PROBE_ID);
      }, { timeout: 15_000 })
      .toBe(false);
    await openExtensionsPage(page);
    await expect(commandChip(page)).toHaveCount(0);
  });
});
