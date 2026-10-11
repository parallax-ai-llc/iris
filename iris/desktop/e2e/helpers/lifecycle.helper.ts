import type { ElectronApplication, Page } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { readStore, waitForStores, blurActive } from './shortcut.helper';

/**
 * Helpers for the document / tab lifecycle specs (lifecycle-*.spec.ts).
 *
 * Opening and closing goes through the user paths wherever possible:
 *  - first image: Images page "Open" button -> (stubbed) native file dialog
 *  - more images: File > Open...
 *  - close: tab X button, File > Close Tab, Ctrl+W
 *  - leave: Esc / File > Back to Gallery
 * Only the video editor is opened through the dev-mode store handles (see
 * shortcut.helper.openVideoEditor): the user paths for a project hit the cloud
 * API (create/save project), which these specs must never write to.
 */

// ------------------------------------------------------------------ test images

function crc32(buf: Buffer): number {
  let r = 0xffffffff;
  for (const x of buf) {
    let c = (r ^ x) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    r = c ^ (r >>> 8);
  }
  return (r ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const row = w * 3 + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * row + 1 + x * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface TestImage {
  name: string;
  path: string;
  width: number;
  height: number;
}

/** Three small solid-colour PNGs with different sizes, written to the OS temp dir. */
export function makeTestImages(): [TestImage, TestImage, TestImage] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-e2e-lifecycle-'));
  const mk = (name: string, w: number, h: number, rgb: [number, number, number]): TestImage => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, solidPng(w, h, rgb));
    return { name, path: p, width: w, height: h };
  };
  return [
    mk('life-a.png', 640, 480, [200, 40, 40]),
    mk('life-b.png', 800, 600, [40, 160, 60]),
    mk('life-c.png', 512, 512, [40, 70, 200]),
  ];
}

// ------------------------------------------------------------------ dialog stub

/** Make the next native "open file" dialogs answer with these paths (in order). */
export async function stubOpenDialog(electronApp: ElectronApplication, paths: string[]): Promise<void> {
  await electronApp.evaluate(({ dialog }, queue) => {
    const g = globalThis as unknown as { __e2eOpenQueue?: string[] };
    g.__e2eOpenQueue = [...queue];
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => {
      const next = g.__e2eOpenQueue?.shift();
      return next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] };
    };
  }, paths);
}

// ------------------------------------------------------------------ navigation

export async function goToPage(page: Page, label: string): Promise<void> {
  await page.locator(`nav button:has-text("${label}")`).first().click();
  await page.waitForTimeout(500);
}

export const tabCount = (page: Page) => readStore(page, 'editorTabs', (s) => s.tabs.length as number);

export async function tabsSnapshot(page: Page) {
  return readStore(page, 'editorTabs', (s) => ({
    ids: s.tabs.map((t: any) => t.id) as string[],
    names: s.tabs.map((t: any) => t.asset.name) as string[],
    dirty: s.tabs.map((t: any) => t.isDirty) as boolean[],
    activeIndex: s.tabs.findIndex((t: any) => t.id === s.activeTabId) as number,
    visible: s.isEditorVisible as boolean,
  }));
}

/** State of the ACTIVE tab's image-editor store. */
export async function activeDoc(page: Page) {
  return readStore(page, 'imageEditor', (s) => ({
    ready: s.isCanvasReady as boolean,
    name: (s.sourceAsset?.name ?? null) as string | null,
    layers: s.layers.map((l: any) => l.name) as string[],
    layerCount: s.layers.length as number,
    historyLength: s.history.length as number,
    historyIndex: s.historyIndex as number,
    historyLabels: s.history.map((h: any) => h.label) as string[],
    isDirty: s.isDirty as boolean,
    zoom: s.zoom as number,
    hasSelection: s.selection != null,
    canvasWidth: s.canvasWidth as number,
    canvasHeight: s.canvasHeight as number,
  }));
}

export async function waitDocReady(page: Page, name?: string): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const s = (window as any).__ZUSTAND_STORES__?.imageEditor?.getState();
      return !!s && s.isCanvasReady === true && (n ? s.sourceAsset?.name === n : true);
    },
    name,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(900); // let first render / history baseline / auto-fit settle
  await blurActive(page);
}

// ------------------------------------------------------------------ open helpers

/** Open a local image through Images page > "Open" (native dialog stubbed). */
export async function openFromGallery(page: Page, electronApp: ElectronApplication, img: TestImage): Promise<void> {
  await waitForStores(page);
  await ensureGallery(page);
  await stubOpenDialog(electronApp, [img.path]);
  await goToPage(page, 'Images');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForSelector('button:has-text("File")', { timeout: 20_000 });
  await waitDocReady(page, img.name);
}

/**
 * Leave the editor through File > Back to Gallery if it is showing (tabs stay alive), dismissing
 * the local-file confirmation when the app asks for one.
 *
 * Why the multi-document specs open every further document from the GALLERY instead of from
 * inside the editor: a document opened while the editor is already mounted never loads its canvas
 * (see lifecycle-image.spec.ts "7a"), so any later step would only be testing that bug.
 */
export async function ensureGallery(page: Page): Promise<void> {
  const visible = await readStore(page, 'editorTabs', (s) => s.isEditorVisible as boolean);
  if (!visible) return;
  await menu(page, 'File', 'Back to Gallery');
  await discardIfAsked(page);
  await page.waitForFunction(() => !(window as any).__ZUSTAND_STORES__.editorTabs.getState().isEditorVisible, undefined, { timeout: 5_000 });
  await page.waitForTimeout(300);
}

/**
 * Preparation only: bring a hidden editor back so it re-mounts with the active tab. There is no
 * UI affordance for this (see scenario 17), so the store flag is flipped directly.
 */
export async function remountEditor(page: Page): Promise<void> {
  await ensureGallery(page);
  await page.evaluate(() => (window as any).__ZUSTAND_STORES__.editorTabs.setState({ isEditorVisible: true }));
  await page.waitForSelector('button:has-text("File")', { timeout: 10_000 });
  await waitDocReady(page);
}

/** Open another local image through the editor menu File > Open... */
export async function openFromMenu(
  page: Page,
  electronApp: ElectronApplication,
  img: TestImage,
  opts: { noWait?: boolean } = {},
): Promise<void> {
  await stubOpenDialog(electronApp, [img.path]);
  await menu(page, 'File', 'Open...');
  if (opts.noWait) {
    await page.waitForFunction(
      (n) => (window as any).__ZUSTAND_STORES__.editorTabs.getState().tabs.some((t: any) => t.asset.name === n),
      img.name,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(1_500);
    return;
  }
  await waitDocReady(page, img.name);
}

/** Click a top-level menu of the editor menu bar, then one of its items. */
export async function menu(page: Page, top: string, item: string): Promise<void> {
  await page.locator('button', { hasText: new RegExp('^' + top + '$') }).first().click();
  await page.locator('button', { has: page.locator('span:text-is("' + item + '")') }).first().click();
}

// ------------------------------------------------------------------ edit helpers

/**
 * A real edit: a brush stroke across the canvas (the canvas pushes a history
 * entry for it). Returns after the history grew or 5 s passed.
 */
export async function brushStroke(page: Page): Promise<void> {
  const before = (await activeDoc(page)).historyLength;
  await blurActive(page);
  await page.keyboard.press('b');
  const box = await page.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('canvas')).map((c) => c.getBoundingClientRect());
    cs.sort((a, b) => b.width * b.height - a.width * a.height);
    const r = cs[0];
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  await page.mouse.move(cx - 30, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 10, { steps: 5 });
  await page.mouse.move(cx + 30, cy, { steps: 5 });
  await page.mouse.up();
  await page
    .waitForFunction(
      (n) => (window as any).__ZUSTAND_STORES__.imageEditor.getState().history.length > n,
      before,
      { timeout: 5_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
  await blurActive(page);
}

// ------------------------------------------------------------------ dialogs

/** True when an "unsaved" confirmation dialog (cloud or local variant) is on screen. */
export async function unsavedDialogVisible(page: Page, timeout = 1_500): Promise<boolean> {
  return page
    .locator('text=/Unsaved (Changes|Local Image|Local Video)/')
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

/** Dismiss any unsaved dialog by confirming the discard, so one failed assertion does not cascade. */
export async function discardIfAsked(page: Page): Promise<void> {
  if (await unsavedDialogVisible(page, 500)) {
    await page.locator('button:has-text("Close Without Saving"), button:has-text("Discard")').first().click();
    await page.waitForTimeout(400);
  }
}

export async function cancelDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await page.waitForTimeout(300);
}

/** Close a tab by clicking the X of the named tab. */
export async function closeTabByX(page: Page, name: string): Promise<void> {
  const tab = page.locator('div.group', { hasText: name }).first();
  await tab.hover();
  await tab.locator('button[title="Close tab"]').click();
}

export async function activateTab(page: Page, name: string): Promise<void> {
  await page.locator('div.group', { hasText: name }).first().click();
  await page.waitForTimeout(500);
}

// ------------------------------------------------------------------ extra helpers

/** Answer the native "save file" dialog with this path (local saves write to disk only). */
export async function stubSaveDialog(electronApp: ElectronApplication, filePath: string): Promise<void> {
  await electronApp.evaluate(({ dialog }, p) => {
    (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({ canceled: false, filePath: p });
  }, filePath);
}

/**
 * Open a "cloud-like" asset (any id that does not start with `local-`) straight
 * through editorTabs.openTab - the same call a gallery card click makes. This
 * is a preparation step only: the real gallery needs cloud assets, and a local
 * file would always trigger the local-file warning, hiding the isDirty logic
 * the spec wants to look at. Nothing is uploaded or saved.
 */
export async function openCloudLike(
  page: Page,
  name: string,
  rgb: [number, number, number],
  id = `e2e-cloud-${name}`,
  opts: { inEditor?: boolean } = {},
): Promise<void> {
  await waitForStores(page);
  if (!opts.inEditor) await ensureGallery(page);
  await page.evaluate(
    ({ name, rgb, id }) => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 400;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = `rgb(${rgb.join(',')})`;
      ctx.fillRect(0, 0, 600, 400);
      const now = new Date().toISOString();
      const asset = {
        id,
        userId: '',
        name,
        storagePath: '',
        currentVersion: 1,
        assetType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 0,
        isPublic: false,
        previewUrl: c.toDataURL('image/png'),
        createdAt: now,
        updatedAt: now,
      };
      (window as any).__ZUSTAND_STORES__.editorTabs.getState().openTab(asset);
    },
    { name, rgb, id },
  );
  await waitDocReady(page, name);
}

/** Colour of the top-left pixel of the visible document canvas (largest non-transparent canvas). */
export async function canvasCorner(page: Page): Promise<[number, number, number] | null> {
  return page.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('canvas')).sort(
      (a, b) => b.width * b.height - a.width * a.height,
    );
    for (const c of cs) {
      try {
        const d = c.getContext('2d')?.getImageData(4, 4, 1, 1).data;
        if (d && d[3] > 0) return [d[0], d[1], d[2]] as [number, number, number];
      } catch {
        /* tainted or webgl canvas */
      }
    }
    return null;
  });
}

/** Poll up to `timeout` ms until the document canvas corner has this colour; returns the last colour seen. */
export async function waitCorner(
  page: Page,
  rgb: [number, number, number],
  timeout = 3_000,
): Promise<{ ok: boolean; seen: [number, number, number] | null }> {
  const end = Date.now() + timeout;
  let seen: [number, number, number] | null = null;
  do {
    seen = await canvasCorner(page);
    if (near(seen, rgb)) return { ok: true, seen };
    await page.waitForTimeout(250);
  } while (Date.now() < end);
  return { ok: false, seen };
}

export function near(a: [number, number, number] | null, b: [number, number, number], tol = 30): boolean {
  return !!a && a.every((v, i) => Math.abs(v - b[i]) <= tol);
}

/** Collect renderer console errors / uncaught exceptions for the report. */
export function watchErrors(page: Page): string[] {
  const out: string[] = [];
  page.on('pageerror', (e) => { if (!/updater:getStatus/.test(e.message)) out.push(`pageerror: ${e.message}`); });
  page.on('console', (m) => {
    if (/updater:getStatus/.test(m.text())) return;
    if (m.type() === 'error' || /Can't perform a React state update|unmounted component/.test(m.text())) {
      out.push(`console.${m.type()}: ${m.text().slice(0, 300)}`);
    }
  });
  return out;
}
