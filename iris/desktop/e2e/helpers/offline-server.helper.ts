import type { Page } from '@playwright/test';
import zlib from 'zlib';

/**
 * Minimal stand-in for the Iris cloud server, for specs that need an editor open but run on a
 * machine where VITE_API_URL (http://localhost:4000) is not up.
 *
 * Only what is needed to reach the editors is answered:
 *   - GET  /api/iris/assets            → one finished IMAGE asset (opens the image editor)
 *   - GET  /api/iris/assets/:id        → that asset
 *   - the asset carries a generated 320x240 PNG as a data: URL
 *   - ANY  /api/video-projects[...]    → an empty project (opens the video editor)
 * Everything else (other API calls) is passed through untouched (and fails the way it does without a server).
 * Nothing is persisted; no real data is created.
 */

const API_ORIGIN = 'http://localhost:4000';
const MOCK_ASSET_ID = 'e2e-mock-image-asset';
const MOCK_PROJECT_ID = 'e2e-mock-video-project';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Opaque RGB gradient PNG, no dependencies. */
export function makeGradientPng(width = 320, height = 240): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3); // filter byte 0
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = Math.round((x / width) * 255);
      row[2 + x * 3] = Math.round((y / height) * 255);
      row[3 + x * 3] = 160;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const NOW = '2026-01-01T00:00:00.000Z';

const MOCK_ASSET = {
  id: MOCK_ASSET_ID,
  userId: 'e2e-user',
  name: 'e2e-mock-image.png',
  storagePath: 'e2e/mock-image.png',
  currentVersion: 1,
  assetType: 'IMAGE',
  mimeType: 'image/png',
  sizeBytes: 1024,
  metadata: { width: 320, height: 240 },
  processingStatus: 'completed',
  isPublic: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const MOCK_PROJECT = {
  id: MOCK_PROJECT_ID,
  userId: 'e2e-user',
  name: 'E2E Assistant Shell',
  description: null,
  width: 1920,
  height: 1080,
  frameRate: 30,
  timelineData: {
    version: 1,
    settings: { backgroundColor: '#000000', defaultTransitionDuration: 1, audioFadeDefault: 0.5 },
    tracks: [],
    markers: [],
  },
  duration: 0,
  thumbnailUrl: null,
  status: 'draft',
  lastExportedAt: null,
  exportedVideoId: null,
  createdAt: NOW,
  updatedAt: NOW,
  mediaPool: [],
};

/** True when the shell's connection indicator says the cloud server is unreachable. */
export async function isServerDisconnected(page: Page): Promise<boolean> {
  const status = page.locator('aside.dt-rail .dt-conn');
  await status.waitFor({ state: 'attached', timeout: 10_000 });
  // The label settles on Connected / Disconnected after the first health check.
  await page
    .waitForFunction(
      () => /(^|\s)(Connected|Disconnected)(\s|$)/.test(document.querySelector('aside.dt-rail .dt-conn')?.textContent ?? ''),
      undefined,
      { timeout: 10_000 }
    )
    .catch(() => {});
  const text = (await status.textContent()) ?? '';
  return !/(^|\s)Connected(\s|$)/.test(text);
}

/**
 * Install the stand-in into the current document (re-run after every reload).
 *
 * Implemented as a window.fetch wrapper rather than page.route(): Playwright's request interception
 * under Electron delivers every fulfilled response with status 0, which the app reads as a failure.
 * The app calls the global fetch at request time, so wrapping it is enough. Images are served as
 * data: URLs for the same reason.
 */
export async function installOfflineServer(page: Page): Promise<void> {
  const imageUrl = 'data:image/png;base64,' + makeGradientPng().toString('base64');
  await page.evaluate(
    ({ apiOrigin, asset, project, assetId, image }) => {
      const w = window as unknown as { fetch: typeof fetch; __offlineServerInstalled?: boolean };
      if (w.__offlineServerInstalled) return;
      w.__offlineServerInstalled = true;
      const realFetch = w.fetch.bind(window);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, window.location.href);
        if (url.origin !== apiOrigin) return realFetch(input, init);
        const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
        const withImage = { ...asset, thumbnailUrl: image, previewUrl: image, publicUrl: image };

        if (url.pathname === '/api/iris/assets' && method === 'GET') {
          const isImage = url.searchParams.get('type') !== 'VIDEO';
          return json({ assets: isImage ? [withImage] : [], total: isImage ? 1 : 0, page: 1, limit: 50, totalPages: 1 });
        }
        if (url.pathname === '/api/iris/assets/' + assetId && method === 'GET') return json(withImage);
        if (url.pathname === '/api/video-projects' && method === 'GET') return json({ projects: [], total: 0 });
        if (url.pathname.startsWith('/api/video-projects')) return json(project);
        return realFetch(input, init);
      };
    },
    {
      apiOrigin: API_ORIGIN,
      asset: MOCK_ASSET,
      project: MOCK_PROJECT,
      assetId: MOCK_ASSET_ID,
      image: imageUrl,
    }
  );
}

// ==================== Relight (AI edit) stand-in ====================

export const MOCK_RELIGHT_JOB_ID = 'e2e-relight-job';

export interface RelightMockOptions {
  /** 'ready' (default): READY after `pendingPolls`; 'fail': FAILED; 'hang': PROCESSING forever. */
  outcome?: 'ready' | 'fail' | 'hang';
  /** PROCESSING answers before the final one. */
  pendingPolls?: number;
}

/**
 * Answer the Relight job instead of the cloud so no credits are spent:
 *   - POST /api/iris/assets/generate with editMode "relight" → 202-style { asset } (PROCESSING)
 *   - GET  /api/iris/assets/e2e-relight-job → PROCESSING, then READY with a 512x512 PNG
 *     (the IC-Light output size), or FAILED / PROCESSING forever.
 * Every other request passes through. Relight request bodies are kept in
 * window.__relightRequests so a spec can check the prompt that was sent.
 * Re-run after a reload; calling it again replaces the options.
 */
export async function installRelightMock(page: Page, options: RelightMockOptions = {}): Promise<void> {
  const resultUrl = 'data:image/png;base64,' + makeGradientPng(512, 512).toString('base64');
  await page.evaluate(
    ({ apiOrigin, jobId, image, outcome, pendingPolls, now }) => {
      type W = {
        fetch: typeof fetch;
        __relightMock?: { outcome: string; pendingPolls: number; polls: number };
        __relightRequests?: unknown[];
      };
      const w = window as unknown as W;
      const firstInstall = !w.__relightMock;
      w.__relightMock = { outcome, pendingPolls, polls: 0 };
      w.__relightRequests = [];
      if (!firstInstall) return;

      const realFetch = w.fetch.bind(window);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      const job = (status: string, extra: Record<string, unknown> = {}) => ({
        id: jobId,
        userId: 'e2e-user',
        name: 'e2e-relight.png',
        storagePath: 'e2e/relight.png',
        currentVersion: 2,
        assetType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 1024,
        isPublic: false,
        processingStatus: status,
        createdAt: now,
        updatedAt: now,
        ...extra,
      });

      w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, window.location.href);
        if (url.origin !== apiOrigin) return realFetch(input, init);
        const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
        const state = w.__relightMock!;

        if (url.pathname === '/api/iris/assets/generate' && method === 'POST' && typeof init?.body === 'string') {
          let body: { editMode?: string } | null = null;
          try {
            body = JSON.parse(init.body);
          } catch {
            body = null;
          }
          if (body?.editMode === 'relight') {
            w.__relightRequests!.push(body);
            state.polls = 0;
            return json({ asset: job('PROCESSING') }, 202);
          }
        }
        if (url.pathname === '/api/iris/assets/' + jobId && method === 'GET') {
          state.polls += 1;
          if (state.outcome === 'hang' || state.polls <= state.pendingPolls) return json(job('PROCESSING'));
          if (state.outcome === 'fail') return json(job('FAILED', { processingError: 'E2E relight failure' }));
          return json(job('READY', { thumbnailUrl: image, previewUrl: image, publicUrl: image }));
        }
        return realFetch(input, init);
      };
    },
    {
      apiOrigin: API_ORIGIN,
      jobId: MOCK_RELIGHT_JOB_ID,
      image: resultUrl,
      outcome: options.outcome ?? 'ready',
      pendingPolls: options.pendingPolls ?? 1,
      now: NOW,
    }
  );
}

/** Relight request bodies captured by installRelightMock. */
export async function getRelightRequests(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    () => ((window as unknown as { __relightRequests?: Array<Record<string, unknown>> }).__relightRequests ?? [])
  );
}
