import type { Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Helpers for the keyboard-shortcut regression specs (shortcuts-*.spec.ts).
 *
 * The editors are opened straight through the dev-mode Zustand handles that
 * App.tsx exposes as `window.__ZUSTAND_STORES__` (renderer is served by Vite in
 * development mode). That keeps these specs independent of the gallery/server
 * contents: no cloud assets, no file dialogs, no writes to any API.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEST_CLIP_1 = path.resolve(__dirname, '../test-assets/test-clip-1.mp4');
export const TEST_CLIP_2 = path.resolve(__dirname, '../test-assets/test-clip-2.mp4');

/** Minimal structural view of the stores read by the specs (all state is `any`). */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyState = any;

/** Run `fn` in the page with the live Zustand state of one store. */
export async function readStore<T>(
  page: Page,
  store: 'imageEditor' | 'editorTabs' | 'ui' | 'editor',
  pick: (state: AnyState) => T,
): Promise<T> {
  return page.evaluate(
    ({ store, src }) => {
      const stores = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => unknown }> })
        .__ZUSTAND_STORES__;
      // eslint-disable-next-line no-new-func
      const fn = new Function('s', `return (${src})(s)`) as (s: unknown) => unknown;
      return fn(stores[store].getState());
    },
    { store, src: pick.toString() },
  ) as Promise<T>;
}

/** Wait until the dev-mode store handles exist (set in an effect after first render). */
export async function waitForStores(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __ZUSTAND_STORES__?: unknown }).__ZUSTAND_STORES__),
    undefined,
    { timeout: 20_000 },
  );
}

/** Drop keyboard focus onto <body> so keystrokes are not swallowed by a button/input. */
export async function blurActive(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
}

// ---------------------------------------------------------------- image editor

/**
 * Open the image editor on a freshly drawn image (one "Background" layer and
 * one baseline "Open" history entry, like opening an asset from the gallery)
 * and wait until the canvas is ready.
 */
export async function openImageEditor(page: Page, size = { width: 480, height: 320 }): Promise<void> {
  await waitForStores(page);
  await page.evaluate(({ width, height }) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#3366cc';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(40, 40, 120, 90);
    const dataUrl = c.toDataURL('image/png');
    const now = new Date().toISOString();
    const asset = {
      id: `local-e2e-${Date.now()}`,
      userId: '',
      name: 'e2e-shortcuts',
      storagePath: '',
      currentVersion: 1,
      assetType: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: 0,
      isPublic: false,
      previewUrl: dataUrl,
      createdAt: now,
      updatedAt: now,
    };
    const stores = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => any }> })
      .__ZUSTAND_STORES__;
    // Same entry point as clicking a gallery card: the canvas creates the Background
    // layer and the baseline "Open" history entry itself.
    stores.editorTabs.getState().openTab(asset);
  }, size);

  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => any }> })
        .__ZUSTAND_STORES__.imageEditor.getState();
      return s.isCanvasReady === true && s.layers.length > 0 && s.history.length > 0;
    },
    undefined,
    { timeout: 20_000 },
  );
  // Let the first render pass settle (history baseline, auto-fit zoom).
  await page.waitForTimeout(800);
  await blurActive(page);
}

/** Snapshot of the image-editor state the specs assert on. */
export async function imageState(page: Page) {
  return readStore(page, 'imageEditor', (s) => ({
    editMode: s.editMode as string,
    activeTool: s.activeTool as string,
    selectionTool: s.selectionTool as string,
    navigationTool: s.navigationTool as string,
    zoom: s.zoom as number,
    brushSize: s.brushSettings.size as number,
    brushColor: s.brushSettings.color as string,
    backgroundColor: s.backgroundColor as string,
    historyLength: s.history.length as number,
    historyIndex: s.historyIndex as number,
    layerCount: s.layers.length as number,
    colorProofing: s.colorProofing as boolean,
    gamutWarning: s.gamutWarning as boolean,
    quickMask: s.quickMaskEnabled as boolean,
    hasSelection: s.selection != null,
  }));
}

export async function currentPage(page: Page): Promise<string> {
  return readStore(page, 'ui', (s) => s.currentPage as string);
}

// ------------------------------------------------------------------ video editor

/** Real duration (seconds) of a local media file, read through a <video> element. */
export async function probeDuration(page: Page, filePath: string): Promise<number> {
  return page.evaluate(
    (p) =>
      new Promise<number>((resolve, reject) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve(v.duration);
        v.onerror = () => reject(new Error(`cannot read metadata of ${p}`));
        v.src = `file:///${p.replace(/\\/g, '/')}`;
      }),
    filePath,
  );
}

export interface VideoFixture {
  clipIds: string[];
  /** Duration of each clip placed on the timeline (seconds). */
  clipDuration: number;
}

/**
 * Open the video editor on an empty "project" with two real test clips laid
 * back to back on Video 1, and a subtitle on its own track.
 */
/**
 * Opens the video editor with two clips laid out back to back. The clips are
 * fixture data, not user edits, so the result is marked as the project's saved
 * state: closing right away must not ask about unsaved changes.
 * `clipSource: 'local'` gives the clips file:// asset ids, as if imported from disk.
 */
export async function openVideoEditor(
  page: Page,
  opts: { clipSource?: 'cloud' | 'local' } = {},
): Promise<VideoFixture> {
  await waitForStores(page);
  const d1 = await probeDuration(page, TEST_CLIP_1).catch(() => 4);
  const clipDuration = Number.isFinite(d1) && d1 > 0.5 ? Math.min(d1, 6) : 4;

  // Step 1: open the editor shell. VideoEditorPage re-initialises the project while
  // it mounts, so anything added before it settles is wiped.
  await page.evaluate(
    ({ clip1, clipDuration }) => {
      const stores = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => any }> })
        .__ZUSTAND_STORES__;
      const now = new Date().toISOString();
      // ids starting with "project-" are treated as blank projects: empty tracks.
      const asset = {
        id: 'project-e2e-shortcuts',
        userId: '',
        name: 'e2e-shortcuts',
        storagePath: '',
        currentVersion: 1,
        assetType: 'VIDEO',
        mimeType: 'video/mp4',
        sizeBytes: 0,
        isPublic: false,
        metadata: { duration: clipDuration * 2 },
        createdAt: now,
        updatedAt: now,
      };
      const ed = stores.editor.getState();
      ed.openEditor(asset);
      ed.setVideoUrl(`file:///${clip1.split('\\').join('/')}`);
    },
    { clip1: TEST_CLIP_1, clipDuration },
  );
  await page.waitForSelector('button:has-text("File")', { timeout: 20_000 });
  await page.waitForTimeout(1_500);

  // Step 2: two clips back to back on Video 1. VideoEditorPage re-initialises the
  // project asynchronously (probe, provisional project); when that lands after the
  // clips were added it wipes them, so add, wait, and retry until they stick.
  const addClips = () => page.evaluate(
    ({ clipDuration, clipSource }) => {
      const stores = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => any }> })
        .__ZUSTAND_STORES__;
      const s = stores.editor.getState();
      const videoTrack = s.tracks.find((t: any) => t.type === 'video');
      const local = clipSource === 'local';
      const mk = (name: string, start: number, assetId: string) => ({
        type: 'video',
        assetId,
        name,
        startTime: start,
        endTime: start + clipDuration,
        sourceStartTime: 0,
        sourceEndTime: clipDuration,
        transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 },
        volume: 1,
        muted: false,
        speed: 1,
        blendMode: 'normal',
        effects: [],
        keyframes: [],
      });
      const idA = local ? 'file:///e2e/local-clip-a.mp4' : 'e2e-clip-a';
      const idB = local ? 'file:///e2e/local-clip-b.mp4' : 'e2e-clip-b';
      const a = stores.editor.getState().addClip(videoTrack.id, mk('E2E Clip A', 0, idA));
      const b = stores.editor.getState().addClip(videoTrack.id, mk('E2E Clip B', clipDuration, idB));
      stores.editor.getState().clearSelection();
      // Fixture setup is the opened document, not an edit.
      stores.editor.getState().markSaved();
      return [a.id, b.id];
    },
    { clipDuration, clipSource: opts.clipSource ?? 'cloud' },
  );
  const clipsPresent = (ids: string[]) =>
    page.evaluate((ids) => {
      const st = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => any }> })
        .__ZUSTAND_STORES__.editor.getState();
      return ids.every((id) => st.tracks.some((t: any) => t.clips.some((c: any) => c.id === id)));
    }, ids);
  let clipIds: string[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    clipIds = await addClips();
    await page.waitForTimeout(1_000);
    if (await clipsPresent(clipIds)) break;
  }
  if (!(await clipsPresent(clipIds))) throw new Error('video fixture: clips kept being wiped by project init');

  await page.waitForTimeout(500);
  await blurActive(page);
  return { clipIds, clipDuration };
}

export async function videoState(page: Page) {
  return readStore(page, 'editor', (s) => ({
    isEditorOpen: s.isEditorOpen as boolean,
    isPlaying: s.isPlaying as boolean,
    playbackRate: s.playbackRate as number,
    currentTime: s.currentTime as number,
    duration: s.duration as number,
    pixelsPerSecond: s.pixelsPerSecond as number,
    historyLength: s.history.length as number,
    historyIndex: s.historyIndex as number,
    clipCount: s.tracks.reduce((n: number, t: any) => n + t.clips.length, 0) as number,
    clipIds: s.tracks.flatMap((t: any) => t.clips.map((c: any) => c.id)) as string[],
    selectedIds: s.selection.clipIds as string[],
    clipboardSize: (s.clipClipboard?.clips?.length ?? 0) as number,
  }));
}

// ---------------------------------------------------------------------- CDP keys

const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 } as const;

export interface CdpKeyOptions {
  /** `KeyboardEvent.key` the page should see (e.g. 'ㅍ', 'Process', 'Z'). */
  key: string;
  /** `KeyboardEvent.code` (physical key, e.g. 'KeyV'). */
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Windows virtual-key code. 229 = VK_PROCESSKEY, what an active IME reports. */
  keyCode?: number;
  /** Text inserted by the key (only for printable, non-IME events). */
  text?: string;
}

/**
 * Send one keystroke through Chromium's `Input.dispatchKeyEvent` so the page
 * sees exactly the key/code/keyCode combination we choose (Playwright's
 * `keyboard.press` always derives key from code, which cannot reproduce an IME
 * or a CapsLock state).
 */
export async function cdpKey(page: Page, opts: CdpKeyOptions): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const modifiers =
      (opts.alt ? MOD.alt : 0) | (opts.ctrl ? MOD.ctrl : 0) | (opts.shift ? MOD.shift : 0);
    const common = {
      modifiers,
      key: opts.key,
      code: opts.code,
      windowsVirtualKeyCode: opts.keyCode ?? 0,
      nativeVirtualKeyCode: opts.keyCode ?? 0,
    };
    await cdp.send('Input.dispatchKeyEvent', {
      type: opts.text ? 'keyDown' : 'rawKeyDown',
      ...common,
      ...(opts.text ? { text: opts.text, unmodifiedText: opts.text } : {}),
    });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/** Korean IME active (2-beolsik): the layout letter arrives as 'Process'/keyCode 229. */
export function imeKey(code: string, hangul: string, mods: Pick<CdpKeyOptions, 'ctrl' | 'shift' | 'alt'> = {}, asProcess = true): CdpKeyOptions {
  return asProcess
    ? { key: 'Process', code, keyCode: 229, ...mods }
    : { key: hangul, code, keyCode: 229, ...mods };
}
