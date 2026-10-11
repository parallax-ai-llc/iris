import type { ElectronApplication } from 'playwright';
import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  currentPage,
  openImageEditor,
  openVideoEditor,
  waitForStores,
  blurActive,
  readStore,
} from '../../helpers/shortcut.helper';

/**
 * App-level keyboard shortcuts: sidebar navigation (Ctrl+1..0, Ctrl+,) outside
 * the editors, and "Ctrl+W must never close the Electron window" inside them.
 */

test.describe('Global shortcuts', () => {
  // 11 --------------------------------------------------------------------
  test('Ctrl+1..0 and Ctrl+, navigate between pages outside the editors', async ({ page }) => {
    await waitForStores(page);
    await blurActive(page);
    // Start from a known page that is none of the targets below.
    await page.evaluate(() => {
      (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => any }> }).__ZUSTAND_STORES__
        .ui.getState()
        .setCurrentPage('home');
    });
    expect(await currentPage(page)).toBe('home');

    const targets: Array<[string, string]> = [
      ['Control+2', 'templates'],
      ['Control+3', 'images'],
      ['Control+4', 'videos'],
      ['Control+5', 'projects'],
      ['Control+6', 'workflows'],
      ['Control+7', 'batch'],
      ['Control+8', 'extensions'],
      ['Control+9', 'library'],
      ['Control+0', 'storage'],
      ['Control+,', 'settings'],
      ['Control+1', 'home'],
    ];
    for (const [keys, expected] of targets) {
      await blurActive(page);
      await page.keyboard.press(keys);
      await expect
        .poll(() => currentPage(page), { message: `${keys} -> ${expected}`, timeout: 5_000 })
        .toBe(expected);
    }
  });

  // 12 --------------------------------------------------------------------
  /**
   * Install a close-event counter in the main process, press Ctrl+W, then report
   * what happened to the BrowserWindow. A hidden window closes on the first
   * `close` event (main.ts only intercepts visible windows), so the number of
   * `close` events is the signal that matters, not just isDestroyed().
   */
  async function pressCtrlWAndInspect(
    electronApp: ElectronApplication,
    press: () => Promise<void>,
  ): Promise<{ closeEvents: number; windows: number; destroyed: boolean; menuAccelerators: string[] }> {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const g = globalThis as unknown as { __closeEvents?: number };
      g.__closeEvents = 0;
      for (const w of BrowserWindow.getAllWindows()) w.on('close', () => { g.__closeEvents = (g.__closeEvents ?? 0) + 1; });
    });
    await press();
    await new Promise((r) => setTimeout(r, 2_000));
    try {
      return await electronApp.evaluate(({ BrowserWindow, Menu }) => {
        const wins = BrowserWindow.getAllWindows();
        const accel: string[] = [];
        const walk = (items: Electron.MenuItem[], trail: string) => {
          for (const it of items) {
            const label = `${trail}/${it.label || it.role || ''}`;
            if (it.accelerator && /w$/i.test(String(it.accelerator))) accel.push(`${label} [${it.accelerator}] role=${it.role ?? '-'}`);
            if (it.submenu) walk(it.submenu.items, label);
          }
        };
        const menu = Menu.getApplicationMenu();
        if (menu) walk(menu.items, '');
        return {
          closeEvents: (globalThis as unknown as { __closeEvents?: number }).__closeEvents ?? 0,
          windows: wins.length,
          destroyed: wins.length === 0 ? true : wins[0].isDestroyed(),
          menuAccelerators: accel,
        };
      });
    } catch {
      // The main process is gone: the app quit.
      return { closeEvents: -1, windows: 0, destroyed: true, menuAccelerators: [] };
    }
  }

  test('Ctrl+W in the video editor does not close the window', async ({ page, electronApp }) => {
    await openVideoEditor(page);
    await blurActive(page);

    const r = await pressCtrlWAndInspect(electronApp, () => page.keyboard.press('Control+w'));
    test.info().annotations.push({ type: 'application-menu-w-accelerators', description: JSON.stringify(r.menuAccelerators) });

    expect(r.closeEvents, `window received ${r.closeEvents} close event(s); menu accelerators: ${JSON.stringify(r.menuAccelerators)}`).toBe(0);
    expect(r.windows).toBe(1);
    expect(r.destroyed).toBe(false);
    expect(electronApp.windows().length).toBe(1);
    expect(page.isClosed()).toBe(false);
    // The editor itself is still up.
    expect(await readStore(page, 'editor', (s) => s.isEditorOpen as boolean)).toBe(true);
  });

  test('Ctrl+W in the image editor does not close the window', async ({ page, electronApp }) => {
    await openImageEditor(page);
    await blurActive(page);

    const r = await pressCtrlWAndInspect(electronApp, () => page.keyboard.press('Control+w'));
    test.info().annotations.push({ type: 'application-menu-w-accelerators', description: JSON.stringify(r.menuAccelerators) });

    expect(r.closeEvents, `window received ${r.closeEvents} close event(s); menu accelerators: ${JSON.stringify(r.menuAccelerators)}`).toBe(0);
    expect(r.windows).toBe(1);
    expect(r.destroyed).toBe(false);
    expect(electronApp.windows().length).toBe(1);
    expect(page.isClosed()).toBe(false);
    // The editor's own "close tab" handler is what Ctrl+W is for: the tab goes away, the window stays.
    await expect.poll(async () => readStore(page, 'editorTabs', (s) => s.tabs.length as number)).toBe(0);
  });

  /**
   * Why this test exists: Playwright/CDP key events never reach Electron's menu
   * accelerators (verified: Ctrl+R does not reload the page when sent with
   * page.keyboard), so the two "Ctrl+W" tests above cannot prove that a real
   * keyboard press leaves the window alone. A real Ctrl+W that no page handler
   * consumes falls through to the application menu. Electron installs a default
   * menu when the app never calls Menu.setApplicationMenu, and that menu has
   * Window > Close with CommandOrControl+W (role "close"). So the structural
   * fact to assert is: no application-menu item may own the Ctrl+W accelerator.
   */
  test('application menu has no Ctrl+W (close window) accelerator', async ({ electronApp }) => {
    // The app installs its menu right before creating the main window; reading
    // earlier would see Electron's default menu.
    await electronApp.firstWindow();
    const closeAccelerators = await electronApp.evaluate(({ Menu }) => {
      const hits: string[] = [];
      const walk = (items: Electron.MenuItem[], trail: string) => {
        for (const it of items) {
          const label = `${trail}/${it.label || it.role || ''}`;
          const accel = String(it.accelerator ?? '');
          if (/^(commandorcontrol|cmdorctrl|control|ctrl|command|cmd)\+w$/i.test(accel)) {
            hits.push(`${label} [${accel}] role=${it.role ?? '-'}`);
          }
          if (it.submenu) walk(it.submenu.items, label);
        }
      };
      const menu = Menu.getApplicationMenu();
      if (menu) walk(menu.items, '');
      return hits;
    });
    expect(closeAccelerators, 'menu items that close the window on Ctrl+W').toEqual([]);
  });
});
