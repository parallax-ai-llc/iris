import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  openVideoEditor,
  videoState,
  readStore,
  blurActive,
  type VideoFixture,
} from '../../helpers/shortcut.helper';

/**
 * Video editor keyboard-shortcut regression suite (VIDEO_EDITOR_KEYMAP).
 *
 * The editor is opened on an empty local project holding two real clips
 * (e2e/test-assets/test-clip-1.mp4 metadata) back to back on Video 1; nothing
 * is uploaded and no API is written to.
 */

async function call(page: Page, fn: (s: any) => unknown): Promise<unknown> {
  return page.evaluate((src) => {
    const stores = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => unknown }> })
      .__ZUSTAND_STORES__;
    // eslint-disable-next-line no-new-func
    return new Function('s', `return (${src})(s)`)(stores.editor.getState());
  }, fn.toString());
}

/** Wait a beat so a doubled handler (the old bug) would have had time to run twice. */
const settle = (page: Page) => page.waitForTimeout(500);

test.describe('Video editor shortcuts', () => {
  let fx: VideoFixture;

  test.beforeEach(async ({ page }) => {
    fx = await openVideoEditor(page);
    const s = await videoState(page);
    expect(s.isEditorOpen).toBe(true);
    expect(s.clipCount).toBe(2);
  });

  // 8 ---------------------------------------------------------------------
  test('Space toggles play / pause', async ({ page }) => {
    expect((await videoState(page)).isPlaying).toBe(false);

    await page.keyboard.press('Space');
    await expect.poll(async () => (await videoState(page)).isPlaying).toBe(true);

    // The playhead really advances while playing (hidden window must not freeze rAF).
    const t0 = (await videoState(page)).currentTime;
    await expect
      .poll(async () => (await videoState(page)).currentTime, { timeout: 5_000 })
      .toBeGreaterThan(t0);

    await page.keyboard.press('Space');
    await expect.poll(async () => (await videoState(page)).isPlaying).toBe(false);
  });

  test('L plays forward and speeds up, K stops, J plays reverse', async ({ page }) => {
    await call(page, (s) => s.seek(s.duration / 2));
    await page.keyboard.press('l');
    await expect
      .poll(async () => {
        const s = await videoState(page);
        return `${s.isPlaying}/${s.playbackRate}`;
      })
      .toBe('true/1');

    await page.keyboard.press('l');
    await expect.poll(async () => (await videoState(page)).playbackRate).toBe(2);

    await page.keyboard.press('k');
    await expect.poll(async () => (await videoState(page)).isPlaying).toBe(false);

    await page.keyboard.press('j');
    await expect
      .poll(async () => {
        const s = await videoState(page);
        return `${s.isPlaying}/${s.playbackRate}`;
      })
      .toBe('true/-1');
    await page.keyboard.press('k');
    await expect.poll(async () => (await videoState(page)).isPlaying).toBe(false);
  });

  test('Right / Left arrows move the playhead by 1 second', async ({ page }) => {
    await call(page, (s) => s.seek(2));
    expect((await videoState(page)).currentTime).toBeCloseTo(2, 3);

    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await videoState(page)).currentTime).toBeCloseTo(3, 3);
    await settle(page);
    expect((await videoState(page)).currentTime).toBeCloseTo(3, 3); // once, not twice

    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await videoState(page)).currentTime).toBeCloseTo(2, 3);

    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await videoState(page)).currentTime).toBeCloseTo(3, 3);
  });

  // 9 ---------------------------------------------------------------------
  test('Delete removes the selected clip exactly once (one history step); Ctrl+Z restores it', async ({ page }) => {
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    const before = await videoState(page);
    expect(before.selectedIds).toHaveLength(1);

    await page.keyboard.press('Delete');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount - 1);
    await settle(page);
    const after = await videoState(page);
    expect(after.clipCount).toBe(before.clipCount - 1);
    expect(after.historyLength).toBe(before.historyLength + 1);
    expect(after.selectedIds).toHaveLength(0);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount);
  });

  test('Backspace also deletes the selected clip once', async ({ page }) => {
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    const before = await videoState(page);

    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount - 1);
    await settle(page);
    const after = await videoState(page);
    expect(after.clipCount).toBe(before.clipCount - 1);
    expect(after.historyLength).toBe(before.historyLength + 1);
  });

  test('Ctrl+C copies, Ctrl+V pastes at the playhead', async ({ page }) => {
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    const before = await videoState(page);

    await page.keyboard.press('Control+c');
    await expect.poll(async () => (await videoState(page)).clipboardSize).toBe(1);
    expect((await videoState(page)).clipCount).toBe(before.clipCount); // copy removes nothing

    await call(page, (s) => s.seek(s.duration + 1));
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount + 1);
    await settle(page);
    expect((await videoState(page)).clipCount).toBe(before.clipCount + 1); // pasted once
  });

  test('Ctrl+X cuts the selected clip into the clipboard', async ({ page }) => {
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    const before = await videoState(page);

    await page.keyboard.press('Control+x');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount - 1);
    await settle(page);
    const after = await videoState(page);
    expect(after.clipboardSize).toBe(1);
    expect(after.clipCount).toBe(before.clipCount - 1);
    expect(after.historyLength).toBe(before.historyLength + 1);
  });

  test('Ctrl+D duplicates the selected clip once', async ({ page }) => {
    await call(page, (s) => s.selectClip(s.tracks[0].clips[0].id));
    await blurActive(page);
    const before = await videoState(page);

    await page.keyboard.press('Control+d');
    await expect.poll(async () => (await videoState(page)).clipCount).toBe(before.clipCount + 1);
    await settle(page);
    const after = await videoState(page);
    expect(after.clipCount).toBe(before.clipCount + 1);
    expect(after.historyLength).toBe(before.historyLength + 1);
  });

  test('Ctrl+= / Ctrl+- zoom the timeline', async ({ page }) => {
    const start = (await videoState(page)).pixelsPerSecond;

    await page.keyboard.press('Control+=');
    await expect.poll(async () => (await videoState(page)).pixelsPerSecond).toBeCloseTo(start * 1.25, 3);

    await page.keyboard.press('Control+Shift+=');
    await expect.poll(async () => (await videoState(page)).pixelsPerSecond).toBeCloseTo(start * 1.25 * 1.25, 3);

    await page.keyboard.press('Control+-');
    await expect.poll(async () => (await videoState(page)).pixelsPerSecond).toBeCloseTo(start * 1.25, 3);
    await settle(page);
    expect((await videoState(page)).pixelsPerSecond).toBeCloseTo(start * 1.25, 3); // one step each
  });

  // 10 --------------------------------------------------------------------
  test('arrows move a selected subtitle and leave the playhead alone', async ({ page }) => {
    // addSubtitleClip auto-selects the new clip (and the preview draws its overlay).
    await call(page, (s) => {
      s.addSubtitleClip('E2E subtitle', 0, 4, undefined);
      s.seek(1);
    });
    await page.waitForTimeout(500);
    await blurActive(page);

    const subPos = () =>
      readStore(page, 'editor', (s) => {
        const sub = s.tracks.flatMap((t: any) => t.clips).find((c: any) => c.type === 'subtitle');
        return { x: sub.style.position.x as number, y: sub.style.position.y as number };
      });
    const before = await subPos();
    const t0 = (await videoState(page)).currentTime;

    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await subPos()).x).toBeGreaterThan(before.x);
    expect((await videoState(page)).currentTime).toBeCloseTo(t0, 3);

    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await subPos()).x).toBeCloseTo(before.x, 3);
    expect((await videoState(page)).currentTime).toBeCloseTo(t0, 3);

    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await subPos()).y).toBeGreaterThan(before.y);
    expect((await videoState(page)).currentTime).toBeCloseTo(t0, 3);

    // Control: once the subtitle is deselected, the arrow is the 1s seek again.
    await call(page, (s) => s.clearSelection());
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await videoState(page)).currentTime).toBeCloseTo(t0 + 1, 3);
  });

  test('fixture sanity: test clips are laid out back to back', async () => {
    expect(fx.clipIds).toHaveLength(2);
    expect(fx.clipDuration).toBeGreaterThan(0.5);
  });
});
