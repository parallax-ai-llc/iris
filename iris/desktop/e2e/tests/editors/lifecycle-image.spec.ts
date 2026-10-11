import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { currentPage, readStore, waitForStores, blurActive } from '../../helpers/shortcut.helper';
import {
  makeTestImages,
  openFromGallery,
  openFromMenu,
  openCloudLike,
  stubSaveDialog,
  activeDoc,
  tabsSnapshot,
  tabCount,
  brushStroke,
  unsavedDialogVisible,
  discardIfAsked,
  cancelDialog,
  closeTabByX,
  activateTab,
  menu,
  canvasCorner,
  waitCorner,
  watchErrors,
  goToPage,
  remountEditor,
} from '../../helpers/lifecycle.helper';

/**
 * Document / tab lifecycle of the image editor.
 *
 * These specs describe what a user expects (no warning when nothing changed,
 * tabs never leak into each other, ...). They are written BEFORE the fix, so
 * failures are expected: they are real bugs, not skipped. `expect.soft` is used
 * for the checks that matter so one failing assertion does not hide the rest of
 * the scenario, and any "unsaved" dialog is dismissed so a scenario can finish.
 */

const [A, B, C] = makeTestImages();
const RED: [number, number, number] = [200, 40, 40];
const GREEN: [number, number, number] = [40, 160, 60];
const BLUE: [number, number, number] = [40, 70, 200];

test.describe.configure({ timeout: 150_000 });

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(async () => {
  if (errors.length) {
    test.info().annotations.push({ type: 'renderer-errors', description: errors.slice(0, 8).join(' | ') });
  }
});

const imageCurrentPage = (page: import('playwright').Page) => currentPage(page);

/** Do `action`, then report whether an unsaved dialog showed up; dismiss it either way. */
async function warned(page: import('playwright').Page, action: () => Promise<void>): Promise<boolean> {
  await action();
  const asked = await unsavedDialogVisible(page);
  await discardIfAsked(page);
  return asked;
}

test.describe('Image editor: untouched documents', () => {
  // 1 ---------------------------------------------------------------------
  test('1a. local file, untouched: tab X closes without a warning', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    const asked = await warned(page, () => closeViaX(page, A.name));
    expect.soft(asked, 'no "unsaved" dialog for an untouched document').toBe(false);
    await expect.poll(() => tabCount(page)).toBe(0);
  });

  test('1b. local file, untouched: Ctrl+W closes without a warning', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    const asked = await warned(page, () => page.keyboard.press('Control+w'));
    expect.soft(asked).toBe(false);
    await expect.poll(() => tabCount(page)).toBe(0);
  });

  test('1c. cloud-like asset, untouched: tab X closes without a warning', async ({ page }) => {
    await openCloudLike(page, 'cloud-1c', RED);
    const doc = await activeDoc(page);
    expect.soft(doc.isDirty, 'freshly opened document is clean').toBe(false);
    const asked = await warned(page, () => closeViaX(page, 'cloud-1c'));
    expect.soft(asked).toBe(false);
    await expect.poll(() => tabCount(page)).toBe(0);
  });

  test('1d. cloud-like asset, untouched: Ctrl+W closes without a warning', async ({ page }) => {
    await openCloudLike(page, 'cloud-1d', RED);
    const asked = await warned(page, () => page.keyboard.press('Control+w'));
    expect.soft(asked).toBe(false);
    await expect.poll(() => tabCount(page)).toBe(0);
  });

  // 2 ---------------------------------------------------------------------
  test('2a. local file, untouched: Esc / Back returns to the gallery without a warning', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    const asked = await warned(page, () => pressEscUntilGone(page));
    expect.soft(asked, 'no warning when leaving an untouched document').toBe(false);
    expect((await tabsSnapshot(page)).visible).toBe(false);
    expect(await imageCurrentPage(page)).toBe('images');
  });

  test('2b. local file, untouched: File > Back to Gallery has no warning', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    const asked = await warned(page, () => menu(page, 'File', 'Back to Gallery'));
    expect.soft(asked).toBe(false);
    expect((await tabsSnapshot(page)).visible).toBe(false);
  });

  test('2c. cloud-like asset, untouched: Esc returns to the gallery without a warning', async ({ page }) => {
    await openCloudLike(page, 'cloud-2c', GREEN);
    const pageBefore = await imageCurrentPage(page);
    const asked = await warned(page, () => pressEscUntilGone(page));
    expect.soft(asked).toBe(false);
    expect((await tabsSnapshot(page)).visible).toBe(false);
    expect(await imageCurrentPage(page), 'back on the page the user came from').toBe(pageBefore);
  });
});

test.describe('Image editor: edits and dirty state', () => {
  // 3 ---------------------------------------------------------------------
  test('3. edit then Ctrl+Z back to the opened state: closing has no warning', async ({ page }) => {
    await openCloudLike(page, 'cloud-3', RED);
    const opened = await activeDoc(page);
    await brushStroke(page);
    const edited = await activeDoc(page);
    expect(edited.historyLength, 'the stroke added a history entry').toBeGreaterThan(opened.historyLength);
    expect(edited.isDirty).toBe(true);

    await blurActive(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const undone = await activeDoc(page);
    expect.soft(undone.historyIndex).toBe(opened.historyIndex);
    expect.soft(undone.isDirty, 'document is back at the opened state -> not dirty').toBe(false);
    expect.soft((await tabsSnapshot(page)).dirty[0], 'tab dirty dot cleared').toBe(false);

    const asked = await warned(page, () => closeViaX(page, 'cloud-3'));
    expect.soft(asked).toBe(false);
  });

  // 4 ---------------------------------------------------------------------
  test('4. edit then save to disk: closing has no warning', async ({ page, electronApp }) => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'iris-e2e-save-')), 'saved.psd');
    await stubSaveDialog(electronApp, out);
    await openFromGallery(page, electronApp, A);
    await brushStroke(page);
    expect((await activeDoc(page)).isDirty).toBe(true);

    await blurActive(page);
    await page.keyboard.press('Control+s');
    await page.getByRole('button', { name: 'Save', exact: true }).last().click(); // PSD + Local are the defaults
    await expect.poll(() => fs.existsSync(out), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await activeDoc(page)).isDirty, { timeout: 5_000 }).toBe(false);
    expect.soft((await tabsSnapshot(page)).dirty[0], 'tab dirty dot cleared after save').toBe(false);

    const asked = await warned(page, () => closeViaX(page, A.name));
    expect.soft(asked, 'saved document closes silently').toBe(false);
  });

  // 5 ---------------------------------------------------------------------
  test('5. edit then close warns; Cancel keeps the tab and the edit', async ({ page }) => {
    await openCloudLike(page, 'cloud-5', BLUE);
    await brushStroke(page);
    const before = await activeDoc(page);
    expect(before.isDirty).toBe(true);

    await closeViaX(page, 'cloud-5');
    expect(await unsavedDialogVisible(page), 'positive control: edited tab warns').toBe(true);
    await cancelDialog(page);

    expect(await tabCount(page)).toBe(1);
    const after = await activeDoc(page);
    expect(after.isDirty).toBe(true);
    expect(after.historyLength).toBe(before.historyLength);
    expect(after.layers).toEqual(before.layers);

    // Ctrl+W goes through the same confirmation
    await blurActive(page);
    await page.keyboard.press('Control+w');
    expect(await unsavedDialogVisible(page)).toBe(true);
    await page.locator('button:has-text("Close Without Saving")').first().click();
    await expect.poll(() => tabCount(page)).toBe(0);
  });

  // 6 ---------------------------------------------------------------------
  test('6. three tabs, only the 2nd edited: dirty dots and close warnings are per tab', async ({ page }) => {
    await openCloudLike(page, 'cloud-6a', RED);
    await openCloudLike(page, 'cloud-6b', GREEN);
    await openCloudLike(page, 'cloud-6c', BLUE);
    await activateTab(page, 'cloud-6b');
    await brushStroke(page);
    await activateTab(page, 'cloud-6a');
    await activateTab(page, 'cloud-6c');
    await activateTab(page, 'cloud-6b');

    const snap = await tabsSnapshot(page);
    expect.soft(snap.dirty, 'only tab 2 is dirty').toEqual([false, true, false]);
    // switching must not make the other tabs dirty or the edited tab clean
    await activateTab(page, 'cloud-6a');
    await page.mouse.move(700, 500); // keep the pointer off the tabs: a hovered tab shows X instead of the dot
    expect.soft(await page.locator('span[title="Unsaved changes"]').count(), 'one dirty dot in the tab bar (tab 2)').toBe(1);
    expect.soft((await activeDoc(page)).isDirty, 'tab 1 clean').toBe(false);
    expect.soft(await warned(page, () => closeViaX(page, 'cloud-6a')), 'closing clean tab 1: no warning').toBe(false);

    await activateTab(page, 'cloud-6c');
    expect.soft((await activeDoc(page)).isDirty, 'tab 3 clean').toBe(false);
    expect.soft(await warned(page, () => closeViaX(page, 'cloud-6c')), 'closing clean tab 3: no warning').toBe(false);

    await activateTab(page, 'cloud-6b');
    await closeViaX(page, 'cloud-6b');
    expect(await unsavedDialogVisible(page), 'closing edited tab 2 warns').toBe(true);
    await discardIfAsked(page);
  });
});

test.describe('Image editor: several documents', () => {
  // 7a --------------------------------------------------------------------
  test('7a. a document opened with File > Open... while the editor is showing loads (canvas + panels)', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    await openFromMenu(page, electronApp, B, { noWait: true });
    await expectSecondDocumentLoaded(page, B.name);
  });

  test('7b. a document opened by editorTabs.openTab (gallery-card entry) while the editor is showing loads', async ({ page }) => {
    await openCloudLike(page, 'cloud-7b-1', RED);
    await openCloudLike(page, 'cloud-7b-2', GREEN, 'e2e-cloud-7b-2', { inEditor: true }).catch(() => {});
    await expectSecondDocumentLoaded(page, 'cloud-7b-2');
  });

  // 7 ---------------------------------------------------------------------
  test('7. tabs do not leak canvas / layers / history / zoom into each other', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    await openFromGallery(page, electronApp, B);
    await openFromGallery(page, electronApp, C);
    expect((await tabsSnapshot(page)).names).toEqual([A.name, B.name, C.name]);

    const initial: Record<string, Awaited<ReturnType<typeof activeDoc>>> = {};
    for (const img of [A, B, C]) {
      await activateTab(page, img.name);
      initial[img.name] = await activeDoc(page);
      expect(initial[img.name].name).toBe(img.name);
    }
    // each tab shows its own pixels
    for (const [img, rgb] of [[A, RED], [B, GREEN], [C, BLUE]] as const) {
      await activateTab(page, img.name);
      { const r = await waitCorner(page, rgb); expect.soft(r.ok, `canvas of ${img.name} shows its own colour (corner pixel ${JSON.stringify(r.seen)})`).toBe(true); }
    }

    // edit + zoom tab A
    await activateTab(page, A.name);
    await brushStroke(page);
    await page.evaluate(() => (window as any).__ZUSTAND_STORES__.imageEditor.getState().setZoom(250));
    const aEdited = await activeDoc(page);
    expect(aEdited.historyLength).toBeGreaterThan(initial[A.name].historyLength);

    // B and C are untouched
    for (const img of [B, C]) {
      await activateTab(page, img.name);
      const d = await activeDoc(page);
      expect.soft(d.name).toBe(img.name);
      expect.soft(d.layers, `${img.name} layers unchanged`).toEqual(initial[img.name].layers);
      expect.soft(d.historyLength, `${img.name} history unchanged`).toBe(initial[img.name].historyLength);
      expect.soft(d.isDirty, `${img.name} not dirty`).toBe(false);
      expect.soft(d.zoom, `${img.name} zoom not taken from tab A`).not.toBe(250);
    }

    // undo in A must not touch B's history
    await activateTab(page, A.name);
    await blurActive(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    await activateTab(page, B.name);
    const b2 = await activeDoc(page);
    expect.soft(b2.historyIndex).toBe(initial[B.name].historyIndex);
    expect.soft(b2.historyLength).toBe(initial[B.name].historyLength);
    { const r = await waitCorner(page, GREEN); expect.soft(r.ok, `B canvas still green after A edits/undo (corner pixel ${JSON.stringify(r.seen)})`).toBe(true); }
    await activateTab(page, A.name);
    { const r = await waitCorner(page, RED); expect.soft(r.ok, `A canvas still red after switching back (corner pixel ${JSON.stringify(r.seen)})`).toBe(true); }
    // discard so teardown is quiet
    await blurActive(page);
  });

  // 8 ---------------------------------------------------------------------
  test('8. closing tabs: inactive keeps the active one; active hands over to its neighbour; last exits', async ({ page }) => {
    await openCloudLike(page, 'cloud-8a', RED);
    await openCloudLike(page, 'cloud-8b', GREEN);
    await openCloudLike(page, 'cloud-8c', BLUE);
    // active = c. Close a (inactive) via X.
    expect.soft(await warned(page, () => closeViaX(page, 'cloud-8a'))).toBe(false);
    let snap = await tabsSnapshot(page);
    expect(snap.names).toEqual(['cloud-8b', 'cloud-8c']);
    expect.soft(snap.names[snap.activeIndex], 'active tab unchanged').toBe('cloud-8c');
    expect.soft((await activeDoc(page)).name).toBe('cloud-8c');
    { const r = await waitCorner(page, BLUE); expect.soft(r.ok, `active content unchanged (corner pixel ${JSON.stringify(r.seen)})`).toBe(true); }

    // close the active tab c -> b becomes active and shows its own content
    expect.soft(await warned(page, () => closeViaX(page, 'cloud-8c'))).toBe(false);
    snap = await tabsSnapshot(page);
    expect(snap.names).toEqual(['cloud-8b']);
    await page.waitForTimeout(800);
    const doc = await activeDoc(page);
    expect.soft(doc.name, 'neighbour tab is active').toBe('cloud-8b');
    expect.soft(doc.ready, 'canvas ready after hand-over').toBe(true);
    { const r = await waitCorner(page, GREEN); expect.soft(r.ok, `neighbour tab content is visible, not blank (corner pixel ${JSON.stringify(r.seen)})`).toBe(true); }

    // close the last tab -> editor is left and the gallery page is shown
    expect.soft(await warned(page, () => closeViaX(page, 'cloud-8b'))).toBe(false);
    await expect.poll(() => tabCount(page)).toBe(0);
    expect((await tabsSnapshot(page)).visible).toBe(false);
    expect(await imageCurrentPage(page)).toBe('images');
    await expect(page.locator('nav')).toBeVisible();
  });

  // 9 ---------------------------------------------------------------------
  test('9. open A, leave, open B: B is clean and shows nothing of A; reopening A is clean too', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    await brushStroke(page);
    expect((await activeDoc(page)).isDirty).toBe(true);
    await warned(page, () => menu(page, 'File', 'Back to Gallery')); // may warn for the local file (scenario 2), continue anyway
    expect((await tabsSnapshot(page)).visible).toBe(false);

    await openFromGallery(page, electronApp, B);
    const b = await activeDoc(page);
    expect(b.name).toBe(B.name);
    expect.soft(b.isDirty, 'B is clean').toBe(false);
    expect.soft(b.historyLabels.join(','), 'A\'s stroke is not in B\'s history').not.toContain('Brush');
    expect.soft(b.layers.some((n) => n.includes(A.name)), 'no A layer in B').toBe(false);
    expect.soft(b.hasSelection).toBe(false);
    { const r = await waitCorner(page, GREEN); expect.soft(r.ok, `B shows its own pixels (corner pixel ${JSON.stringify(r.seen)})`).toBe(true); }

    await warned(page, () => menu(page, 'File', 'Back to Gallery'));
    await openFromGallery(page, electronApp, A);
    const a2 = await activeDoc(page);
    expect.soft(a2.name).toBe(A.name);
    expect.soft(a2.isDirty, 're-opened A is clean').toBe(false);
    expect.soft(a2.historyLabels.join(','), 're-opened A has no stroke from the earlier session').not.toContain('Brush');

    const names = (await tabsSnapshot(page)).names;
    expect.soft(names.filter((n) => n === A.name).length, 'one tab per opened file (no ghost A tab left behind)').toBe(1);
  });

  // 10 --------------------------------------------------------------------
  test('10a. the same cloud asset opened twice focuses the existing tab', async ({ page }) => {
    await openCloudLike(page, 'cloud-10', RED, 'e2e-cloud-same-id');
    await openCloudLike(page, 'cloud-10', RED, 'e2e-cloud-same-id').catch(() => {});
    expect((await tabsSnapshot(page)).names).toEqual(['cloud-10']);
  });

  test('10b. the same local file opened twice (File > Open...) does not create duplicate tabs', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    await openFromGallery(page, electronApp, A);
    const names = (await tabsSnapshot(page)).names;
    // local files get a fresh `local-<timestamp>` id each time, so the id-based dedupe never matches.
    expect.soft(names, 'same path opened twice -> one tab').toEqual([A.name]);
  });
});

test.describe('Image editor: new documents, history baseline, spurious dirty', () => {
  // 11 --------------------------------------------------------------------
  test('11. File > New: first edit can be undone with Ctrl+Z (baseline history entry exists)', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A); // need the editor shell for the File menu
    await menu(page, 'File', 'New');
    await page.getByPlaceholder('Untitled').fill('lifecycle-new');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForFunction(
      () => (window as any).__ZUSTAND_STORES__.imageEditor.getState().sourceAsset?.name === 'lifecycle-new.psd',
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(2000);
    // (same defect as 7a: the new tab does not load while the editor is mounted)
    expect.soft((await activeDoc(page)).ready, 'new document canvas is ready').toBe(true);
    await remountEditor(page); // preparation so the rest of the scenario can run
    const fresh = await activeDoc(page);
    expect.soft(fresh.isDirty, 'a new blank document is not dirty').toBe(false);

    await brushStroke(page);
    const edited = await activeDoc(page);
    expect(edited.isDirty).toBe(true);
    const canUndo = await readStore(page, 'imageEditor', (s) => s.canUndo() as boolean);
    expect.soft(canUndo, `canUndo after first edit (history: ${edited.historyLabels.join(' > ')}, index ${edited.historyIndex})`).toBe(true);
    await blurActive(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const undone = await activeDoc(page);
    expect.soft(undone.historyIndex, 'Ctrl+Z moved back to the pre-edit state').toBeLessThan(edited.historyIndex);
  });

  test('11b. File > Open... (layer document): first edit can be undone', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    await openFromMenu(page, electronApp, B, { noWait: true }); // opened through openTabWithLayers
    await remountEditor(page); // preparation: see 7a
    const opened = await activeDoc(page);
    await brushStroke(page);
    const edited = await activeDoc(page);
    const canUndo = await readStore(page, 'imageEditor', (s) => s.canUndo() as boolean);
    expect.soft(
      canUndo,
      `canUndo after first edit (opened history ${opened.historyLabels.join('>') || 'empty'}, then ${edited.historyLabels.join('>')})`,
    ).toBe(true);
  });

  // 12 --------------------------------------------------------------------
  test('12. non-editing actions never turn dirty on', async ({ page, electronApp }) => {
    await openFromGallery(page, electronApp, A);
    await openCloudLike(page, 'cloud-12', GREEN);
    const dirty = async () => (await activeDoc(page)).isDirty;
    const steps: Array<[string, () => Promise<void>]> = [
      ['right after open + settle', async () => { await page.waitForTimeout(1500); }],
      ['zoom in (Ctrl+=)', async () => { await page.keyboard.press('Control+='); }],
      ['zoom out (Ctrl+-)', async () => { await page.keyboard.press('Control+-'); }],
      ['fit zoom (Ctrl+0)', async () => { await page.keyboard.press('Control+0'); }],
      ['switch tool (V, M, B)', async () => { for (const k of ['v', 'm', 'b']) await page.keyboard.press(k); }],
      ['resize window', async () => { await page.setViewportSize({ width: 1100, height: 700 }).catch(() => {}); await page.waitForTimeout(500); }],
      ['select layer in the layers panel', async () => {
        const row = page.locator('text=/^Background$|Layer 1/').first();
        if (await row.isVisible().catch(() => false)) await row.click();
      }],
      ['switch to the other tab and back', async () => { await activateTab(page, A.name); await activateTab(page, 'cloud-12'); }],
    ];
    for (const [label, run] of steps) {
      await blurActive(page);
      await run();
      await page.waitForTimeout(400);
      expect.soft(await dirty(), `still clean after: ${label}`).toBe(false);
      expect.soft((await tabsSnapshot(page)).dirty.some(Boolean), `no tab dot after: ${label}`).toBe(false);
    }
  });
});

test.describe('Image editor: leaving and coming back', () => {
  // 17 --------------------------------------------------------------------
  test('17. leave the editor, use the sidebar, come back: tabs and edits survive; no hidden orphan', async ({ page }) => {
    await openCloudLike(page, 'cloud-17a', RED);
    await openCloudLike(page, 'cloud-17b', GREEN);
    await activateTab(page, 'cloud-17a');
    await brushStroke(page);
    const edited = await activeDoc(page);

    await menu(page, 'File', 'Back to Gallery');
    expect(await unsavedDialogVisible(page, 800), 'by design tabs stay alive, so leaving an edited document does not ask').toBe(false);
    expect((await tabsSnapshot(page)).visible).toBe(false);
    await waitForStores(page);

    await goToPage(page, 'Home');
    await goToPage(page, 'Images');
    expect(await currentPage(page)).toBe('images');
    const kept = await tabsSnapshot(page);
    expect(kept.names, 'tabs are still alive while the editor is hidden').toEqual(['cloud-17a', 'cloud-17b']);
    expect(kept.dirty).toEqual([true, false]);

    // Something in the visible UI should tell the user two documents are still open (and let them return).
    const hint = page.locator('text=/cloud-17a|cloud-17b|open documents|Return to editor|Resume/i');
    expect.soft(await hint.count(), 'hidden open documents are discoverable from the gallery (otherwise they are orphan tabs)').toBeGreaterThan(0);

    // coming back through a gallery open shows the retained document with its edit
    await openCloudLike(page, 'cloud-17a', RED, 'e2e-cloud-cloud-17a');
    const back = await activeDoc(page);
    expect.soft(back.name).toBe('cloud-17a');
    expect.soft(back.historyLength, 'edit preserved').toBe(edited.historyLength);
    expect.soft(back.isDirty).toBe(true);
  });
});

// ---------------------------------------------------------------- local helpers

async function closeViaX(page: import('playwright').Page, name: string) {
  await closeTabByX(page, name);
}

/** Esc: the first press may only leave the active edit mode; press again until the editor is gone or a dialog opened. */
async function pressEscUntilGone(page: import('playwright').Page) {
  for (let i = 0; i < 3; i++) {
    await blurActive(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const visible = (await tabsSnapshot(page)).visible;
    if (!visible || (await unsavedDialogVisible(page, 300))) return;
  }
}

/** The document opened last must finish loading: canvas ready, no spinner, panels show ITS layer. */
async function expectSecondDocumentLoaded(page: import('playwright').Page, name: string) {
  await expect
    .poll(async () => (await activeDoc(page)).ready, { timeout: 8_000, message: `${name}: canvas becomes ready` })
    .toBe(true)
    .catch(() => {});
  const doc = await activeDoc(page);
  expect.soft(doc.name).toBe(name);
  expect.soft(doc.ready, `${name}: isCanvasReady`).toBe(true);
  expect.soft(doc.layerCount, `${name}: layers loaded`).toBeGreaterThan(0);
  expect.soft(await page.locator('text=Loading image').count(), 'no endless "Loading image" spinner').toBe(0);
  const px = await canvasCorner(page);
  expect.soft(px, `canvas shows the new document, not the previous tab (corner pixel ${JSON.stringify(px)})`).not.toEqual([200, 40, 40]);
  await page.screenshot({ path: test.info().outputPath('second-document.png') });
}
