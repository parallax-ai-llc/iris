import { test, expect } from '../../fixtures/extension-app.fixture';
import type { Page } from '@playwright/test';
import {
  PROBE_ID,
  PROBE_HELLO_COMMAND,
  PROBE_FILEINFO_COMMAND,
  PROBE_TOOL,
  PROBE_HELLO_TITLE,
  PROBE_TOOL_TITLE,
  anyPanelIframe,
  approvePermissionDialog,
  commandChip,
  executeCommand,
  executeTool,
  expectExtensionActive,
  getExtensionStatus,
  installExtension,
  materializeProbe,
  openExtensionsPage,
  panelContentFrame,
  panelIframe,
  resetInstalledExtensions,
  statusBarItem,
  toolChip,
} from '../../helpers/extension.helper';

/**
 * Extension system E2E — the developer loop and the runtime surfaces it produces.
 *
 * Replaces the one-off driver scripts the extension system was verified with, so
 * the regressions those runs caught stay caught:
 *   - generation guard: after an upgrade reinstall the command/tool registry used
 *     to die 2–5s later ("command not found"), so the upgrade test keeps running
 *     both for well over 15s;
 *   - contribution hydration: status bar + panel must come back on the next launch
 *     without reinstalling;
 *   - panel sandbox: the iframe carries `allow-scripts` WITHOUT `allow-same-origin`,
 *     so panel HTML must not be able to reach `top`/`parent` (that is what stands
 *     between a `ui:panel`-only extension and the full `electronAPI`);
 *   - docked layout: an open panel must reserve layout width, not float over app UI.
 *
 * Prerequisites
 *   - `dist-electron/main.js` is built (same as every other desktop E2E spec).
 *   - VITE_API_URL answers GET /health: ExtensionsPage — the only surface that
 *     lists installed extensions and their run chips — is gated on the connection
 *     store. `openExtensionsPage()` fails with that message when it is not.
 *
 * No login: the extension runtime is entirely local, so this file runs in the
 * `no-auth` project and never depends on auth-setup.
 *
 * Serial and stateful by design: test 1 installs into e2e/.test-user-data and the
 * later tests relaunch the app on top of that state, which is exactly what
 * "restart" and "upgrade in place" mean.
 *
 * Selectors
 *   - Sidebar entry:      aside button "Extensions"
 *   - Local install:      button "Install from local folder" (native picker → IPC)
 *   - Permission dialog:  h2 "Permission Request" / button "Allow selected"
 *   - Run chips:          button[title="<command|tool id>"]
 *   - Status bar item:    text "E2E-PROBE-STATUS <gen>"
 *   - Panel:              iframe[title="Extension Panel: E2E Probe Panel <gen>"]
 *   - Dock layout:        .ext-panel-dock, .dt-shell-body, --ext-panel-width
 */

/** How long the upgraded generation has to keep working (regression window). */
const GENERATION_GUARD_MS = 15_000;
const GENERATION_POLL_MS = 2_500;

/** Toasts stack and auto-dismiss after 5s — `.first()` keeps assertions strict-mode safe. */
const toast = (page: Page, text: string) => page.getByText(text).first();

const readDockLayout = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector('.dt-shell-body');
    const dock = document.querySelector('.ext-panel-dock');
    return {
      extPanelWidth: getComputedStyle(document.documentElement)
        .getPropertyValue('--ext-panel-width')
        .trim(),
      bodyPaddingRight: body ? getComputedStyle(body).paddingRight : null,
      dockWidth: dock ? getComputedStyle(dock).width : null,
    };
  });

test.describe.serial('Extensions — developer loop and runtime surfaces', () => {
  // Leave no probe behind: an installed extension keeps contributing a status
  // bar item and a 320px panel dock to every later spec's app window.
  test.afterAll(() => {
    resetInstalledExtensions();
  });

  test('installs from a local folder, activates on approval, and runs its contributions', async ({
    launchApp,
  }) => {
    // Nothing installed: this is a first-time developer install, not a reinstall.
    resetInstalledExtensions();

    const { page } = await launchApp();

    // The developer entry point lives on the Extensions page. Its click opens the
    // OS folder picker, which Playwright cannot drive — assert the button exists,
    // then call the channel it calls with the directory the picker would return.
    await openExtensionsPage(page);

    const install = await installExtension(page, materializeProbe('v1'));
    expect(install, `install failed: ${install.error ?? ''}`).toMatchObject({
      success: true,
      extensionId: PROBE_ID,
    });

    // `image:read` is medium risk and the tier is `community`, so approval is
    // required — and approving must activate without restarting the app.
    await approvePermissionDialog(page);
    await expectExtensionActive(page);

    const granted = (await getExtensionStatus(page))?.grantedPermissions ?? [];
    expect(granted).toEqual(
      expect.arrayContaining(['commands:register', 'image:read', 'ui:panel', 'tools:register'])
    );

    // Runtime surfaces contributed at activation.
    await expect(statusBarItem(page, 'v1')).toBeVisible({ timeout: 20_000 });
    await expect(panelIframe(page, 'v1')).toBeVisible({ timeout: 20_000 });

    // Run chips: labelled with the manifest title, not the raw contribution id.
    await openExtensionsPage(page);
    await expect(page.locator('h2:has-text("Installed extensions")')).toBeVisible({
      timeout: 20_000,
    });
    await expect(commandChip(page)).toHaveText(PROBE_HELLO_TITLE);
    await expect(toolChip(page)).toHaveText(PROBE_TOOL_TITLE);

    // Clicking the command chip runs the extension's handler…
    await commandChip(page).click();
    await expect(toast(page, 'hello from extension v1')).toBeVisible({ timeout: 15_000 });
    await expect(toast(page, `Ran "${PROBE_HELLO_TITLE}"`)).toBeVisible({ timeout: 15_000 });

    // …and so does the tool chip.
    await toolChip(page).click();
    await expect(toast(page, 'tool ran v1')).toBeVisible({ timeout: 15_000 });

    // iris.image.getActiveFileInfo round trip: main asks the renderer and waits
    // for its reply. With no document open the answer is null → 'fileinfo-none'.
    // The 10s bridge timeout would also resolve null, so the elapsed time is what
    // proves the renderer actually answered.
    const fileInfo = await executeCommand(page, PROBE_FILEINFO_COMMAND);
    expect(fileInfo.success, `fileInfo failed: ${fileInfo.error ?? ''}`).toBe(true);
    expect(fileInfo.result).toBe('fileinfo-none');
    expect(fileInfo.elapsedMs).toBeLessThan(5_000);
    await expect(toast(page, 'fileinfo: no active image')).toBeVisible({ timeout: 15_000 });
  });

  test('keeps commands and tools alive after an upgrade reinstall', async ({ launchApp }) => {
    test.setTimeout(180_000);

    const { page } = await launchApp();
    await expectExtensionActive(page);

    // Baseline: the previously installed generation is the one running.
    const before = await executeCommand(page, PROBE_HELLO_COMMAND);
    expect(before.success, `baseline command failed: ${before.error ?? ''}`).toBe(true);
    expect(before.result).toBe('hello-return-v1');

    // One attempt on purpose: the delete→recreate EPERM race this used to retry
    // is fixed in the manager/host (see installExtension).
    const upgrade = await installExtension(page, materializeProbe('v2'), {
      upgrade: true,
    });
    expect(upgrade, `upgrade failed: ${upgrade.error ?? ''}`).toMatchObject({
      success: true,
      extensionId: PROBE_ID,
    });

    // Permissions already granted for this id carry over, so no dialog is
    // expected — but never let a stray one wedge the run.
    if (await page.locator('button:has-text("Allow selected")').count()) {
      await approvePermissionDialog(page);
    }

    await expectExtensionActive(page);

    // The generation-guard regression: contributions from the *previous*
    // generation were torn down a few seconds after the new one registered, so
    // both surfaces went "not found" at ~2–5s. Keep exercising them past that.
    const startedAt = Date.now();
    const timeline: Array<{ atMs: number; command: unknown; tool: unknown }> = [];

    while (Date.now() - startedAt < GENERATION_GUARD_MS) {
      await page.waitForTimeout(GENERATION_POLL_MS);

      const command = await executeCommand(page, PROBE_HELLO_COMMAND);
      const tool = await executeTool(page, PROBE_TOOL);
      const atMs = Date.now() - startedAt;
      timeline.push({
        atMs,
        command: command.result ?? command.error,
        tool: tool.result ?? tool.error,
      });

      expect(
        command.success,
        `command died ${atMs}ms after the upgrade: ${command.error ?? ''}`
      ).toBe(true);
      expect(tool.success, `tool died ${atMs}ms after the upgrade: ${tool.error ?? ''}`).toBe(
        true
      );
      // The upgraded build is the one answering — not a surviving old worker.
      expect(command.result, `wrong generation at ${atMs}ms`).toBe('hello-return-v2');
      expect(tool.result, `wrong generation at ${atMs}ms`).toBe('tool-return-v2');
    }

    expect(
      timeline.length,
      `expected several probes across ${GENERATION_GUARD_MS}ms, got ${JSON.stringify(timeline)}`
    ).toBeGreaterThanOrEqual(3);

    // Surfaces belong to the new generation, with no ghost left from the old one.
    await expect(statusBarItem(page, 'v2')).toBeVisible({ timeout: 20_000 });
    await expect(statusBarItem(page, 'v1')).toHaveCount(0);
    await expect(panelIframe(page, 'v2')).toBeVisible({ timeout: 20_000 });
    await expect(panelIframe(page, 'v1')).toHaveCount(0);

    // Chips still execute the upgraded handlers. Let the toasts from the polling
    // loop expire first, so what is asserted below can only come from the click.
    await openExtensionsPage(page);
    await expect(page.getByText('tool ran v2')).toHaveCount(0, { timeout: 15_000 });
    await expect(toolChip(page)).toBeVisible({ timeout: 20_000 });
    await toolChip(page).click();
    await expect(toast(page, 'tool ran v2')).toBeVisible({ timeout: 15_000 });
  });

  test('restores the status bar and panel after an app restart', async ({ launchApp }) => {
    // A brand-new app process over the same userData — nothing is installed or
    // enabled here, so anything visible came from the contribution snapshot.
    const { page } = await launchApp();

    await expectExtensionActive(page);
    await expect(statusBarItem(page, 'v2')).toBeVisible({ timeout: 30_000 });
    await expect(panelIframe(page, 'v2')).toBeVisible({ timeout: 30_000 });

    const command = await executeCommand(page, PROBE_HELLO_COMMAND);
    expect(command.success, `command failed after restart: ${command.error ?? ''}`).toBe(true);
    expect(command.result).toBe('hello-return-v2');
  });

  test('sandboxes the panel iframe away from the host renderer', async ({ launchApp }) => {
    const { page } = await launchApp();
    await expect(panelIframe(page, 'v2')).toBeVisible({ timeout: 30_000 });

    // The sandbox attribute must never gain allow-same-origin: combined with
    // allow-scripts it would hand panel HTML parent.electronAPI.
    await expect(panelIframe(page, 'v2')).toHaveAttribute('sandbox', 'allow-scripts');

    const frame = await panelContentFrame(page, 'v2');

    const probe = await frame.evaluate(() => {
      const reach = (fn: () => unknown): string => {
        try {
          fn();
          return 'ACCESSIBLE';
        } catch (err) {
          return (err as Error).name;
        }
      };
      return {
        // Opaque origin — `document.origin` is not implemented in this Chromium,
        // so read the two standard spellings instead.
        locationOrigin: String(location.origin),
        windowOrigin: String(window.origin),
        top: reach(() => (window.top as unknown as { electronAPI?: unknown }).electronAPI),
        parent: reach(() => (window.parent as unknown as { electronAPI?: unknown }).electronAPI),
        parentDocument: reach(() => window.parent.document),
        body: document.body.textContent,
      };
    });

    expect(probe.locationOrigin).toBe('null');
    expect(probe.windowOrigin).toBe('null');
    expect(probe.top).toBe('SecurityError');
    expect(probe.parent).toBe('SecurityError');
    expect(probe.parentDocument).toBe('SecurityError');
    // Sanity: the panel really is the extension's document, not an empty frame.
    expect(probe.body).toContain('E2E PANEL BODY v2');
  });

  test('docks the panel so app UI stays clickable', async ({ launchApp }) => {
    const { page } = await launchApp();
    await expect(anyPanelIframe(page)).toHaveCount(1, { timeout: 30_000 });

    await page.locator('aside button', { hasText: 'Images' }).first().click();

    const newButton = page.locator('button', { hasText: 'New' }).first();
    const uploadButton = page.locator('button', { hasText: 'Upload' }).first();
    await expect(newButton).toBeVisible({ timeout: 30_000 });

    // Trial clicks: they assert the control is hit-testable at its own
    // coordinates (i.e. the dock is not on top of it) without firing the
    // handlers — a real "Upload" click opens a native file dialog.
    await newButton.click({ trial: true, timeout: 10_000 });
    await uploadButton.click({ trial: true, timeout: 10_000 });

    // The dock takes real layout width instead of floating over the shell.
    const layout = await readDockLayout(page);
    expect(layout.extPanelWidth).toBe('320px');
    expect(layout.dockWidth).toBe('320px');
    expect(layout.bodyPaddingRight).toBe('320px');
  });
});
