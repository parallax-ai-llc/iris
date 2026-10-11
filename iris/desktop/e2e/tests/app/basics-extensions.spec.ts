import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  PROBE_ID,
  PROBE_HELLO_TITLE,
  PROBE_TOOL_TITLE,
  approvePermissionDialog,
  commandChip,
  extensionSwitch,
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
 * the surfaces it produces are checked on the Extensions page. On/off goes through the switch on the
 * installed-extension card (IPC extensions:enable / extensions:disable).
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
    await installSandbox(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    // collect only from the sandboxed document (the pre-reload one fetched without stand-in data)
    errors = trackErrors(page);
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

  test('the switch turns the extension off: contributions removed, command chips inert', async ({ page }) => {
    await openExtensionsPage(page);
    await expect(commandChip(page)).toBeVisible({ timeout: 20_000 });
    const sw = extensionSwitch(page);
    await expect(sw).toHaveAttribute('aria-checked', 'true');

    await sw.click();
    await expect
      .poll(async () => (await getExtensionStatus(page))?.status ?? 'missing', { timeout: 20_000 })
      .toBe('disabled');
    await expect(sw).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 });
    // the card stays listed (badge "disabled") but its command chips are inert
    await expect(page.getByText('disabled', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(commandChip(page), 'a disabled extension offers no runnable command').toBeDisabled({ timeout: 10_000 });
    await expect(statusBarItem(page, 'v1')).toHaveCount(0);
  });

  test('after a restart the extension is still off; the switch turns it back on', async ({ page }) => {
    // new app launch: the state comes from the main-process registry.json
    expect((await getExtensionStatus(page))?.status).toBe('disabled');
    await openExtensionsPage(page);
    const sw = extensionSwitch(page);
    await expect(sw).toHaveAttribute('aria-checked', 'false', { timeout: 20_000 });
    await expect(commandChip(page)).toBeDisabled();
    await expect(statusBarItem(page, 'v1')).toHaveCount(0);

    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
    await expectExtensionActive(page);
    await expect(commandChip(page)).toBeEnabled({ timeout: 20_000 });
    await expect(statusBarItem(page, 'v1')).toBeVisible({ timeout: 20_000 });
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
