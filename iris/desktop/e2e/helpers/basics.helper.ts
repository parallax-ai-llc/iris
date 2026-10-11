import type { Page } from 'playwright';
import { blurActive } from './shortcut.helper';
import { activeDoc } from './lifecycle.helper';

/**
 * Helpers for the "basic features" specs (basics-image.spec.ts / basics-video.spec.ts).
 * They sample the real editor canvas and drive it with real mouse input, so a
 * feature that only changes store state but never reaches the screen fails.
 */

export type RGBA = [number, number, number, number];

export interface DocBox {
  /** Screen rect of the main document canvas (already includes zoom / pan). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Document pixel size. */
  cw: number;
  ch: number;
}

/** Main document canvas = the one inside the transformed container (class shadow-2xl). */
export async function docBox(page: Page): Promise<DocBox> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas.shadow-2xl') as HTMLCanvasElement | null;
    if (!c) throw new Error('main document canvas not found');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cw: c.width, ch: c.height };
  });
}

/** Document coordinate -> screen coordinate. */
export function toScreen(b: DocBox, dx: number, dy: number): { x: number; y: number } {
  return { x: b.x + (dx / b.cw) * b.w, y: b.y + (dy / b.ch) * b.h };
}

/** Pixel of the visible document canvas at document coordinates. */
export async function px(page: Page, dx: number, dy: number): Promise<RGBA> {
  return page.evaluate(
    ({ dx, dy }) => {
      const c = document.querySelector('canvas.shadow-2xl') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(dx, dy, 1, 1).data;
      return [d[0], d[1], d[2], d[3]] as [number, number, number, number];
    },
    { dx: Math.round(dx), dy: Math.round(dy) },
  );
}

/** Cheap fingerprint of the whole canvas (sampled every 4th pixel) to detect "anything changed". */
export async function canvasHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas.shadow-2xl') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 16) {
      h ^= d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11;
      h = Math.imul(h, 16777619);
    }
    return `${c.width}x${c.height}:${h >>> 0}`;
  });
}

/** Count pixels in a doc rectangle that satisfy the predicate source `(r,g,b,a)=>boolean`. */
export async function countPixels(
  page: Page,
  rect: { x: number; y: number; w: number; h: number },
  predSrc: string,
): Promise<number> {
  return page.evaluate(
    ({ rect, predSrc }) => {
      const c = document.querySelector('canvas.shadow-2xl') as HTMLCanvasElement;
      const x = Math.max(0, Math.round(rect.x));
      const y = Math.max(0, Math.round(rect.y));
      const w = Math.min(c.width - x, Math.round(rect.w));
      const h = Math.min(c.height - y, Math.round(rect.h));
      if (w <= 0 || h <= 0) return 0;
      const d = c.getContext('2d')!.getImageData(x, y, w, h).data;
      // eslint-disable-next-line no-new-func
      const f = new Function('r', 'g', 'b', 'a', `return (${predSrc});`) as (r: number, g: number, b: number, a: number) => boolean;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2], d[i + 3])) n++;
      return n;
    },
    { rect, predSrc },
  );
}

export const colorNear = (a: ArrayLike<number>, b: ArrayLike<number>, tol = 24) =>
  [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= tol);

/** Mouse drag in DOCUMENT coordinates. */
export async function dragDoc(
  page: Page,
  from: [number, number],
  to: [number, number],
  opts: { steps?: number; via?: Array<[number, number]> } = {},
): Promise<void> {
  const b = await docBox(page);
  const a = toScreen(b, from[0], from[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (const v of opts.via ?? []) {
    const p = toScreen(b, v[0], v[1]);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  const z = toScreen(b, to[0], to[1]);
  await page.mouse.move(z.x, z.y, { steps: opts.steps ?? 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

export async function clickDoc(page: Page, at: [number, number]): Promise<void> {
  const b = await docBox(page);
  const p = toScreen(b, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(350);
}

/** Press a letter shortcut with focus on <body>. */
export async function key(page: Page, k: string): Promise<void> {
  await blurActive(page);
  await page.keyboard.press(k);
  await page.waitForTimeout(250);
}

export const imgState = async (page: Page, pick: string) =>
  page.evaluate((src) => {
    const s = (window as any).__ZUSTAND_STORES__.imageEditor.getState();
    // eslint-disable-next-line no-new-func
    return new Function('s', `return (${src})(s)`)(s);
  }, pick);

export const doc = activeDoc;

/** Run a store action on the active image editor (PREPARATION ONLY). */
export async function imgAction(page: Page, name: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    ({ name, args }) => {
      const s = (window as any).__ZUSTAND_STORES__.imageEditor.getState();
      if (typeof s[name] !== 'function') throw new Error(`no store action ${name}`);
      return s[name](...args);
    },
    { name, args },
  );
}

/** Wait until the history length changed from `before` (or timeout) and return the new length. */
export async function waitHistoryChange(page: Page, before: number, timeout = 4_000): Promise<number> {
  await page
    .waitForFunction(
      (n) => (window as any).__ZUSTAND_STORES__.imageEditor.getState().history.length !== n,
      before,
      { timeout },
    )
    .catch(() => {});
  return (await activeDoc(page)).historyLength;
}

// ------------------------------------------------------------------ media probing (ffmpeg-static)

import { execFileSync } from 'child_process';
import { createRequire } from 'module';

/** Duration (seconds) of a media file, read from `ffmpeg -i` output (ffmpeg-static is an app dependency). */
export function ffprobeDuration(filePath: string): number {
  const req = createRequire(import.meta.url);
  const ffmpeg: string = req('ffmpeg-static');
  let out = '';
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', filePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = String((e as { stderr?: string }).stderr ?? '');
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  if (!m) throw new Error(`cannot read duration of ${filePath}: ${out.slice(0, 300)}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// ------------------------------------------------------------------ minimal PNG decoder (8-bit RGB/RGBA, non-interlaced)

import zlib from 'zlib';

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8Array;
  at(x: number, y: number): [number, number, number, number];
}

export function decodePng(buf: Buffer): DecodedPng {
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8) throw new Error(`unsupported bit depth ${body[8]}`);
      colorType = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = line[x * channels];
      out[(y * width + x) * 4 + 1] = line[x * channels + 1];
      out[(y * width + x) * 4 + 2] = line[x * channels + 2];
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    prev = line;
  }
  return {
    width,
    height,
    data: out,
    at: (x, y) => {
      const o = (y * width + x) * 4;
      return [out[o], out[o + 1], out[o + 2], out[o + 3]];
    },
  };
}
