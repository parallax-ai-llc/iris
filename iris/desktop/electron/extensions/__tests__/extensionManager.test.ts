// @vitest-environment node
// (Main-process code; also, adm-zip's `instanceof Uint8Array` checks break
// across the jsdom VM realm — reading any zip silently yields empty data.)
/**
 * Unit tests for electron/extensions/extensionManager.ts
 *
 * Electron (app), the ExtensionHost fork, and the iris.* API handler
 * registration are mocked; the filesystem side (install dirs, registry.json,
 * .iex extraction via adm-zip) is exercised for real inside os.tmpdir().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import type { BrowserWindow } from 'electron';
import type { ExtHostApiResponse, Permission, TrustTier } from '../ipcProtocol';

const h = vi.hoisted(() => ({
  userDataDir: '',
  tempDir: '',
  hostStartError: null as string | null,
  /** Injected mkdirSync failure, used to simulate the Windows delete-pending race. */
  mkdirFail: null as { path: string; code: string; remaining: number } | null,
}));

/**
 * Real fs, with a switch for making `mkdirSync` fail on one path. Spying on the
 * `fs` module object does not reach the manager's `import { mkdirSync }`
 * binding, so the injection has to live in the module mock.
 */
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const mkdirSync = ((dir: fs.PathLike, opts: unknown) => {
    const fail = h.mkdirFail;
    if (fail && String(dir) === fail.path && fail.remaining > 0) {
      fail.remaining--;
      const err = new Error(
        `${fail.code}: injected failure, mkdir '${String(dir)}'`,
      ) as NodeJS.ErrnoException;
      err.code = fail.code;
      throw err;
    }
    return actual.mkdirSync(dir, opts as fs.MakeDirectoryOptions);
  }) as typeof actual.mkdirSync;
  return { ...actual, mkdirSync, default: { ...actual, mkdirSync } };
});

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'temp' ? h.tempDir : h.userDataDir),
  },
  BrowserWindow: class {},
}));

vi.mock('../apiHandlers/index', () => ({
  registerAllApiHandlers: vi.fn(),
}));

vi.mock('../extensionHost', async () => {
  const { EventEmitter } = await import('events');
  class ExtensionHost extends EventEmitter {
    start = vi.fn(async () => {
      if (h.hostStartError) throw new Error(h.hostStartError);
    });
    stop = vi.fn(async () => {});
    activateExtension = vi.fn(async () => {});
    deactivateExtension = vi.fn(async () => {});
    sendMessage = vi.fn();
    executeCommand = vi.fn(async () => 'command-result');
    executeTool = vi.fn(async () => 'tool-result');
  }
  return { ExtensionHost };
});

import { ExtensionManager } from '../extensionManager';

interface MockHost {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  activateExtension: ReturnType<typeof vi.fn>;
  deactivateExtension: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  executeCommand: ReturnType<typeof vi.fn>;
  executeTool: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => boolean;
}

function getMockHost(manager: ExtensionManager): MockHost {
  return (manager as unknown as { extensionHost: MockHost }).extensionHost;
}

function makeFakeWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn(), isDestroyed: () => false },
  } as unknown as BrowserWindow & { webContents: { send: ReturnType<typeof vi.fn> } };
}

/**
 * Mimic Electron after the window is torn down: the object stays truthy,
 * `isDestroyed()` flips to true, and any send throws "Object has been
 * destroyed". Returns the send spy so a test can assert the guard
 * short-circuited BEFORE attempting delivery (not merely swallowed the throw).
 */
function destroyWindow(win: BrowserWindow): ReturnType<typeof vi.fn> {
  const send = vi.fn(() => {
    throw new TypeError('Object has been destroyed');
  });
  const target = win as unknown as {
    isDestroyed: () => boolean;
    webContents: { send: () => void; isDestroyed: () => boolean };
  };
  target.isDestroyed = () => true;
  target.webContents = { send, isDestroyed: () => true };
  return send;
}

/**
 * A window destroyed *between* the guard and the send: `isDestroyed()` still
 * reports false, but touching webContents.send throws. Covers the race the
 * try/catch exists for.
 */
function destroyWindowRacily(win: BrowserWindow): void {
  const target = win as unknown as {
    isDestroyed: () => boolean;
    webContents: { send: () => void; isDestroyed: () => boolean };
  };
  target.isDestroyed = () => false;
  target.webContents = {
    send: () => {
      throw new TypeError('Object has been destroyed');
    },
    isDestroyed: () => false,
  };
}

/** Write a minimal valid extension source directory and return its path. */
function makeExtensionSource(
  root: string,
  id: string,
  overrides: Record<string, unknown> = {},
  files: Record<string, string> = {},
): string {
  const dir = path.join(root, `src-${id}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'index.js'), 'export function activate() {}', 'utf-8');
  const manifest = {
    id,
    name: id.split('.')[1],
    version: '1.0.0',
    main: './dist/index.js',
    publisher: id.split('.')[0],
    activationEvents: ['onStartup'],
    permissions: [] as string[],
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, 'iris-extension.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, rel), content, 'utf-8');
  }
  return dir;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ExtensionManager', () => {
  let workRoot: string;
  let manager: ExtensionManager;
  let win: ReturnType<typeof makeFakeWindow>;

  beforeEach(async () => {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-extmgr-test-'));
    h.userDataDir = path.join(workRoot, 'userData');
    h.tempDir = path.join(workRoot, 'temp');
    fs.mkdirSync(h.userDataDir, { recursive: true });
    fs.mkdirSync(h.tempDir, { recursive: true });
    h.hostStartError = null;
    h.mkdirFail = null;

    manager = new ExtensionManager();
    win = makeFakeWindow();
    await manager.initialize(win);
  });

  afterEach(() => {
    fs.rmSync(workRoot, { recursive: true, force: true });
  });

  // ─── Install from directory ───

  it('installs a valid extension: copies files, writes registry, generates ESM package.json, activates onStartup', async () => {
    const src = makeExtensionSource(workRoot, 'pub.hello', {
      permissions: ['commands:register'],
    });

    const result = await manager.installFromDirectory(src, 'community');
    expect(result).toEqual({ success: true, extensionId: 'pub.hello' });

    const installDir = path.join(h.userDataDir, 'extensions', 'pub.hello');
    expect(fs.existsSync(path.join(installDir, 'iris-extension.json'))).toBe(true);
    expect(fs.existsSync(path.join(installDir, 'dist', 'index.js'))).toBe(true);

    // Install-dir package.json is generated so .js resolves as ESM
    const pkg = JSON.parse(fs.readFileSync(path.join(installDir, 'package.json'), 'utf-8'));
    expect(pkg.type).toBe('module');

    // Registry persisted
    const registry = JSON.parse(
      fs.readFileSync(path.join(h.userDataDir, 'extensions', 'registry.json'), 'utf-8'),
    );
    expect(registry.extensions).toHaveLength(1);
    expect(registry.extensions[0]).toMatchObject({
      id: 'pub.hello',
      enabled: true,
      trustTier: 'community',
      grantedPermissions: ['commands:register'],
    });

    // onStartup + all permissions auto-approved → activated through the host
    const host = getMockHost(manager);
    expect(host.activateExtension).toHaveBeenCalledWith('pub.hello', installDir, './dist/index.js');
    expect(manager.getExtensionStatus('pub.hello')?.status).toBe('active');
  });

  it('rejects an invalid manifest', async () => {
    const src = makeExtensionSource(workRoot, 'pub.broken', { version: 'not-semver' });
    const result = await manager.installFromDirectory(src);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid manifest');
  });

  it('rejects installing over an existing id without upgrade', async () => {
    const src = makeExtensionSource(workRoot, 'pub.dupe');
    await manager.installFromDirectory(src);

    const again = await manager.installFromDirectory(src);
    expect(again.success).toBe(false);
    expect(again.error).toContain('already installed');
  });

  it('upgrade: deactivates the running instance, replaces files, keeps user-granted permissions, re-activates', async () => {
    const host = getMockHost(manager);
    const v1 = makeExtensionSource(workRoot, 'pub.up', {
      version: '1.0.0',
      permissions: ['commands:register', 'network'],
    });

    // community tier: 'network' (high) needs approval → not activated yet
    await manager.installFromDirectory(v1, 'community');
    expect(manager.getExtensionStatus('pub.up')?.status).toBe('installed');
    expect(win.webContents.send).toHaveBeenCalledWith(
      'extensions:permissionRequired',
      expect.objectContaining({ extensionId: 'pub.up', requiredPermissions: ['network'] }),
    );

    // User grants → activated without restart
    await manager.grantPermissions('pub.up', ['network']);
    expect(manager.getExtensionStatus('pub.up')?.status).toBe('active');
    expect(host.activateExtension).toHaveBeenCalledTimes(1);

    // Upgrade to v2
    const v2 = makeExtensionSource(workRoot, 'pub.up', {
      version: '2.0.0',
      permissions: ['commands:register', 'network'],
    });
    const result = await manager.installFromDirectory(v2, 'community', { upgrade: true });
    expect(result.success).toBe(true);

    expect(host.deactivateExtension).toHaveBeenCalledWith('pub.up');
    const info = manager.getExtensionStatus('pub.up');
    expect(info?.manifest.version).toBe('2.0.0');
    // Previously user-granted 'network' survives the upgrade → re-activated
    expect(info?.grantedPermissions).toEqual(
      expect.arrayContaining(['commands:register', 'network']),
    );
    expect(info?.status).toBe('active');
    expect(host.activateExtension).toHaveBeenCalledTimes(2);
  });

  it('upgrade: retries the install-dir recreate while the OS still holds the old path (Windows EPERM)', async () => {
    const v1 = makeExtensionSource(workRoot, 'pub.eperm', { version: '1.0.0' });
    await manager.installFromDirectory(v1, 'community');

    // Windows keeps a just-deleted directory "delete pending" until the last
    // handle on its files is closed, so recreating it under the same name
    // fails with EPERM for a moment. That made every second reinstall of the
    // edit → upgrade developer loop fail until the retry.
    const v2 = makeExtensionSource(workRoot, 'pub.eperm', { version: '2.0.0' });
    const installDir = path.join(h.userDataDir, 'extensions', 'pub.eperm');
    h.mkdirFail = { path: installDir, code: 'EPERM', remaining: 2 };

    const result = await manager.installFromDirectory(v2, 'community', { upgrade: true });
    expect(result).toEqual({ success: true, extensionId: 'pub.eperm' });

    // The failures were really exercised, and the upgrade landed anyway.
    expect(h.mkdirFail.remaining).toBe(0);
    expect(manager.getExtensionStatus('pub.eperm')?.manifest.version).toBe('2.0.0');
    expect(fs.existsSync(path.join(installDir, 'dist', 'index.js'))).toBe(true);
  });

  it('upgrade: reports a non-transient install-dir failure instead of retrying it', async () => {
    const v1 = makeExtensionSource(workRoot, 'pub.nospace', { version: '1.0.0' });
    await manager.installFromDirectory(v1, 'community');

    const v2 = makeExtensionSource(workRoot, 'pub.nospace', { version: '2.0.0' });
    const installDir = path.join(h.userDataDir, 'extensions', 'pub.nospace');
    h.mkdirFail = { path: installDir, code: 'ENOSPC', remaining: Number.MAX_SAFE_INTEGER };

    const result = await manager.installFromDirectory(v2, 'community', { upgrade: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOSPC');
  });

  it('verified tier auto-approves medium-risk permissions (export:configure) and activates immediately', async () => {
    const src = makeExtensionSource(workRoot, 'pub.verified', {
      permissions: ['image:read', 'export:configure'],
    });
    const result = await manager.installFromDirectory(src, 'verified');
    expect(result.success).toBe(true);

    const info = manager.getExtensionStatus('pub.verified');
    expect(info?.grantedPermissions).toEqual(
      expect.arrayContaining(['image:read', 'export:configure']),
    );
    expect(info?.status).toBe('active');
    expect(win.webContents.send).not.toHaveBeenCalledWith(
      'extensions:permissionRequired',
      expect.anything(),
    );
  });

  // ─── ensureModulePackageJson ───

  it('adds "type": "module" to an existing package.json without one, preserving other fields', async () => {
    const src = makeExtensionSource(
      workRoot,
      'pub.pkgless-type',
      {},
      { 'package.json': JSON.stringify({ name: 'pkgless-type' }) },
    );
    await manager.installFromDirectory(src);

    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(h.userDataDir, 'extensions', 'pub.pkgless-type', 'package.json'),
        'utf-8',
      ),
    );
    expect(pkg).toEqual({ name: 'pkgless-type', type: 'module' });
  });

  it('respects an explicit "type" set by the extension author', async () => {
    const src = makeExtensionSource(
      workRoot,
      'pub.cjs',
      {},
      { 'package.json': JSON.stringify({ type: 'commonjs' }) },
    );
    await manager.installFromDirectory(src);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(h.userDataDir, 'extensions', 'pub.cjs', 'package.json'), 'utf-8'),
    );
    expect(pkg.type).toBe('commonjs');
  });

  // ─── Copy exclusions (scaffolded projects carry node_modules/.git) ───

  it('skips node_modules/.git and other dev artifacts while keeping dist and the manifest entry', async () => {
    const src = makeExtensionSource(workRoot, 'pub.scaffold');
    fs.mkdirSync(path.join(src, 'node_modules', 'esbuild'), { recursive: true });
    fs.writeFileSync(path.join(src, 'node_modules', 'esbuild', 'huge.js'), 'x'.repeat(1024), 'utf-8');
    fs.mkdirSync(path.join(src, '.git', 'objects'), { recursive: true });
    fs.writeFileSync(path.join(src, '.git', 'HEAD'), 'ref: refs/heads/main', 'utf-8');
    fs.mkdirSync(path.join(src, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(src, '.vscode', 'settings.json'), '{}', 'utf-8');
    fs.mkdirSync(path.join(src, 'src'), { recursive: true });
    fs.writeFileSync(path.join(src, 'src', 'index.ts'), 'export function activate() {}', 'utf-8');
    fs.writeFileSync(path.join(src, 'pnpm-lock.yaml'), 'lockfileVersion: 9', 'utf-8');
    fs.writeFileSync(path.join(src, '.gitignore'), 'node_modules', 'utf-8');

    const result = await manager.installFromDirectory(src, 'community');
    expect(result.success).toBe(true);

    const installDir = path.join(h.userDataDir, 'extensions', 'pub.scaffold');
    expect(fs.existsSync(path.join(installDir, 'node_modules'))).toBe(false);
    expect(fs.existsSync(path.join(installDir, '.git'))).toBe(false);
    expect(fs.existsSync(path.join(installDir, '.vscode'))).toBe(false);
    expect(fs.existsSync(path.join(installDir, 'pnpm-lock.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(installDir, '.gitignore'))).toBe(false);

    // Entry point, build output, manifest and ordinary sources survive
    expect(fs.existsSync(path.join(installDir, 'dist', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(installDir, 'iris-extension.json'))).toBe(true);
    expect(fs.existsSync(path.join(installDir, 'src', 'index.ts'))).toBe(true);
  });

  // ─── Runtime contribution snapshot (re-hydration after a renderer reload) ───

  it('getContributions returns replayable register messages and drops unregistered ones', async () => {
    const src = makeExtensionSource(workRoot, 'pub.contrib');
    await manager.installFromDirectory(src, 'community');
    const host = getMockHost(manager);

    const statusItem = {
      type: 'contribution',
      extensionId: 'pub.contrib',
      payload: {
        action: 'register',
        contributionType: 'statusBarItem',
        data: { id: 'pub.contrib.statusbar.1', text: 'Timer: 00:00' },
      },
    };
    host.emit('contribution', statusItem);
    host.emit('contribution', {
      type: 'contribution',
      extensionId: 'pub.contrib',
      payload: {
        action: 'register',
        contributionType: 'command',
        data: { id: 'pub.contrib.hello', title: 'Hello' },
      },
    });

    expect(manager.getContributions()).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ action: 'register', contributionType: 'statusBarItem' }) }),
      expect.objectContaining({ payload: expect.objectContaining({ action: 'register', contributionType: 'command' }) }),
    ]);

    // Unregister removes just that entry
    host.emit('contribution', {
      type: 'contribution',
      extensionId: 'pub.contrib',
      payload: {
        action: 'unregister',
        contributionType: 'statusBarItem',
        data: { id: 'pub.contrib.statusbar.1' },
      },
    });
    expect(manager.getContributions()).toHaveLength(1);
    expect(manager.getContributions()[0].payload.contributionType).toBe('command');
  });

  it('getContributions never exposes workflowNode contributions', async () => {
    const host = getMockHost(manager);
    host.emit('contribution', {
      type: 'contribution',
      extensionId: 'pub.wf',
      payload: { action: 'register', contributionType: 'workflowNode', data: { id: 'n1' } },
    });
    expect(manager.getContributions()).toHaveLength(0);
  });

  it('deactivating and uninstalling clear the extension contributions', async () => {
    const src = makeExtensionSource(workRoot, 'pub.clear');
    await manager.installFromDirectory(src, 'community');
    const host = getMockHost(manager);

    host.emit('contribution', {
      type: 'contribution',
      extensionId: 'pub.clear',
      payload: { action: 'register', contributionType: 'tool', data: { id: 'pub.clear.tool' } },
    });
    expect(manager.getContributions()).toHaveLength(1);

    await manager.disableExtension('pub.clear'); // deactivates
    expect(manager.getContributions()).toHaveLength(0);

    await manager.uninstallExtension('pub.clear');
    expect(manager.getContributions()).toHaveLength(0);
  });

  it('enriches a runtime command contribution with the manifest title (no raw-id fallback)', async () => {
    const src = makeExtensionSource(workRoot, 'pub.titled', {
      permissions: ['commands:register'],
      contributes: {
        commands: [{ command: 'pub.titled.hello', title: 'Say Hello', icon: 'wave', category: 'Demo' }],
      },
    });
    await manager.installFromDirectory(src, 'community');
    const host = getMockHost(manager);

    // The worker only knows the id — iris.commands.register(id, handler)
    host.emit('contribution', {
      type: 'contribution',
      extensionId: 'pub.titled',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.titled.hello' } },
    });

    const expected = expect.objectContaining({
      payload: expect.objectContaining({
        data: { id: 'pub.titled.hello', title: 'Say Hello', icon: 'wave', category: 'Demo' },
      }),
    });
    expect(win.webContents.send).toHaveBeenCalledWith('extensions:contributionChanged', expected);
    expect(manager.getContributions()[0]).toEqual(expected);
  });

  it('runtime-supplied metadata wins over the manifest declaration', async () => {
    const src = makeExtensionSource(workRoot, 'pub.override', {
      permissions: ['tools:register'],
      contributes: {
        tools: [{ id: 'pub.override.t', name: 'Manifest Name', category: 'a', icon: 'i', description: 'd' }],
      },
    });
    await manager.installFromDirectory(src, 'community');
    const host = getMockHost(manager);

    host.emit('contribution', {
      type: 'contribution',
      extensionId: 'pub.override',
      payload: {
        action: 'register',
        contributionType: 'tool',
        data: { id: 'pub.override.t', name: 'Runtime Name', category: 'b' },
      },
    });

    expect(manager.getContributions()[0].payload.data).toEqual({
      id: 'pub.override.t',
      name: 'Runtime Name',
      category: 'b',
      icon: 'i',
      description: 'd',
    });
  });

  it('leaves a contribution untouched when the manifest declares nothing for it', async () => {
    const src = makeExtensionSource(workRoot, 'pub.undeclared');
    await manager.installFromDirectory(src, 'community');
    const host = getMockHost(manager);

    host.emit('contribution', {
      type: 'contribution',
      extensionId: 'pub.undeclared',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.undeclared.x' } },
    });

    expect(manager.getContributions()[0].payload.data).toEqual({ id: 'pub.undeclared.x' });
  });

  it('dismissPanel removes a closed panel so it is not resurrected by the snapshot', () => {
    manager.recordContribution({
      type: 'contribution',
      extensionId: 'pub.dismiss',
      payload: {
        action: 'register',
        contributionType: 'panel',
        data: { id: 'pub.dismiss.panel.1', title: 'P', location: 'sidebar', html: '' },
      },
    });
    expect(manager.getContributions()).toHaveLength(1);

    expect(manager.dismissPanel('pub.dismiss.panel.1')).toEqual({ success: true });
    expect(manager.getContributions()).toHaveLength(0);

    // Unknown panel id → no-op
    expect(manager.dismissPanel('pub.dismiss.panel.1')).toEqual({ success: false });
  });

  it('dismissPanel does not touch non-panel contributions with the same id', () => {
    manager.recordContribution({
      type: 'contribution',
      extensionId: 'pub.same',
      payload: { action: 'register', contributionType: 'command', data: { id: 'shared-id' } },
    });
    expect(manager.dismissPanel('shared-id')).toEqual({ success: false });
    expect(manager.getContributions()).toHaveLength(1);
  });

  // ─── Stale registry entries (directory deleted outside the app) ───

  it('drops registry entries whose install directory vanished, and allows a clean re-install', async () => {
    const src = makeExtensionSource(workRoot, 'pub.ghost');
    await manager.installFromDirectory(src, 'community');
    const installDir = path.join(h.userDataDir, 'extensions', 'pub.ghost');

    // Someone deletes the directory outside the app
    fs.rmSync(installDir, { recursive: true, force: true });

    const restarted = new ExtensionManager();
    const restartedWin = makeFakeWindow();
    await restarted.initialize(restartedWin);

    expect(restarted.getInstalledExtensions()).toHaveLength(0);
    expect(restarted.getExtensionStatus('pub.ghost')).toBeNull();
    expect(restartedWin.webContents.send).toHaveBeenCalledWith('extensions:registryPruned', {
      extensionIds: ['pub.ghost'],
    });
    // Pruned from disk too
    const registry = JSON.parse(
      fs.readFileSync(path.join(h.userDataDir, 'extensions', 'registry.json'), 'utf-8'),
    );
    expect(registry.extensions).toHaveLength(0);

    // Re-install works without an upgrade flag
    const again = await restarted.installFromDirectory(src, 'community');
    expect(again).toEqual({ success: true, extensionId: 'pub.ghost' });
  });

  it('keeps a record whose files exist but fail validation, and lets a plain re-install repair it', async () => {
    const src = makeExtensionSource(workRoot, 'pub.corrupt', { permissions: ['commands:register'] });
    await manager.installFromDirectory(src, 'community');
    const installDir = path.join(h.userDataDir, 'extensions', 'pub.corrupt');

    // Corrupt the installed manifest (files and granted permissions survive)
    fs.writeFileSync(path.join(installDir, 'iris-extension.json'), '{ not json', 'utf-8');

    const restarted = new ExtensionManager();
    await restarted.initialize(makeFakeWindow());

    const registry = JSON.parse(
      fs.readFileSync(path.join(h.userDataDir, 'extensions', 'registry.json'), 'utf-8'),
    );
    expect(registry.extensions).toHaveLength(1);
    expect(registry.extensions[0].grantedPermissions).toContain('commands:register');

    // Re-installing over the broken entry repairs it — no "already installed"
    const repaired = await restarted.installFromDirectory(src, 'community');
    expect(repaired).toEqual({ success: true, extensionId: 'pub.corrupt' });
    expect(restarted.getExtensionStatus('pub.corrupt')?.status).toBe('active');
  });

  it('recordContribution captures panels created through the window API', () => {
    manager.recordContribution({
      type: 'contribution',
      extensionId: 'pub.panel',
      payload: {
        action: 'register',
        contributionType: 'panel',
        data: { id: 'pub.panel.panel.1', title: 'My Panel', location: 'sidebar', html: '<b>hi</b>' },
      },
    });

    const snapshot = manager.getContributions();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      extensionId: 'pub.panel',
      payload: { action: 'register', contributionType: 'panel' },
    });
  });

  // ─── workflowNodes policy (v1 non-goal: install allowed, contribution ignored) ───

  it('installs a workflowNodes manifest but reports the contribution as ignored', async () => {
    const src = makeExtensionSource(workRoot, 'pub.nodes', {
      permissions: ['workflow:register'],
      contributes: {
        workflowNodes: [{ id: 'n1', name: 'Node', category: 'custom', inputs: [], outputs: [] }],
      },
    });

    const result = await manager.installFromDirectory(src, 'community');
    expect(result.success).toBe(true);
    expect(win.webContents.send).toHaveBeenCalledWith(
      'extensions:contributionIgnored',
      expect.objectContaining({ extensionId: 'pub.nodes', contributionType: 'workflowNode' }),
    );
  });

  it('drops runtime workflowNode contributions from the host and forwards the rest', async () => {
    const host = getMockHost(manager);

    host.emit('contribution', {
      type: 'contribution',
      extensionId: 'pub.any',
      payload: { action: 'register', contributionType: 'workflowNode', data: {} },
    });
    expect(win.webContents.send).toHaveBeenCalledWith(
      'extensions:contributionIgnored',
      expect.objectContaining({ extensionId: 'pub.any', contributionType: 'workflowNode' }),
    );
    expect(win.webContents.send).not.toHaveBeenCalledWith(
      'extensions:contributionChanged',
      expect.anything(),
    );

    const commandMsg = {
      type: 'contribution',
      extensionId: 'pub.any',
      payload: { action: 'register', contributionType: 'command', data: { command: 'pub.any.go' } },
    };
    host.emit('contribution', commandMsg);
    expect(win.webContents.send).toHaveBeenCalledWith('extensions:contributionChanged', commandMsg);
  });

  // ─── Install from .iex bundle ───

  it('installs from a .iex bundle with the manifest at the zip root', async () => {
    const src = makeExtensionSource(workRoot, 'pub.zipped');
    const zip = new AdmZip();
    zip.addLocalFolder(src);
    const iexPath = path.join(workRoot, 'zipped.iex');
    zip.writeZip(iexPath);

    const result = await manager.installFromIex(iexPath, 'community');
    expect(result).toEqual({ success: true, extensionId: 'pub.zipped' });
    expect(
      fs.existsSync(path.join(h.userDataDir, 'extensions', 'pub.zipped', 'dist', 'index.js')),
    ).toBe(true);
  });

  it('installs from a .iex bundle with a single top-level directory', async () => {
    const src = makeExtensionSource(workRoot, 'pub.nested');
    const zip = new AdmZip();
    zip.addLocalFolder(src, 'my-extension');
    const iexPath = path.join(workRoot, 'nested.iex');
    zip.writeZip(iexPath);

    const result = await manager.installFromIex(iexPath);
    expect(result).toEqual({ success: true, extensionId: 'pub.nested' });
  });

  it('rejects a bundle without iris-extension.json', async () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('hello'));
    const iexPath = path.join(workRoot, 'empty.iex');
    zip.writeZip(iexPath);

    const result = await manager.installFromIex(iexPath);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Bundle does not contain iris-extension.json');
  });

  it('rejects a nonexistent local bundle path', async () => {
    const result = await manager.installFromIex(path.join(workRoot, 'missing.iex'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Bundle not found');
  });

  // ─── Activation events ───

  it('activateByEvent matches wildcard activation events (onCommand:*)', async () => {
    const src = makeExtensionSource(workRoot, 'pub.wild', {
      activationEvents: ['onCommand:*'],
    });
    await manager.installFromDirectory(src, 'community');
    // No onStartup → stays installed
    expect(manager.getExtensionStatus('pub.wild')?.status).toBe('installed');

    await manager.activateByEvent('onCommand:pub.wild.anything');
    expect(manager.getExtensionStatus('pub.wild')?.status).toBe('active');
  });

  it('activateByEvent does not activate on non-matching events', async () => {
    const src = makeExtensionSource(workRoot, 'pub.exact', {
      activationEvents: ['onTool:pub.exact.tool'],
    });
    await manager.installFromDirectory(src, 'community');

    await manager.activateByEvent('onTool:someone.else');
    expect(manager.getExtensionStatus('pub.exact')?.status).toBe('installed');

    await manager.activateByEvent('onTool:pub.exact.tool');
    expect(manager.getExtensionStatus('pub.exact')?.status).toBe('active');
  });

  // ─── Enable / disable / uninstall ───

  it('disable deactivates a running extension; enable re-activates onStartup extensions', async () => {
    const host = getMockHost(manager);
    const src = makeExtensionSource(workRoot, 'pub.toggle');
    await manager.installFromDirectory(src, 'community');
    expect(manager.getExtensionStatus('pub.toggle')?.status).toBe('active');

    await manager.disableExtension('pub.toggle');
    expect(host.deactivateExtension).toHaveBeenCalledWith('pub.toggle');
    expect(manager.getExtensionStatus('pub.toggle')?.status).toBe('disabled');

    // Disabled extensions are skipped by activation events
    await manager.activateByEvent('onStartup');
    expect(manager.getExtensionStatus('pub.toggle')?.status).toBe('disabled');

    await manager.enableExtension('pub.toggle');
    expect(manager.getExtensionStatus('pub.toggle')?.status).toBe('active');
  });

  it('uninstall removes files, registry entry, and status', async () => {
    const src = makeExtensionSource(workRoot, 'pub.gone');
    await manager.installFromDirectory(src, 'community');

    const installDir = path.join(h.userDataDir, 'extensions', 'pub.gone');
    expect(fs.existsSync(installDir)).toBe(true);

    const result = await manager.uninstallExtension('pub.gone');
    expect(result.success).toBe(true);
    expect(fs.existsSync(installDir)).toBe(false);
    expect(manager.getExtensionStatus('pub.gone')).toBeNull();
    expect(manager.getInstalledExtensions()).toHaveLength(0);
  });

  // ─── Command / tool execution ───

  it('executeCommand activates by onCommand event and delegates to the host', async () => {
    const src = makeExtensionSource(workRoot, 'pub.cmd', {
      activationEvents: ['onCommand:pub.cmd.run'],
    });
    await manager.installFromDirectory(src, 'community');

    const host = getMockHost(manager);
    const result = await manager.executeCommand('pub.cmd.run', ['a', 1]);
    expect(result).toBe('command-result');
    expect(host.executeCommand).toHaveBeenCalledWith('pub.cmd.run', ['a', 1]);
    expect(manager.getExtensionStatus('pub.cmd')?.status).toBe('active');
  });

  it('executeCommand throws when the host is not running', async () => {
    const bare = new ExtensionManager();
    await expect(bare.executeCommand('any.cmd')).rejects.toThrow('Extension host not running');
  });

  // ─── iris.* API call routing (permission enforcement at the manager) ───

  async function lastApiResponse(host: MockHost): Promise<ExtHostApiResponse> {
    await flushAsync();
    const calls = host.sendMessage.mock.calls.filter(
      (c) => (c[0] as ExtHostApiResponse).type === 'api-response',
    );
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][0] as ExtHostApiResponse;
  }

  it('routes an api-call to a registered handler and responds with the result', async () => {
    const src = makeExtensionSource(workRoot, 'pub.api');
    await manager.installFromDirectory(src, 'community');

    const handler = vi.fn(async (_extId: string, args: unknown[]) => `shown:${args[0]}`);
    manager.registerApiHandler('iris.window', 'showMessage', handler);

    const host = getMockHost(manager);
    host.emit('api-call', {
      type: 'api-call',
      requestId: 'r1',
      extensionId: 'pub.api',
      payload: { namespace: 'iris.window', method: 'showMessage', args: ['hi'] },
    });

    const response = await lastApiResponse(host);
    expect(handler).toHaveBeenCalledWith('pub.api', ['hi']);
    expect(response.payload).toEqual({ result: 'shown:hi' });
  });

  it('denies an api-call when the permission was not granted', async () => {
    const src = makeExtensionSource(workRoot, 'pub.nogrant', {
      permissions: ['network'],
    });
    await manager.installFromDirectory(src, 'community'); // network stays ungranted

    manager.registerApiHandler('iris.network', 'fetch', vi.fn(async () => 'should-not-run'));

    const host = getMockHost(manager);
    host.emit('api-call', {
      type: 'api-call',
      requestId: 'r2',
      extensionId: 'pub.nogrant',
      payload: { namespace: 'iris.network', method: 'fetch', args: [] },
    });

    const response = await lastApiResponse(host);
    expect(response.payload.error?.code).toBe('PERMISSION_DENIED');
    expect(response.payload.error?.message).toContain('network');
  });

  it('responds EXTENSION_NOT_FOUND for an unknown extension id', async () => {
    const host = getMockHost(manager);
    host.emit('api-call', {
      type: 'api-call',
      requestId: 'r3',
      extensionId: 'ghost.ext',
      payload: { namespace: 'iris.window', method: 'showMessage', args: [] },
    });

    const response = await lastApiResponse(host);
    expect(response.payload.error?.code).toBe('EXTENSION_NOT_FOUND');
  });

  it('responds API_NOT_FOUND when no handler is registered for an allowed API', async () => {
    const src = makeExtensionSource(workRoot, 'pub.nohandler', {
      permissions: ['commands:register'],
    });
    await manager.installFromDirectory(src, 'community');

    const host = getMockHost(manager);
    host.emit('api-call', {
      type: 'api-call',
      requestId: 'r4',
      extensionId: 'pub.nohandler',
      payload: { namespace: 'iris.commands', method: 'register', args: ['pub.nohandler.x'] },
    });

    const response = await lastApiResponse(host);
    expect(response.payload.error?.code).toBe('API_NOT_FOUND');
  });

  // ─── Host start failure is not hidden ───

  it('initialize propagates a host start failure and notifies the renderer', async () => {
    h.hostStartError = 'host exploded';
    const failingManager = new ExtensionManager();
    const failingWin = makeFakeWindow();

    await expect(failingManager.initialize(failingWin)).rejects.toThrow('host exploded');
    expect(failingWin.webContents.send).toHaveBeenCalledWith('extensions:hostError', {
      error: 'host exploded',
    });
  });

  // ─── Destroyed window (app teardown) ───

  it('shutdown completes when the window was already destroyed', async () => {
    const src = makeExtensionSource(workRoot, 'pub.teardown');
    await manager.installFromDirectory(src, 'community');
    expect(manager.getExtensionStatus('pub.teardown')?.status).toBe('active');

    // The BrowserWindow is destroyed before the app finishes quitting.
    // emitStatusChanged → deactivateExtension → shutdown() previously threw
    // "Object has been destroyed" here and aborted teardown.
    const deadSend = destroyWindow(win);

    // Captured before shutdown() clears the reference
    const host = getMockHost(manager);
    await expect(manager.shutdown()).resolves.toBeUndefined();

    expect(host.deactivateExtension).toHaveBeenCalledWith('pub.teardown');
    expect(host.stop).toHaveBeenCalled();
    // The isDestroyed guard must short-circuit before the send is attempted —
    // asserting "did not throw" alone would also pass with only a try/catch.
    expect(deadSend).not.toHaveBeenCalled();
  });

  it('survives a window destroyed between the guard and the send', async () => {
    const src = makeExtensionSource(workRoot, 'pub.race');
    await manager.installFromDirectory(src, 'community');

    destroyWindowRacily(win);

    // isDestroyed() still lies about being alive, so the send is attempted and
    // throws — the try/catch has to absorb it.
    await expect(manager.shutdown()).resolves.toBeUndefined();
  });

  it('status changes and contribution events are silently dropped after the window is destroyed', async () => {
    const src = makeExtensionSource(workRoot, 'pub.silent');
    await manager.installFromDirectory(src, 'community');
    destroyWindow(win);

    const host = getMockHost(manager);
    expect(() =>
      host.emit('contribution', {
        type: 'contribution',
        extensionId: 'pub.silent',
        payload: { action: 'register', contributionType: 'command', data: { id: 'pub.silent.go' } },
      }),
    ).not.toThrow();
    // The snapshot is still maintained for a future window
    expect(manager.getContributions()).toHaveLength(1);

    await expect(manager.disableExtension('pub.silent')).resolves.toEqual({ success: true });
    await expect(manager.enableExtension('pub.silent')).resolves.toEqual({ success: true });
    await expect(manager.uninstallExtension('pub.silent')).resolves.toEqual({ success: true });
  });

  it('an extension that fails to deactivate does not abort shutdown of the others', async () => {
    await manager.installFromDirectory(makeExtensionSource(workRoot, 'pub.first'), 'community');
    await manager.installFromDirectory(makeExtensionSource(workRoot, 'pub.second'), 'community');

    const host = getMockHost(manager);
    host.deactivateExtension.mockImplementation(async (id: string) => {
      if (id === 'pub.first') throw new Error('worker is wedged');
    });

    await expect(manager.shutdown()).resolves.toBeUndefined();

    expect(host.deactivateExtension).toHaveBeenCalledWith('pub.first');
    expect(host.deactivateExtension).toHaveBeenCalledWith('pub.second');
    expect(host.stop).toHaveBeenCalled();
  });

  it('shutdown still clears the host when stopping it throws', async () => {
    const host = getMockHost(manager);
    host.stop.mockRejectedValueOnce(new Error('stop exploded'));

    await expect(manager.shutdown()).resolves.toBeUndefined();
    expect((manager as unknown as { extensionHost: unknown }).extensionHost).toBeNull();
  });

  // ─── Persistence across manager instances ───

  it('a second manager instance re-loads the registry and manifests from disk', async () => {
    const src = makeExtensionSource(workRoot, 'pub.persist', {
      activationEvents: ['onCommand:pub.persist.go'],
      permissions: ['commands:register'] as Permission[],
    });
    await manager.installFromDirectory(src, 'verified' as TrustTier);

    const second = new ExtensionManager();
    await second.initialize(makeFakeWindow());

    const info = second.getExtensionStatus('pub.persist');
    expect(info).not.toBeNull();
    expect(info?.trustTier).toBe('verified');
    expect(info?.status).toBe('installed');
    expect(info?.grantedPermissions).toContain('commands:register');
  });
});
