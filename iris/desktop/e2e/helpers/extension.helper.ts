import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helpers for the extension-system E2E spec.
 *
 * Two things here are not "just Playwright":
 *
 *  1. **Installing goes through IPC, not the UI.** The developer entry point is
 *     "Install from local folder", which opens the OS folder picker — a native
 *     dialog Playwright's Electron driver cannot touch. The spec asserts the
 *     button is there and then calls the same `extensions:install` channel the
 *     button calls, with the directory the picker would have returned.
 *  2. **The extension under test is materialized from a template.** The fixture
 *     in e2e/test-extensions/e2e-probe/ carries `__PROBE_GEN__` placeholders;
 *     `materializeProbe()` stamps out a real extension directory per generation
 *     so an upgrade reinstall has something newer to install.
 */

// ─── Ids the fixture extension contributes ───

export const PROBE_ID = 'e2etest.e2e-probe';
export const PROBE_HELLO_COMMAND = 'e2etest.e2e-probe.hello';
export const PROBE_FILEINFO_COMMAND = 'e2etest.e2e-probe.fileInfo';
export const PROBE_TOOL = 'e2etest.e2e-probe.probeTool';

/** Titles as declared in the manifest — chips must show these, not raw ids. */
export const PROBE_HELLO_TITLE = 'E2E Probe: Hello';
export const PROBE_TOOL_TITLE = 'E2E Probe Tool';

// ─── Fixture materialization ───

export type ProbeGeneration = 'v1' | 'v2';

const PROBE_TEMPLATE_DIR = path.resolve(__dirname, '../test-extensions/e2e-probe');
const PROBE_TEMPLATE_FILES = ['iris-extension.json', 'main.js'];
const PROBE_SEMVER: Record<ProbeGeneration, string> = { v1: '1.0.0', v2: '2.0.0' };

/**
 * Write a loadable copy of the probe extension for one generation into a temp
 * directory and return its path (what the folder picker would have returned).
 */
export function materializeProbe(generation: ProbeGeneration): string {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `iris-e2e-probe-${generation}-`));

  for (const file of PROBE_TEMPLATE_FILES) {
    const rendered = fs
      .readFileSync(path.join(PROBE_TEMPLATE_DIR, file), 'utf-8')
      .split('__PROBE_GEN__')
      .join(generation)
      .split('__PROBE_SEMVER__')
      .join(PROBE_SEMVER[generation]);
    fs.writeFileSync(path.join(outDir, file), rendered, 'utf-8');
  }

  return outDir;
}

/** Install root inside the TEST_MODE userData dir (electron/main.ts). */
export const INSTALLED_EXTENSIONS_DIR = path.resolve(
  __dirname,
  '../.test-user-data/extensions'
);

/**
 * Drop every installed extension + the registry, so a run starts from "nothing
 * installed". Call while no app is running.
 */
export function resetInstalledExtensions(): void {
  fs.rmSync(INSTALLED_EXTENSIONS_DIR, { recursive: true, force: true });
}

// ─── Extension IPC (same channels the UI uses) ───

interface InstallResult {
  success: boolean;
  error?: string;
  extensionId?: string;
}

interface ExecuteResult {
  success: boolean;
  result?: unknown;
  error?: string;
  /** Round-trip time measured in the renderer. */
  elapsedMs: number;
}

/**
 * Install from a directory — stands in for the native folder picker.
 *
 * Deliberately a single attempt, including for upgrade reinstalls. Those used
 * to need a retry: deactivation returned before the OS had released the
 * extension worker's handle on the old entry file, so the delete→recreate of
 * the install directory hit `EPERM: operation not permitted, mkdir` on Windows
 * (reproducible on the first try, gone ~1.5s later). The host process now waits
 * for `worker.terminate()` before reporting 'deactivated', and the manager
 * retries a still-held directory itself — so if that regresses, the upgrade
 * test below fails here instead of hiding behind a retry.
 */
export function installExtension(
  page: Page,
  sourceDir: string,
  options: { upgrade?: boolean } = {}
): Promise<InstallResult> {
  return page.evaluate(
    async ({ dir, opts }) => {
      try {
        return await window.electronAPI.extensions.install(dir, 'community', opts);
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
    { dir: sourceDir, opts: options }
  );
}

export function executeCommand(page: Page, commandId: string): Promise<ExecuteResult> {
  return page.evaluate(async (id) => {
    const startedAt = Date.now();
    try {
      const result = await window.electronAPI.extensions.executeCommand(id, []);
      return { ...result, elapsedMs: Date.now() - startedAt };
    } catch (err) {
      return { success: false, error: String(err), elapsedMs: Date.now() - startedAt };
    }
  }, commandId);
}

export function executeTool(page: Page, toolId: string): Promise<ExecuteResult> {
  return page.evaluate(async (id) => {
    const startedAt = Date.now();
    try {
      const result = await window.electronAPI.extensions.executeTool(id, {});
      return { ...result, elapsedMs: Date.now() - startedAt };
    } catch (err) {
      return { success: false, error: String(err), elapsedMs: Date.now() - startedAt };
    }
  }, toolId);
}

export function getExtensionStatus(
  page: Page,
  extensionId: string = PROBE_ID
): Promise<{ status?: string; grantedPermissions?: string[] } | null> {
  return page.evaluate((id) => window.electronAPI.extensions.getStatus(id), extensionId);
}

/** Wait until the extension host reports the extension as running. */
export async function expectExtensionActive(
  page: Page,
  extensionId: string = PROBE_ID
): Promise<void> {
  await expect
    .poll(async () => (await getExtensionStatus(page, extensionId))?.status ?? 'missing', {
      timeout: 30_000,
      message: `Extension "${extensionId}" should reach status "active"`,
    })
    .toBe('active');
}

/**
 * Approve the permission dialog raised by an install.
 * All requested permissions are pre-selected, so "Allow selected" grants them all.
 */
export async function approvePermissionDialog(page: Page): Promise<void> {
  const dialogTitle = page.locator('h2:has-text("Permission Request")');
  await expect(dialogTitle).toBeVisible({ timeout: 30_000 });
  await page.locator('button:has-text("Allow selected")').first().click();
  await expect(dialogTitle).toBeHidden({ timeout: 15_000 });
}

// ─── UI surfaces ───

/** Status bar item contributed by iris.window.setStatusBarItem. */
export const statusBarItem = (page: Page, generation: ProbeGeneration): Locator =>
  page.getByText(`E2E-PROBE-STATUS ${generation}`, { exact: true });

/** Panel iframe for one generation (ExtensionPanel titles the iframe). */
export const panelIframe = (page: Page, generation: ProbeGeneration): Locator =>
  page.locator(`iframe[title="Extension Panel: E2E Probe Panel ${generation}"]`);

export const anyPanelIframe = (page: Page): Locator =>
  page.locator('iframe[title^="Extension Panel"]');

/** Run chips on the Extensions page — `title` carries the contribution id. */
export const commandChip = (page: Page): Locator =>
  page.locator(`button[title="${PROBE_HELLO_COMMAND}"]`);

export const toolChip = (page: Page): Locator =>
  page.locator(`button[title="${PROBE_TOOL}"]`);

/**
 * Navigate to the Extensions page (the run surface for installed extensions).
 *
 * ExtensionsPage is gated behind `isServerConnected`, so this fails loudly with
 * the prerequisite instead of timing out on a missing chip when VITE_API_URL
 * has no reachable /health.
 */
export async function openExtensionsPage(page: Page): Promise<void> {
  await page.locator('aside button', { hasText: 'Extensions' }).first().click();

  const localInstallButton = page.locator('button:has-text("Install from local folder")');
  const serverGate = page.locator('text=Server connection required');

  await expect
    .poll(
      async () => {
        if (await localInstallButton.count()) return 'ready';
        if (await serverGate.count()) return 'server-gated';
        return 'pending';
      },
      { timeout: 30_000, message: 'Extensions page should render' }
    )
    .not.toBe('pending');

  if (await serverGate.count()) {
    throw new Error(
      'Extensions page is gated behind a server connection. ' +
        'The extension spec needs VITE_API_URL (e2e runs with iris/desktop/.env → ' +
        'http://localhost:4000) to answer GET /health.'
    );
  }

  await expect(localInstallButton).toBeVisible();
}

/**
 * Panel iframes are sandboxed without `allow-same-origin`, so `frameLocator`
 * cannot reach in — resolve the frame through the element handle instead.
 */
export async function panelContentFrame(page: Page, generation: ProbeGeneration) {
  const handle = await panelIframe(page, generation).elementHandle();
  if (!handle) throw new Error(`Panel iframe for generation "${generation}" not found`);
  const frame = await handle.contentFrame();
  if (!frame) {
    throw new Error(`Panel iframe for generation "${generation}" has no content frame`);
  }
  return frame;
}
