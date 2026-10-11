import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Page, ElectronApplication } from 'playwright';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { openVideoEditor, readStore, TEST_CLIP_1, blurActive } from '../../helpers/shortcut.helper';
import { stubOpenDialog, stubSaveDialog, watchErrors } from '../../helpers/lifecycle.helper';
import { ffprobeDuration } from '../../helpers/basics.helper';

/**
 * Basic-feature regression specs for the video editor. The editor is opened on a blank
 * "project" through the dev-mode store handles (the user path creates a cloud project, which
 * these specs must never write to); every other step uses the UI: Import Media dialog, drag and
 * drop, timeline mouse input, shortcuts, inspector, effects panel, export dialog.
 *
 * Safety net: every non-GET request to a non-local host is aborted and reported, so a
 * regression that starts writing to the cloud shows up as a failure instead of as data.
 */

test.describe.configure({ timeout: 150_000 });

let errors: string[] = [];
let cloudWrites: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  cloudWrites = [];
  await page.route('**/*', (route) => {
    const req = route.request();
    let host = '';
    try {
      host = new URL(req.url()).hostname;
    } catch {
      /* data: / blob: */
    }
    const isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (!isLocal && !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      cloudWrites.push(`${req.method()} ${req.url()}`);
      return route.abort();
    }
    return route.continue();
  });
});
test.afterEach(async () => {
  if (errors.length) {
    test.info().annotations.push({ type: 'renderer-errors', description: errors.slice(0, 8).join(' | ') });
    console.log(`RENDERER-ERRORS [${test.info().title}] ${errors.slice(0, 8).join(' | ')}`);
  }
  expect(cloudWrites, 'no write request left for a non-local host').toEqual([]);
});

// ------------------------------------------------------------------ helpers

const sleep = (page: Page, ms = 400) => page.waitForTimeout(ms);

interface ClipInfo {
  id: string;
  trackId: string;
  trackType: string;
  name: string;
  type: string;
  start: number;
  end: number;
  srcStart: number;
  srcEnd: number;
  speed: number;
  volume: number;
  effects: number;
  keyframes: number;
  text?: string;
}
async function clips(page: Page): Promise<ClipInfo[]> {
  return readStore(page, 'editor', (s) =>
    s.tracks.flatMap((t: any) =>
      t.clips.map((c: any) => ({
        id: c.id,
        trackId: t.id,
        trackType: t.type,
        name: c.name,
        type: c.type,
        start: c.startTime,
        end: c.endTime,
        srcStart: c.sourceStartTime ?? 0,
        srcEnd: c.sourceEndTime ?? 0,
        speed: c.speed ?? 1,
        volume: c.volume ?? 1,
        effects: (c.effects ?? []).length,
        keyframes: (c.keyframes ?? []).length,
        text: c.text,
      })),
    ),
  ) as Promise<ClipInfo[]>;
}
const tracksInfo = (page: Page) =>
  readStore(page, 'editor', (s) =>
    s.tracks.map((t: any) => ({ id: t.id, type: t.type, muted: t.muted, locked: t.locked, visible: t.visible, clips: t.clips.length })),
  ) as Promise<Array<{ id: string; type: string; muted: boolean; locked: boolean; visible: boolean; clips: number }>>;
const ed = (page: Page, pick: string) =>
  page.evaluate((src) => {
    const s = (window as any).__ZUSTAND_STORES__.editor.getState();
    // eslint-disable-next-line no-new-func
    return new Function('s', `return (${src})(s)`)(s);
  }, pick);
const clipEl = (page: Page, id: string) => page.locator(`[data-clip-id="${id}"]`);

/** Two placeholder clips back to back on Video 1 (3 s each), nothing selected. */
async function setup(page: Page) {
  const f = await openVideoEditor(page);
  return f;
}

/** Add a real, playable clip (test-clip-1.mp4 by file path) to Video 1: preparation for playback/export. */
async function addRealClip(page: Page, opts: { start?: number; len?: number } = {}) {
  const url = 'file:///' + TEST_CLIP_1.replace(/\\/g, '/');
  const dur = ffprobeDuration(TEST_CLIP_1);
  const len = Math.min(opts.len ?? dur, dur);
  return page.evaluate(
    ({ url, start, len }) => {
      const st = (window as any).__ZUSTAND_STORES__.editor.getState();
      const track = st.tracks.find((t: any) => t.type === 'video');
      const c = st.addClip(track.id, {
        type: 'video',
        assetId: url,
        name: 'real-clip',
        startTime: start,
        endTime: start + len,
        sourceStartTime: 0,
        sourceEndTime: len,
        transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 },
        volume: 1,
        muted: false,
        speed: 1,
        blendMode: 'normal',
        effects: [],
        keyframes: [],
      });
      st.markSaved();
      return c.id as string;
    },
    { url, start: opts.start ?? 0, len },
  );
}

/** Remove the two placeholder clips so only the real clip is on the timeline. */
async function clearPlaceholders(page: Page) {
  await page.evaluate(() => {
    const st = (window as any).__ZUSTAND_STORES__.editor.getState();
    for (const t of st.tracks) for (const c of t.clips) if (/^E2E Clip/.test(c.name)) st.removeClip(c.id);
    st.markSaved();
  });
}

async function selectClip(page: Page, id: string) {
  const el = clipEl(page, id);
  const b = await el.boundingBox();
  if (!b) throw new Error('clip not visible');
  await page.mouse.click(b.x + Math.min(40, b.width / 2), b.y + b.height - 12);
  await sleep(page, 400);
}

/** Mouse drag in screen space, with intermediate moves so the timeline sees real motion. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
  await sleep(page, 400);
}

async function key(page: Page, k: string) {
  await blurActive(page);
  await page.keyboard.press(k);
  await sleep(page, 300);
}

// =================================================================== 16. import media
test.describe('16. import media', () => {
  test('16. Import Media (local file) -> media pool item -> drag to the timeline -> clip', async ({ page, electronApp }) => {
    await setup(page);
    await page.locator('button', { hasText: /Import Media/ }).first().click();
    await stubOpenDialog(electronApp, [TEST_CLIP_1]);
    await page.locator('div.fixed button', { hasText: /^Import$/ }).first().click();
    await page.locator('div.fixed button', { hasText: /Browse Files/ }).click();
    const item = page.locator('[draggable="true"]', { hasText: 'test-clip-1.mp4' }).first();
    await expect(item, 'imported file shows up in the media pool').toBeVisible({ timeout: 15_000 });
    await expect.soft(item).toContainText(/0:0\d/); // probed duration badge text is in the DOM

    const before = await clips(page);
    const lane = page.locator('[data-track-id="track-video-1"]');
    const lb = (await lane.boundingBox())!;
    await item.dragTo(lane, { targetPosition: { x: Math.min(lb.width - 10, 400), y: lb.height / 2 } });
    await sleep(page, 800);
    const after = await clips(page);
    expect.soft(after.length, 'dropping the media on the video track creates at least one clip').toBeGreaterThan(before.length);
    const added = after.filter((c) => !before.some((b) => b.id === c.id));
    const v = added.find((c) => c.trackType === 'video');
    expect.soft(v, `a video clip was created (new clips: ${JSON.stringify(added.map((c) => [c.trackType, c.name]))})`).toBeTruthy();
    expect.soft(v?.name ?? '', 'new clip is named after the file').toMatch(/test-clip-1/);
    expect.soft((v?.end ?? 0) - (v?.start ?? 0), 'clip length equals the media duration').toBeGreaterThan(1);
  });
});

// =================================================================== 17. playback
test.describe('17. playback', () => {
  test('17. Play advances the playhead and the preview video; Pause stops it', async ({ page }) => {
    await setup(page);
    await clearPlaceholders(page);
    await addRealClip(page);
    await sleep(page, 1500);
    await page.evaluate(() => (window as any).__ZUSTAND_STORES__.editor.getState().seek?.(0));
    const t0 = (await ed(page, '(s)=>s.currentTime')) as number;
    await page.locator('button[title="Play/Pause (Space)"]').click();
    await sleep(page, 400);
    expect.soft(await ed(page, '(s)=>s.isPlaying'), 'isPlaying after Play').toBe(true);
    const v0 = await page.evaluate(() => {
      const v = document.querySelector('[data-editor-preview-video]') as HTMLVideoElement | null;
      return v ? { t: v.currentTime, paused: v.paused, ready: v.readyState, w: v.videoWidth } : null;
    });
    await sleep(page, 1500);
    const t1 = (await ed(page, '(s)=>s.currentTime')) as number;
    const v1 = await page.evaluate(() => {
      const v = document.querySelector('[data-editor-preview-video]') as HTMLVideoElement | null;
      return v ? { t: v.currentTime, paused: v.paused, ready: v.readyState, w: v.videoWidth } : null;
    });
    expect.soft(t1 - t0, 'timeline playhead advanced while playing').toBeGreaterThan(0.8);
    expect.soft(v1, 'preview <video> exists').toBeTruthy();
    expect.soft(v1 && v0 ? v1.t - v0.t : 0, `preview <video>.currentTime advanced (${JSON.stringify(v0)} -> ${JSON.stringify(v1)})`).toBeGreaterThan(0.5);
    expect.soft(v1?.w ?? 0, 'preview has decoded frames (videoWidth > 0)').toBeGreaterThan(0);

    await page.locator('button[title="Play/Pause (Space)"]').click();
    await sleep(page, 400);
    expect.soft(await ed(page, '(s)=>s.isPlaying'), 'paused').toBe(false);
    const tp = (await ed(page, '(s)=>s.currentTime')) as number;
    await sleep(page, 800);
    expect.soft((await ed(page, '(s)=>s.currentTime')) as number, 'playhead stays put after Pause').toBeCloseTo(tp, 1);
  });

  test('17b. Space toggles play/pause and Home returns to the start', async ({ page }) => {
    await setup(page);
    await key(page, 'Space');
    await sleep(page, 700);
    expect.soft(await ed(page, '(s)=>s.isPlaying')).toBe(true);
    await key(page, 'Space');
    expect.soft(await ed(page, '(s)=>s.isPlaying')).toBe(false);
    await key(page, 'Home');
    expect.soft(await ed(page, '(s)=>s.currentTime')).toBe(0);
  });
});

// =================================================================== 18. clip editing
test.describe('18. clip editing', () => {
  test('18a. trimming the right edge shortens the clip', async ({ page }) => {
    await setup(page);
    const [a] = await clips(page);
    const b = (await clipEl(page, a.id).boundingBox())!;
    await drag(page, { x: b.x + b.width - 3, y: b.y + b.height / 2 }, { x: b.x + b.width - 53, y: b.y + b.height / 2 });
    const [a2] = await clips(page);
    expect.soft(a2.end, `end moved left by ~1 s (was ${a.end}, now ${a2.end})`).toBeLessThan(a.end - 0.5);
    expect.soft(a2.start, 'start unchanged').toBe(a.start);
    expect.soft(a2.srcEnd, 'source out-point trimmed too').toBeLessThan(a.srcEnd - 0.5);
  });

  test('18b. trimming the left edge moves the in-point', async ({ page }) => {
    await setup(page);
    const [a] = await clips(page);
    const b = (await clipEl(page, a.id).boundingBox())!;
    await drag(page, { x: b.x + 3, y: b.y + b.height / 2 }, { x: b.x + 53, y: b.y + b.height / 2 });
    const [a2] = await clips(page);
    expect.soft(a2.srcStart, `source in-point advanced (was ${a.srcStart}, now ${a2.srcStart})`).toBeGreaterThan(0.5);
    expect.soft(a2.end, 'end unchanged').toBeCloseTo(a.end, 1);
  });

  test('18c. dragging a clip moves it on the timeline', async ({ page }) => {
    await setup(page);
    const cs = await clips(page);
    const B = cs[1];
    const b = (await clipEl(page, B.id).boundingBox())!;
    await drag(page, { x: b.x + b.width / 2, y: b.y + b.height - 15 }, { x: b.x + b.width / 2 + 100, y: b.y + b.height - 15 });
    const B2 = (await clips(page)).find((c) => c.id === B.id)!;
    expect.soft(B2.start - B.start, `moved right by ~2 s, got ${B2.start - B.start}`).toBeGreaterThan(1.2);
    expect.soft(B2.end - B2.start, 'length unchanged').toBeCloseTo(B.end - B.start, 1);
  });

  test('18d. C splits the clip under the playhead', async ({ page }) => {
    await setup(page);
    const [a] = await clips(page);
    await selectClip(page, a.id);
    await page.evaluate(() => (window as any).__ZUSTAND_STORES__.editor.getState().setCurrentTime(1));
    await sleep(page, 300);
    await key(page, 'c');
    await sleep(page, 400);
    const cs = await clips(page);
    expect.soft(cs.length, 'one more clip after the split').toBe(3);
    const first = cs.find((c) => c.start === 0)!;
    expect.soft(first?.end, 'left part ends at the playhead').toBeCloseTo(1, 1);
    expect.soft(cs.some((c) => Math.abs(c.start - 1) < 0.05 && Math.abs(c.end - 3) < 0.05), 'right part runs from the playhead to the old end').toBe(true);
  });

  test('18e. ripple delete closes the gap', async ({ page }) => {
    await setup(page);
    const [a, b] = await clips(page);
    await selectClip(page, a.id);
    await key(page, 'Shift+Delete');
    await sleep(page, 500);
    const cs = await clips(page);
    expect.soft(cs.length, 'one clip left').toBe(1);
    expect.soft(cs[0]?.id).toBe(b.id);
    expect.soft(cs[0]?.start, 'the remaining clip moved to 0 (gap closed)').toBeCloseTo(0, 1);
  });

  test('18f. plain delete leaves the gap', async ({ page }) => {
    await setup(page);
    const [a, b] = await clips(page);
    await selectClip(page, a.id);
    await key(page, 'Delete');
    const cs = await clips(page);
    expect.soft(cs.length).toBe(1);
    expect.soft(cs[0]?.start, 'remaining clip keeps its position').toBeCloseTo(b.start, 1);
  });

  test('18g. snap: a clip dropped 3 px from its neighbour lands exactly on its edge (grid snap on and off)', async ({ page }) => {
    await setup(page);
    const [A, B] = await clips(page);
    // Preparation: park B 2 s to the right so a real drag has to bring it back.
    await page.evaluate(({ id }) => (window as any).__ZUSTAND_STORES__.editor.getState().updateClip(id, { startTime: 5, endTime: 8 }), { id: B.id });
    await sleep(page, 400);
    // The move drag anchors the clip's LEFT EDGE to the cursor (editor.store.ts updateDrag), so aim the
    // cursor 3 px to the right of A's right edge.
    const attempt = async () => {
      const ab = (await clipEl(page, A.id).boundingBox())!;
      const bb = (await clipEl(page, B.id).boundingBox())!;
      await drag(page, { x: bb.x + 10, y: bb.y + bb.height - 15 }, { x: ab.x + ab.width + 3, y: bb.y + bb.height - 15 });
      return (await clips(page)).find((c) => c.id === B.id)!.start;
    };
    expect(await ed(page, '(s)=>s.snapToGrid')).toBe(true);
    const snapped = await attempt();
    expect.soft(snapped, `snap on: B.start ${snapped} sits exactly on A.end (${A.end})`).toBeCloseTo(A.end, 6);
    await page.evaluate(({ id }) => (window as any).__ZUSTAND_STORES__.editor.getState().updateClip(id, { startTime: 5, endTime: 8 }), { id: B.id });
    await key(page, 'g');
    expect(await ed(page, '(s)=>s.snapToGrid')).toBe(false);
    const free = await attempt();
    expect.soft(free, `grid snap off: edge snapping still places B.start (${free}) exactly on A.end (${A.end})`).toBeCloseTo(A.end, 6);
  });

  test('18i. grabbing a clip in the middle and moving the mouse 25 px moves it ~0.5 s (no jump)', async ({ page }) => {
    await setup(page);
    const [, B] = await clips(page);
    const bb = (await clipEl(page, B.id).boundingBox())!;
    await drag(page, { x: bb.x + bb.width / 2, y: bb.y + bb.height - 15 }, { x: bb.x + bb.width / 2 + 25, y: bb.y + bb.height - 15 });
    const B2 = (await clips(page)).find((c) => c.id === B.id)!;
    expect.soft(Math.abs(B2.start - B.start), `moved ${B2.start - B.start} s for a 0.5 s mouse move (clip must keep the grab point under the cursor)`).toBeLessThanOrEqual(1);
  });

  test('18h. G toggles snapping', async ({ page }) => {
    await setup(page);
    const s0 = await ed(page, '(s)=>s.snapToGrid');
    await key(page, 'g');
    expect.soft(await ed(page, '(s)=>s.snapToGrid')).toBe(!s0);
  });
});

// =================================================================== 19. tracks
test.describe('19. track controls', () => {
  test('19a. audio track Mute toggles', async ({ page }) => {
    await setup(page);
    const before = (await tracksInfo(page)).find((t) => t.type === 'audio')!;
    await page.locator('button[title="Mute"]').first().click();
    await sleep(page, 300);
    const after = (await tracksInfo(page)).find((t) => t.type === 'audio')!;
    expect.soft(after.muted, 'audio track muted').toBe(!before.muted);
    await page.locator('button[title="Unmute"]').first().click();
    await sleep(page, 300);
    expect.soft((await tracksInfo(page)).find((t) => t.type === 'audio')!.muted, 'unmuted again').toBe(before.muted);
  });

  test('19b. video track Hide toggles', async ({ page }) => {
    await setup(page);
    await page.locator('button[title="Hide"]').first().click();
    await sleep(page, 300);
    expect.soft((await tracksInfo(page)).find((t) => t.type === 'video')!.visible, 'video track hidden').toBe(false);
    await page.locator('button[title="Show"]').first().click();
    await sleep(page, 300);
    expect.soft((await tracksInfo(page)).find((t) => t.type === 'video')!.visible).toBe(true);
  });

  test('19c. Lock prevents editing the track clips; Unlock restores it', async ({ page }) => {
    await setup(page);
    const [A, B] = await clips(page);
    await page.locator('button[title="Lock"]').first().click();
    await sleep(page, 300);
    expect.soft((await tracksInfo(page)).find((t) => t.type === 'video')!.locked, 'video track locked').toBe(true);
    const bb = (await clipEl(page, B.id).boundingBox())!;
    await drag(page, { x: bb.x + bb.width / 2, y: bb.y + bb.height - 15 }, { x: bb.x + bb.width / 2 + 100, y: bb.y + bb.height - 15 });
    expect.soft((await clips(page)).find((c) => c.id === B.id)!.start, 'locked clip did not move').toBe(B.start);
    await selectClip(page, A.id);
    await key(page, 'Delete');
    expect.soft((await clips(page)).length, 'locked track clips cannot be deleted').toBe(2);
    await page.locator('button[title="Unlock"]').first().click();
    await sleep(page, 300);
    const bb2 = (await clipEl(page, B.id).boundingBox())!;
    await drag(page, { x: bb2.x + bb2.width / 2, y: bb2.y + bb2.height - 15 }, { x: bb2.x + bb2.width / 2 + 100, y: bb2.y + bb2.height - 15 });
    expect.soft((await clips(page)).find((c) => c.id === B.id)!.start, 'unlocked clip moves again').toBeGreaterThan(B.start + 1);
  });
});


// =================================================================== 20. effects / transitions
test.describe('20. effects and transitions', () => {
  async function openEffectsTab(page: Page) {
    await page.locator('button', { hasText: /^Effects$/ }).first().click();
    await sleep(page, 400);
  }
  async function addEffect(page: Page, category: RegExp | null, card: RegExp) {
    if (category) {
      await page.locator('button', { hasText: category }).first().click();
      await sleep(page, 400);
    }
    await page.locator('[draggable="true"]', { hasText: card }).first().dblclick();
    await sleep(page, 600);
  }

  test('20a. double-clicking an effect card applies it to the selected clip; the clip shows an fx badge', async ({ page }) => {
    await setup(page);
    const [A] = await clips(page);
    await selectClip(page, A.id);
    await openEffectsTab(page);
    await addEffect(page, /^Sharpen & Blur/, /^Gaussian Blur/);
    const a2 = (await clips(page)).find((c) => c.id === A.id)!;
    expect.soft(a2.effects, 'effect added to the clip').toBe(1);
    await expect.soft(clipEl(page, A.id), 'clip shows an fx1 badge').toContainText('fx1');
  });

  test('20b. an applied effect can be removed from the properties panel', async ({ page }) => {
    await setup(page);
    const [A] = await clips(page);
    await selectClip(page, A.id);
    await openEffectsTab(page);
    await addEffect(page, /^Sharpen & Blur/, /^Gaussian Blur/);
    expect((await clips(page)).find((c) => c.id === A.id)!.effects).toBe(1);
    // right panel: Properties | Effects tabs
    await page.locator('button', { hasText: /^Effects \(\d+\)$/ }).click();
    await sleep(page, 500);
    await page.screenshot({ path: test.info().outputPath('inspector-effects.png') });
    const dump = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => (b.getAttribute('title') || b.getAttribute('aria-label') || (b.textContent || '').trim())).filter(Boolean));
    console.log('inspector effect buttons:', JSON.stringify(dump.filter((t) => /remove|delete|toggle|enable|disable|reset/i.test(t))));
    const rm = page.locator('button[title*="emove"], button[aria-label*="emove"], button[title*="elete"], button[aria-label*="elete"], button[title*="rash"]').filter({ hasNot: page.locator('[title="Delete track"]') }).first();
    await expect.soft(rm, 'a remove-effect control is shown for the applied effect').toBeVisible({ timeout: 3000 });
    await rm.click({ timeout: 3000 }).catch(() => {});
    await sleep(page, 500);
    expect.soft((await clips(page)).find((c) => c.id === A.id)!.effects, 'effect removed').toBe(0);
  });

  test('20c. a transition card can be applied to the selected clip', async ({ page }) => {
    await setup(page);
    const [A] = await clips(page);
    await selectClip(page, A.id);
    await openEffectsTab(page);
    await page.locator('[draggable="true"]', { hasText: /^Dip to Black/ }).first().dblclick();
    await sleep(page, 600);
    const a2 = (await clips(page)).find((c) => c.id === A.id)!;
    expect.soft(a2.effects, 'transition added to the clip').toBe(1);
  });
});

// =================================================================== 21. text / subtitle
test.describe('21. text and subtitle clips', () => {
  test('21. Title adds a text clip at the playhead; its text can be edited and is drawn in the preview', async ({ page }) => {
    await setup(page);
    await page.locator('button[aria-label="Title"]').click();
    await sleep(page, 700);
    const subs = (await clips(page)).filter((c) => c.type === 'subtitle');
    expect.soft(subs.length, 'a subtitle clip was added').toBe(1);
    expect.soft(subs[0]?.trackType).toBe('subtitle');
    expect.soft(subs[0]?.end - subs[0]?.start, 'default length 5 s').toBeCloseTo(5, 1);
    const area = page.locator('textarea', { hasText: 'Title Text' }).first();
    await expect.soft(area, 'inspector shows the text box of the selected text clip').toBeVisible();
    await area.fill('Hello E2E');
    await sleep(page, 600);
    const now = (await clips(page)).find((c) => c.type === 'subtitle')!;
    expect.soft(now.text, 'clip text updated from the inspector').toBe('Hello E2E');
    const shown = await page.evaluate(() => Array.from(document.querySelectorAll('*')).some((e) => e.children.length === 0 && (e.textContent || '').trim() === 'Hello E2E' && (e as HTMLElement).tagName !== 'TEXTAREA' && !!(e as HTMLElement).offsetParent));
    expect.soft(shown, 'the new text is drawn in the preview (not only in the inspector box)').toBe(true);
  });
});

// =================================================================== 22. volume / speed
test.describe('22. volume and speed', () => {
  test('22a. inspector Volume slider changes the clip volume', async ({ page }) => {
    await setup(page);
    const [A] = await clips(page);
    await selectClip(page, A.id);
    const slider = page.locator('xpath=//*[normalize-space(text())="Volume"]/following::input[@type="range"][1]');
    await slider.fill('50');
    await sleep(page, 500);
    const a2 = (await clips(page)).find((c) => c.id === A.id)!;
    expect.soft(a2.volume, `clip volume is 0.5 (got ${a2.volume})`).toBeCloseTo(0.5, 1);
  });

  test('22b. inspector Mute button mutes the clip', async ({ page }) => {
    await setup(page);
    const [A] = await clips(page);
    await selectClip(page, A.id);
    await page.locator('button[title="Mute"], button:text-is("Mute")').first().click();
    await sleep(page, 400);
    expect.soft(await ed(page, '(s)=>s.tracks[0].clips[0].muted'), 'clip muted').toBe(true);
  });

  test('22c. speed 2x halves the clip length on the timeline', async ({ page }) => {
    await setup(page);
    const [A] = await clips(page);
    await selectClip(page, A.id);
    await page.getByRole('button', { name: '2x', exact: true }).first().click();
    await sleep(page, 600);
    const a2 = (await clips(page)).find((c) => c.id === A.id)!;
    expect.soft(a2.speed, 'speed stored').toBe(2);
    expect.soft(a2.end - a2.start, `timeline length halves (3 s -> 1.5 s), got ${a2.end - a2.start}`).toBeCloseTo(1.5, 1);
  });
});

// =================================================================== 23. keyframes
test.describe('23. keyframes', () => {
  test('23. the stopwatch adds a keyframe; editing at another time adds a second one', async ({ page }) => {
    await setup(page);
    const [A] = await clips(page);
    await selectClip(page, A.id);
    await page.locator('button[title="Enable keyframes"]').first().click();
    await sleep(page, 500);
    const k1 = (await clips(page)).find((c) => c.id === A.id)!;
    expect.soft(k1.keyframes, 'one keyframe after enabling animation').toBe(1);
    await page.evaluate(() => (window as any).__ZUSTAND_STORES__.editor.getState().setCurrentTime(1.5));
    await sleep(page, 400);
    const slider = page.locator('xpath=//*[normalize-space(text())="Volume"]/following::input[@type="range"][1]');
    await slider.fill('40');
    await sleep(page, 600);
    const kfs = await ed(page, '(s)=>s.tracks[0].clips[0].keyframes.map(k=>[k.property,k.time,k.value])');
    expect.soft((kfs as unknown[]).length, `a keyframe was recorded at the new time (${JSON.stringify(kfs)})`).toBe(2);
  });
});

// =================================================================== 24. export
test.describe('24. export', () => {
  test('24. Export Video renders a short clip to a local file with the expected duration', async ({ page, electronApp }) => {
    test.setTimeout(240_000);
    await setup(page);
    await clearPlaceholders(page);
    await addRealClip(page, { len: 2 });
    await sleep(page, 800);
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'iris-e2e-vexp-')), 'out.mp4');
    await stubSaveDialog(electronApp, out);
    await page.locator('button', { hasText: /^Export Video/ }).first().click();
    await expect(page.getByText('Export Video').first()).toBeVisible();
    const go = page.locator('div.fixed button', { hasText: /^Export$/ }).first();
    await expect(go).toBeVisible({ timeout: 10_000 });
    await go.click();
    const done = page.getByText('Export Complete');
    const failed = page.getByText('Export Failed');
    await expect.poll(async () => (await done.isVisible().catch(() => false)) || (await failed.isVisible().catch(() => false)), { timeout: 180_000, intervals: [1000] }).toBe(true);
    if (await failed.isVisible().catch(() => false)) {
      const msg = await page.locator('div.fixed p').allInnerTexts();
      throw new Error('export failed: ' + msg.join(' | '));
    }
    expect(fs.existsSync(out), 'output file exists').toBe(true);
    expect.soft(fs.statSync(out).size, 'output file is not empty').toBeGreaterThan(1000);
    const d = ffprobeDuration(out);
    expect.soft(d, `exported duration ~2 s, got ${d}`).toBeGreaterThan(1.7);
    expect.soft(d).toBeLessThan(2.4);
  });
});
