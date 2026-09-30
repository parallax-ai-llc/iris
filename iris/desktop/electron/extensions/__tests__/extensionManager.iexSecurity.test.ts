// @vitest-environment node
/**
 * ExtensionManager.installFromIex — marketplace bundle integrity.
 *
 * A bundle URL is only installed when it is on the official storage host and
 * its bytes hash to the server-issued SHA-256; local developer bundles never
 * get more than the community trust tier. Electron, the host fork and the API
 * handlers are mocked; extraction and installation run for real in tmpdir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import type { BrowserWindow } from 'electron';

const h = vi.hoisted(() => ({ userDataDir: '', tempDir: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'temp' ? h.tempDir : h.userDataDir),
    isPackaged: true,
  },
  BrowserWindow: class {},
}));

vi.mock('../apiHandlers/index', () => ({
  registerAllApiHandlers: vi.fn(),
}));

vi.mock('../extensionHost', async () => {
  const { EventEmitter } = await import('events');
  class ExtensionHost extends EventEmitter {
    start = vi.fn(async () => {});
    stop = vi.fn(async () => {});
    activateExtension = vi.fn(async () => {});
    deactivateExtension = vi.fn(async () => {});
    sendMessage = vi.fn();
    executeCommand = vi.fn(async () => undefined);
    executeTool = vi.fn(async () => undefined);
  }
  return { ExtensionHost };
});

import { ExtensionManager } from '../extensionManager';
import { OFFICIAL_BUNDLE_URL_PREFIXES } from '../bundleSecurity';

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
const responseOf = (buf: Buffer) => new Response(new Uint8Array(buf));

const BUNDLE_URL = `${OFFICIAL_BUNDLE_URL_PREFIXES.production}cmext0001/1.0.0/pub.market-1.0.0.iex`;

function bundleBytes(
  id = 'pub.market',
  overrides: Record<string, unknown> = {},
  extraEntries: Record<string, string> = {},
): Buffer {
  const manifest = {
    id,
    name: id.split('.')[1],
    version: '1.0.0',
    main: './dist/index.js',
    publisher: id.split('.')[0],
    activationEvents: ['onStartup'],
    permissions: ['filesystem:write', 'network'],
    ...overrides,
  };
  const zip = new AdmZip();
  zip.addFile('iris-extension.json', Buffer.from(JSON.stringify(manifest)));
  zip.addFile('dist/index.js', Buffer.from('export function activate() {}'));
  for (const [name, data] of Object.entries(extraEntries)) {
    zip.addFile(name, Buffer.from(data));
  }
  return zip.toBuffer();
}

function makeFakeWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn(), isDestroyed: () => false },
  } as unknown as BrowserWindow & { webContents: { send: ReturnType<typeof vi.fn> } };
}

describe('ExtensionManager.installFromIex — bundle integrity', () => {
  let workRoot: string;
  let manager: ExtensionManager;
  let win: ReturnType<typeof makeFakeWindow>;
  let fetchMock: ReturnType<typeof vi.fn>;

  const installedDir = (id: string) => path.join(h.userDataDir, 'extensions', id);
  const grantedFor = (id: string) =>
    manager.getInstalledExtensions().find((e) => e.id === id)?.grantedPermissions ?? [];

  beforeEach(async () => {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-iexsec-test-'));
    h.userDataDir = path.join(workRoot, 'userData');
    h.tempDir = path.join(workRoot, 'temp');
    fs.mkdirSync(h.userDataDir, { recursive: true });
    fs.mkdirSync(h.tempDir, { recursive: true });

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    manager = new ExtensionManager();
    win = makeFakeWindow();
    await manager.initialize(win);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(workRoot, { recursive: true, force: true });
  });

  it('installs an official bundle whose bytes match the server-issued hash', async () => {
    const bytes = bundleBytes();
    fetchMock.mockResolvedValue(responseOf(bytes));

    const result = await manager.installFromIex(BUNDLE_URL, 'official', { sha256: sha256(bytes) });

    expect(result).toEqual({ success: true, extensionId: 'pub.market' });
    expect(fetchMock).toHaveBeenCalledWith(BUNDLE_URL, { redirect: 'error' });
    expect(fs.existsSync(path.join(installedDir('pub.market'), 'dist', 'index.js'))).toBe(true);
    // Verified official bundle: its tier still applies.
    expect(grantedFor('pub.market')).toEqual(['filesystem:write', 'network']);
  });

  it('refuses a bundle whose bytes were swapped after review', async () => {
    const reviewed = bundleBytes();
    const swapped = bundleBytes('pub.market', { permissions: ['filesystem:write'] }, {
      'dist/payload.js': 'require("child_process")',
    });
    fetchMock.mockResolvedValue(responseOf(swapped));

    const result = await manager.installFromIex(BUNDLE_URL, 'official', { sha256: sha256(reviewed) });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/integrity check failed/);
    expect(fs.existsSync(installedDir('pub.market'))).toBe(false);
    expect(manager.getInstalledExtensions()).toEqual([]);
    // The temp extraction dir is cleaned up too.
    expect(fs.readdirSync(h.tempDir)).toEqual([]);
  });

  it('refuses a marketplace URL without a hash (legacy server record) and never downloads it', async () => {
    const result = await manager.installFromIex(BUNDLE_URL, 'community');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sha256\) is missing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'https://evil.example/pub.market-1.0.0.iex',
    'http://storage.googleapis.com/parallax-ai-images/production/extensions/cmext0001/1.0.0/pub.market-1.0.0.iex',
    'https://storage.googleapis.com/attacker-bucket/production/extensions/cmext0001/1.0.0/pub.market-1.0.0.iex',
    `${OFFICIAL_BUNDLE_URL_PREFIXES.dev}cmext0001/1.0.0/pub.market-1.0.0.iex`,
  ])('refuses a bundle URL off the official host: %s', async (url) => {
    const bytes = bundleBytes();
    fetchMock.mockResolvedValue(responseOf(bytes));

    const result = await manager.installFromIex(url, 'official', { sha256: sha256(bytes) });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.existsSync(installedDir('pub.market'))).toBe(false);
  });

  it('never grants a local developer bundle more than the community tier', async () => {
    const file = path.join(workRoot, 'dev.iex');
    fs.writeFileSync(file, bundleBytes('pub.local'));

    const result = await manager.installFromIex(file, 'official');

    expect(result).toEqual({ success: true, extensionId: 'pub.local' });
    // High-risk permissions were NOT auto-granted despite the 'official' request…
    expect(grantedFor('pub.local')).toEqual([]);
    // …so the user is asked.
    expect(win.webContents.send).toHaveBeenCalledWith(
      'extensions:permissionRequired',
      expect.objectContaining({
        extensionId: 'pub.local',
        requiredPermissions: ['filesystem:write', 'network'],
      }),
    );
  });

  it('rejects a local bundle with an entry that escapes the extraction directory', async () => {
    const zip = new AdmZip(bundleBytes('pub.slip'));
    zip.addFile('placeholder.js', Buffer.from('owned'));
    zip.getEntry('placeholder.js')!.entryName = '../../escaped.js';
    const file = path.join(workRoot, 'slip.iex');
    fs.writeFileSync(file, zip.toBuffer());

    const result = await manager.installFromIex(file, 'community');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/\.\." segment/);
    expect(fs.existsSync(path.join(workRoot, 'escaped.js'))).toBe(false);
    expect(fs.existsSync(path.join(h.tempDir, '..', 'escaped.js'))).toBe(false);
  });

  it('rejects a manifest whose "main" points outside the extension', async () => {
    const outside = path.join(workRoot, 'outside.js');
    fs.writeFileSync(outside, 'export function activate() {}');
    const file = path.join(workRoot, 'main-escape.iex');
    fs.writeFileSync(file, bundleBytes('pub.escape', { main: '../../outside.js' }));

    const result = await manager.installFromIex(file, 'community');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/"main" must be a relative path inside the extension/);
  });
});
