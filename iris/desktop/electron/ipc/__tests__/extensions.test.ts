// @vitest-environment node
/**
 * electron/ipc/extensions.ts — the renderer cannot raise the trust tier of code
 * that was never reviewed, and the server-issued bundle hash reaches main.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
  },
  BrowserWindow: class {},
}));

import { setupExtensionHandlers } from '../extensions';
import type { ExtensionManager } from '../../extensions/extensionManager';

const manager = {
  installFromDirectory: vi.fn(async () => ({ success: true })),
  installFromIex: vi.fn(async () => ({ success: true })),
};

const invoke = (channel: string, ...args: unknown[]) =>
  handlers.get(channel)!({ sender: {} }, ...args);

describe('extension install IPC', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    setupExtensionHandlers(manager as unknown as ExtensionManager);
  });

  it.each(['official', 'verified', 'community', undefined])(
    'installs a local directory as community even when the renderer asks for %s',
    async (tier) => {
      await invoke('extensions:install', '/dev/my-ext', tier, { upgrade: true });
      expect(manager.installFromDirectory).toHaveBeenCalledWith('/dev/my-ext', 'community', {
        upgrade: true,
      });
    },
  );

  it('forwards the server-issued sha256 for a marketplace install', async () => {
    const sha = 'a'.repeat(64);
    await invoke('extensions:installFromIex', 'https://example/x.iex', 'official', { sha256: sha });
    expect(manager.installFromIex).toHaveBeenCalledWith('https://example/x.iex', 'official', {
      upgrade: false,
      sha256: sha,
    });
  });

  it('drops a non-string sha256 instead of passing it through', async () => {
    await invoke('extensions:installFromIex', 'https://example/x.iex', 'bogus-tier', {
      sha256: { toString: () => 'a'.repeat(64) },
    });
    expect(manager.installFromIex).toHaveBeenCalledWith('https://example/x.iex', 'community', {
      upgrade: false,
      sha256: undefined,
    });
  });
});
