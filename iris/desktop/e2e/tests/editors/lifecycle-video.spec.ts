import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { openVideoEditor, videoState, readStore, blurActive } from '../../helpers/shortcut.helper';
import { unsavedDialogVisible, discardIfAsked, watchErrors, goToPage, menu } from '../../helpers/lifecycle.helper';

/**
 * Video editor project lifecycle: closing without changes, closing after edits,
 * and state leaking from one project into the next.
 *
 * The editor is opened through the dev-mode store handles (shortcut.helper.openVideoEditor):
 * the user paths (Projects > New project / open a project) create and load cloud projects,
 * which these specs must never write to. Closing goes through the header X button.
 * Saving is NOT covered for the same reason (a first save of a local project creates a cloud
 * project).
 *
 * Written before the fix: failing assertions are real findings and are not skipped.
 */

test.describe.configure({ timeout: 120_000 });

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(async () => {
  if (errors.length) test.info().annotations.push({ type: 'renderer-errors', description: errors.slice(0, 8).join(' | ') });
});


async function closeAndReport(page: Page): Promise<{ asked: boolean }> {
  await blurActive(page);
  await menu(page, 'File', 'Go Back');
  const asked = await unsavedDialogVisible(page);
  await discardIfAsked(page);
  return { asked };
}

async function editorOpen(page: Page) {
  return (await videoState(page)).isEditorOpen;
}

const call = (page: Page, src: (s: any) => unknown) =>
  page.evaluate((fn) => {
    const stores = (window as any).__ZUSTAND_STORES__;
    // eslint-disable-next-line no-new-func
    return new Function('s', `return (${fn})(s)`)(stores.editor.getState());
  }, src.toString());

test.describe('Video editor: closing untouched projects', () => {
  // 13 --------------------------------------------------------------------
  test('13a. open a project, change nothing, close: no warning', async ({ page }) => {
    await openVideoEditor(page);
    const { asked } = await closeAndReport(page);
    expect.soft(asked, 'no "unsaved" dialog for an untouched project').toBe(false);
    await expect.poll(() => editorOpen(page)).toBe(false);
    await expect(page.locator('nav')).toBeVisible();
  });

  test('13b. project whose clips come from local files, nothing changed: no warning', async ({ page }) => {
    // Clips imported from disk carry a file:// / blob: assetId (formerly VideoEditorPage.hasLocalClips).
    await openVideoEditor(page, { clipSource: 'local' });
    const ids = await readStore(page, 'editor', (s) => s.tracks.flatMap((t: any) => t.clips.map((c: any) => c.assetId)));
    expect(ids.every((id: string) => id.startsWith('file://')), 'fixture clips are local files').toBe(true);
    const { asked } = await closeAndReport(page);
    expect.soft(asked, 'local clips alone do not make a project "unsaved"').toBe(false);
    await expect.poll(() => editorOpen(page)).toBe(false);
  });

  // 14 --------------------------------------------------------------------
  test('14. play, seek, zoom the timeline and select a clip, then close: no warning', async ({ page }) => {
    await openVideoEditor(page);
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(700);
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+-');
    await page.waitForTimeout(400);
    const s = await videoState(page);
    expect(s.historyLength, 'view-only actions create no history entries').toBeLessThanOrEqual(3);
    const { asked } = await closeAndReport(page);
    expect.soft(asked).toBe(false);
    await expect.poll(() => editorOpen(page)).toBe(false);
  });
});

test.describe('Video editor: edits and the close warning', () => {
  // 15 --------------------------------------------------------------------
  test('15a. edit a clip then close: warns (positive control)', async ({ page }) => {
    await openVideoEditor(page);
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    const before = await videoState(page);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount - 1);
    const { asked } = await closeAndReport(page);
    expect(asked, 'an edited project must ask before it is closed').toBe(true);
  });

  test('15b. edit then undo back to the opened state, close: no warning', async ({ page }) => {
    await openVideoEditor(page);
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    const before = await videoState(page);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount - 1);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount);
    const { asked } = await closeAndReport(page);
    expect.soft(asked, 'back at the opened state -> nothing unsaved').toBe(false);
  });

  test('15c. edit, cancel the warning: editor and edit stay', async ({ page }) => {
    await openVideoEditor(page);
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    const before = await videoState(page);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount - 1);
    await menu(page, 'File', 'Go Back');
    const asked = await unsavedDialogVisible(page);
    expect.soft(asked, 'warning shown for an edited project').toBe(true);
    if (asked) {
      await page.getByRole('button', { name: 'Cancel' }).first().click();
      await page.waitForTimeout(300);
      expect(await editorOpen(page)).toBe(true);
      expect((await videoState(page)).clipCount).toBe(before.clipCount - 1);
    }
  });
});

test.describe('Video editor: state between projects', () => {
  // 16 --------------------------------------------------------------------
  test('16. open project A, edit, leave, open project B: nothing of A remains', async ({ page }) => {
    const fxA = await openVideoEditor(page);
    const baseline = await videoState(page);
    expect(baseline.clipCount).toBe(2);

    // edit A: delete a clip, select the other, move the playhead, change the timeline zoom
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    await page.keyboard.press('Delete');
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(400);
    const edited = await videoState(page);
    expect(edited.clipCount).toBe(1);

    await closeAndReport(page); // dismisses a warning if one is shown
    await expect.poll(() => editorOpen(page)).toBe(false);

    const after = await readStore(page, 'editor', (s) => ({
      tracks: s.tracks.reduce((n: number, t: any) => n + t.clips.length, 0) as number,
      historyLength: s.history.length as number,
      selected: s.selection.clipIds.length as number,
      currentTime: s.currentTime as number,
    }));
    expect.soft(after.tracks, 'closing the editor clears the timeline').toBe(0);
    expect.soft(after.selected, 'closing clears the selection').toBe(0);
    expect.soft(after.currentTime, 'closing resets the playhead').toBe(0);

    const fxB = await openVideoEditor(page);
    const b = await videoState(page);
    expect.soft(b.clipCount, 'project B has exactly its own two clips').toBe(2);
    expect.soft(b.clipIds.some((id) => fxA.clipIds.includes(id)), 'no clip of project A is reused').toBe(false);
    expect.soft(b.selectedIds, 'no selection carried over').toEqual([]);
    expect.soft(b.currentTime, 'playhead at 0').toBe(0);
    expect.soft(b.isPlaying).toBe(false);
    expect.soft(b.pixelsPerSecond, 'timeline zoom is the default again').toBe(baseline.pixelsPerSecond);
    expect.soft(b.historyLength, 'history starts like a fresh project').toBe(baseline.historyLength);
    expect.soft(b.historyIndex).toBe(baseline.historyIndex);
    void fxB;
  });
});

test.describe('Cross-editor: leaving through the sidebar', () => {
  // 17 --------------------------------------------------------------------
  test('17v. video editor: leaving with the header X returns to the page the user came from', async ({ page }) => {
    await goToPage(page, 'Projects');
    const before = await readStore(page, 'ui', (s) => s.currentPage as string);
    await openVideoEditor(page);
    await closeAndReport(page);
    await expect.poll(() => editorOpen(page)).toBe(false);
    const afterPage = await readStore(page, 'ui', (s) => s.currentPage as string);
    expect.soft(afterPage, 'returns to Projects (the page the editor was entered from)').toBe(before);
  });
});
