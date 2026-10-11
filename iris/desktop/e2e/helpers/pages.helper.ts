import { expect, type Page } from '@playwright/test';
import { makeGradientPng } from './offline-server.helper';
import { readStore, waitForStores, blurActive } from './shortcut.helper';

/**
 * Helpers for the "pages outside the editors" specs (tests/app/basics-*.spec.ts).
 *
 * Safety model (these specs run against the fixed test account and must never write to the cloud):
 *  - installSandbox() wraps window.fetch in the renderer (page.route() is not usable under
 *    Electron, see offline-server.helper). Reads of the cloud API that the pages need are answered
 *    with deterministic stand-in data (gallery, library, projects, storage, /health), and EVERY
 *    non-GET request to a non-local origin is refused with a 403 and recorded.
 *  - Specs assert in afterEach that nothing was refused (= the page never tried a cloud write) and
 *    that the renderer logged no console errors / page errors.
 *  - Local things (local engine on 127.0.0.1, electron-store, files in the OS temp dir) may be
 *    written, but specs clean up after themselves.
 */

export const API_ORIGIN = 'http://localhost:4000';

/** Cloud writes that are part of the session (token refresh) and not data writes. */
const AUTH_PATH = /^\/(api\/)?auth\//;

// ------------------------------------------------------------------ stand-in data

export interface StubAsset {
  id: string;
  userId: string;
  name: string;
  storagePath: string;
  currentVersion: number;
  assetType: 'IMAGE' | 'VIDEO';
  mimeType: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  processingStatus: string;
  isPublic: boolean;
  thumbnailUrl: string;
  previewUrl: string;
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface SandboxData {
  images: StubAsset[];
  videos: StubAsset[];
  library: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  storage: Record<string, Array<Record<string, unknown>>>;
}

const day = (n: number) => new Date(Date.UTC(2026, 0, 10 + n)).toISOString();

function stubAsset(
  kind: 'IMAGE' | 'VIDEO',
  slug: string,
  name: string,
  dayOffset: number,
  sourceType: string,
  img: string,
): StubAsset {
  return {
    id: `e2e-mock-${slug}`,
    userId: 'e2e-user',
    name,
    storagePath: `e2e/${name}`,
    currentVersion: 1,
    assetType: kind,
    mimeType: kind === 'IMAGE' ? 'image/png' : 'video/mp4',
    sizeBytes: 2048,
    metadata: { width: 320, height: 240, sourceType, prompt: `prompt for ${name}`, ...(kind === 'VIDEO' ? { duration: 4 } : {}) },
    processingStatus: 'completed',
    isPublic: false,
    thumbnailUrl: img,
    previewUrl: img,
    publicUrl: img,
    createdAt: day(dayOffset),
    updatedAt: day(dayOffset),
  };
}

/** Deterministic cloud data. Names sort differently by name and by date on purpose. */
export function defaultSandboxData(): SandboxData {
  const img = 'data:image/png;base64,' + makeGradientPng().toString('base64');
  const project = (id: string, name: string, offset: number, duration: number) => ({
    id,
    userId: 'e2e-user',
    name,
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
    duration,
    thumbnailUrl: null,
    status: 'draft',
    lastExportedAt: null,
    exportedVideoId: null,
    createdAt: day(offset),
    updatedAt: day(offset),
    mediaPool: [],
  });
  const libItem = (id: string, prompt: string, offset: number) => ({
    id,
    userId: 'e2e-user',
    assetType: 'IMAGE',
    mimeType: 'image/png',
    publicMediaUrl: img,
    publicThumbnailUrl: img,
    sizeBytes: 2048,
    width: 320,
    height: 240,
    prompt,
    modelId: 'e2e-model',
    aspectRatio: '4:3',
    createdAt: day(offset),
  });
  return {
    images: [
      stubAsset('IMAGE', 'img-charlie', 'charlie.png', 1, 'generated', img),
      stubAsset('IMAGE', 'img-alpha', 'alpha.png', 3, 'uploaded', img),
      stubAsset('IMAGE', 'img-delta', 'delta.png', 2, 'generated', img),
      stubAsset('IMAGE', 'img-bravo', 'bravo.png', 4, 'upscaled', img),
    ],
    videos: [
      stubAsset('VIDEO', 'vid-zulu', 'zulu.mp4', 2, 'generated', img),
      stubAsset('VIDEO', 'vid-yankee', 'yankee.mp4', 4, 'uploaded', img),
      stubAsset('VIDEO', 'vid-xray', 'xray.mp4', 3, 'generated', img),
    ],
    library: [
      libItem('e2e-lib-1', 'library item one', 3),
      libItem('e2e-lib-2', 'library item two', 2),
      libItem('e2e-lib-3', 'library item three', 1),
    ],
    projects: [
      project('e2e-mock-proj-b', 'Beta project', 2, 12),
      project('e2e-mock-proj-a', 'Alpha project', 1, 30),
    ],
    storage: {
      '': [
        { name: 'e2e-docs', path: 'e2e-docs', size: 0, updated: day(1), isDirectory: true },
        { name: 'readme.txt', path: 'readme.txt', size: 12, contentType: 'text/plain', updated: day(2), isDirectory: false },
      ],
      'e2e-docs': [
        { name: 'inner.txt', path: 'e2e-docs/inner.txt', size: 5, contentType: 'text/plain', updated: day(3), isDirectory: false },
      ],
    },
  };
}

// ------------------------------------------------------------------ sandbox install

interface SandboxState {
  blocked: string[];
  deleted: string[];
}

/** Install the fetch wrapper now and on every later document load of this page. */
export async function installSandbox(page: Page, data: SandboxData = defaultSandboxData()): Promise<void> {
  const script = ({ apiOrigin, data, authPath }: { apiOrigin: string; data: SandboxData; authPath: string }) => {
    const w = window as unknown as {
      fetch: typeof fetch;
      __e2eSandbox?: { blocked: string[]; deleted: string[] };
    };
    if (w.__e2eSandbox) return;
    const state = { blocked: [] as string[], deleted: [] as string[] };
    w.__e2eSandbox = state;
    const realFetch = w.fetch.bind(window);
    const authRe = new RegExp(authPath);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const isLocal = (u: URL) =>
      u.origin === window.location.origin ||
      u.hostname === '127.0.0.1' ||
      (u.hostname === 'localhost' && u.port !== '4000') ||
      ['file:', 'data:', 'blob:'].includes(u.protocol);

    w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.href);
      const method = (
        init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')
      ).toUpperCase();

      if (url.origin === apiOrigin) {
        const p = url.pathname;
        if (method === 'GET' && p === '/health') return json({ status: 'ok' });
        // Reference data the pages read on mount: fixed answers so the specs do not depend on a live server.
        if (method === 'GET' && p === '/bases') {
          const model = (id: string, name: string, kind: 'image' | 'video') => ({
            id, name, provider: 'e2e', model: id, chat: false,
            imageGeneration: kind === 'image', videoGeneration: kind === 'video',
            webSearch: false, isFreeUserAccessible: true, isFast: false, isExpert: false,
            ...(kind === 'video' ? { supportedDurations: [4, 8], supportedAspectRatios: ['16:9', '9:16'] } : {}),
          });
          return json({
            models: [
              model('e2e-image-a', 'E2E Image A', 'image'),
              model('e2e-image-b', 'E2E Image B', 'image'),
              model('e2e-video-a', 'E2E Video A', 'video'),
              model('e2e-video-b', 'E2E Video B', 'video'),
            ],
          });
        }
        if (method === 'GET' && p === '/api/iris/token-costs') {
          return json({ costs: {}, descriptions: {}, modelPricing: {}, categories: { generator: [], analyzer: [], free: [] } });
        }
        if (method === 'GET' && p === '/whats-new') return json({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
        if (method === 'GET' && p === '/ideas') return json({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
        if (method === 'GET' && p === '/api/iris/assets') {
          const list = url.searchParams.get('type') === 'VIDEO' ? data.videos : data.images;
          return json({ assets: list, total: list.length, page: 1, limit: 50, totalPages: 1 });
        }
        // Stand-in assets have no bytes on the server: answer thumbnail/download with a 1x1 PNG.
        if (method === 'GET' && /^\/api\/iris\/assets\/e2e-mock-[^/]+\/(thumbnail|download)$/.test(p)) {
          const png = Uint8Array.from(
            atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
            (c) => c.charCodeAt(0),
          );
          return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
        }
        const del = /^\/api\/iris\/assets\/(e2e-mock-[^/]+)$/.exec(p);
        if (method === 'DELETE' && del) {
          state.deleted.push(del[1]);
          data.images = data.images.filter((a) => a.id !== del[1]);
          data.videos = data.videos.filter((a) => a.id !== del[1]);
          return json({ success: true });
        }
        if (method === 'GET' && p === '/api/iris/library') {
          return json({ items: data.library, total: data.library.length, page: 1, limit: 24, hasMore: false });
        }
        if (method === 'GET' && p === '/api/video-projects') {
          return json({ projects: data.projects, total: data.projects.length });
        }
        const proj = /^\/api\/video-projects\/([^/]+)$/.exec(p);
        if (method === 'GET' && proj) {
          const found = data.projects.find((x) => x.id === proj[1]);
          if (found) return json(found);
        }
        if (method === 'GET' && p === '/storage/list') {
          const items = data.storage[url.searchParams.get('path') ?? ''] ?? [];
          return json({ items, currentPath: url.searchParams.get('path') ?? '', hasMore: false });
        }
        if (method === 'GET' && p === '/storage/info') {
          return json({ totalSize: 17, fileCount: 2, quota: 1_000_000, quotaUsagePercent: 0 });
        }
      }

      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !isLocal(url) && !authRe.test(url.pathname)) {
        state.blocked.push(`${method} ${url.origin}${url.pathname}`);
        return json({ error: 'blocked by e2e write guard' }, 403);
      }
      return realFetch(input, init);
    };
  };
  const arg = { apiOrigin: API_ORIGIN, data, authPath: AUTH_PATH.source };
  await page.addInitScript(script, arg);
  await page.evaluate(script, arg);
}

export async function sandboxState(page: Page): Promise<SandboxState> {
  return page.evaluate(() => {
    const s = (window as unknown as { __e2eSandbox?: SandboxState }).__e2eSandbox;
    return { blocked: [...(s?.blocked ?? [])], deleted: [...(s?.deleted ?? [])] };
  });
}

// ------------------------------------------------------------------ renderer error collection

export interface ErrorLog {
  /** Renderer console errors and unhandled exceptions seen so far (network noise removed). */
  readonly list: string[];
}

const NOISE = [
  /updater:getStatus/,
  /Failed to load resource/, // cloud API / CDN unreachable or refused by the write guard: not an app defect
  /net::ERR_/,
  /ResizeObserver loop/,
  /Download the React DevTools/,
];

export function trackErrors(page: Page): ErrorLog {
  const list: string[] = [];
  page.on('pageerror', (e) => {
    if (!NOISE.some((r) => r.test(e.message))) list.push(`pageerror: ${e.message.slice(0, 300)}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (NOISE.some((r) => r.test(text))) return;
    list.push(`console.error: ${text.slice(0, 300)}`);
  });
  return { list };
}

// ------------------------------------------------------------------ session prep

/** Install the sandbox, reload so every page fetches through it, and wait for the shell. */
export async function preparePage(page: Page, data?: SandboxData): Promise<ErrorLog> {
  await installSandbox(page, data);
  // Collect errors only from the sandboxed document: the pre-reload page already
  // fetched real thumbnails without the stand-in server.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  const errors = trackErrors(page);
  await page.waitForSelector('nav', { state: 'visible', timeout: 30_000 });
  await waitForStores(page);
  // checkAuth() settles after first paint; pages gated on login render a prompt until then.
  await page.waitForFunction(
    () => {
      const a = (window as any).__ZUSTAND_STORES__?.auth?.getState?.();
      return !!a && a.isLoading === false;
    },
    undefined,
    { timeout: 20_000 },
  ).catch(() => {});
  // the assistant panel is persisted open/closed across launches: start every spec closed
  await page.evaluate(() => localStorage.setItem('iris.assistant.open', 'false'));
  return errors;
}

// ------------------------------------------------------------------ navigation

export const NAV_ITEMS = [
  { id: 'home', label: 'Home', key: '1', marker: 'text=Ready to create something amazing?' },
  { id: 'templates', label: 'Templates', key: '2', marker: 'h1:has-text("Workflow templates")' },
  { id: 'images', label: 'Images', key: '3', marker: 'button:has-text("Generate Image")' },
  { id: 'videos', label: 'Videos', key: '4', marker: 'h1:has-text("Video Gallery")' },
  { id: 'projects', label: 'Projects', key: '5', marker: 'h1:has-text("Video projects")' },
  { id: 'workflows', label: 'Workflows', key: '6', marker: 'h1:has-text("Workflows")' },
  { id: 'batch', label: 'Batch', key: '7', marker: 'h1:has-text("Batch jobs")' },
  { id: 'extensions', label: 'Extensions', key: '8', marker: 'h3:has-text("Extension Marketplace"), h1:has-text("Extension Marketplace")' },
  { id: 'library', label: 'Library', key: '9', marker: 'h1:has-text("Community shared creations")' },
  { id: 'storage', label: 'Storage', key: '0', marker: 'h1:has-text("Cloud storage")' },
] as const;

export const navButton = (page: Page, label: string) => page.locator(`nav button:has-text("${label}")`).first();

export async function goTo(page: Page, label: string): Promise<void> {
  await navButton(page, label).click();
  await page.waitForTimeout(400);
}

export const currentPageId = (page: Page) => readStore(page, 'ui', (s) => s.currentPage as string);

export async function resetFocus(page: Page): Promise<void> {
  await blurActive(page);
  await page.mouse.click(2, 2).catch(() => {});
  await blurActive(page);
}

// ------------------------------------------------------------------ local engine REST (workflows, batch)

export async function engineBase(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).electronAPI.iris.getApiBaseUrl() as Promise<string>);
}

export async function listWorkflowIds(page: Page): Promise<string[]> {
  const base = await engineBase(page);
  return page.evaluate(async (b) => {
    const res = await fetch(`${b}/api/iris/workflows`);
    const json = (await res.json()) as { workflows?: Array<{ id: string }> };
    return (json.workflows ?? []).map((w) => w.id);
  }, base);
}

export async function getWorkflow(page: Page, id: string) {
  const base = await engineBase(page);
  return page.evaluate(
    async ({ b, id }) => {
      const res = await fetch(`${b}/api/iris/workflows/${id}`);
      const json = (await res.json()) as {
        workflow?: { id: string; name: string; nodes: Array<{ nodeId: string; type: string }>; edges: unknown[] };
      };
      return json.workflow ?? null;
    },
    { b: base, id },
  );
}

export async function createWorkflowViaEngine(page: Page, body: Record<string, unknown>): Promise<string> {
  const base = await engineBase(page);
  const id = await page.evaluate(
    async ({ b, body }) => {
      const res = await fetch(`${b}/api/iris/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { workflow?: { id: string } };
      return json.workflow?.id ?? null;
    },
    { b: base, body },
  );
  if (!id) throw new Error('local engine did not create the workflow');
  return id;
}

/** Remove every workflow that did not exist in `before` (specs create them through the UI). */
export async function deleteWorkflowsCreatedSince(page: Page, before: string[]): Promise<void> {
  const base = await engineBase(page).catch(() => null);
  if (!base) return;
  const now = await listWorkflowIds(page).catch(() => [] as string[]);
  for (const id of now.filter((x) => !before.includes(x))) {
    await page
      .evaluate(({ b, id }) => fetch(`${b}/api/iris/workflows/${id}`, { method: 'DELETE' }).then(() => undefined), { b: base, id })
      .catch(() => {});
  }
}

// ------------------------------------------------------------------ gallery helpers

/** Names of the cards currently shown in an image/video gallery, in DOM order. */
export async function galleryNames(page: Page): Promise<string[]> {
  return page.locator('.dt-gallery p.truncate').allTextContents();
}

/** The (innermost) card element of a gallery item, found by its image alt. */
export const galleryCard = (page: Page, name: string) =>
  page.locator('.dt-gallery div.group', { has: page.locator(`img[alt="${name}"]`) }).last();

export const galleryCount = (page: Page) => page.locator('.dt-gallery p.truncate').count();

/** afterEach body shared by the specs: no cloud write attempted, no renderer error logged. */
export async function assertClean(page: Page, errors: ErrorLog): Promise<void> {
  const s = await sandboxState(page).catch(() => ({ blocked: [] as string[], deleted: [] as string[] }));
  expect.soft(s.blocked, 'cloud writes the page attempted (refused by the sandbox)').toEqual([]);
  expect.soft(errors.list, 'renderer console errors / unhandled exceptions').toEqual([]);
}
