/**
 * InstalledExtensionsSection — per-extension enable/disable switch.
 *
 * The switch reflects the runtime status (anything but 'disabled' counts as on),
 * calls the existing `extensions:enable` / `extensions:disable` IPC, re-reads
 * the installed list, and keeps the command chips in step (a disabled
 * extension's chips are inert).
 */
import '@/shared/lib/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InstalledExtensionsSection } from '../InstalledExtensionsSection';
import type { ExtensionRuntimeInfoData } from '@/types/electron';

let status = 'active';

const info = (): ExtensionRuntimeInfoData => ({
  id: 'pub.toggle',
  status,
  installPath: '/x',
  trustTier: 'community',
  grantedPermissions: [],
  manifest: {
    id: 'pub.toggle',
    name: 'toggle',
    displayName: 'Toggle Ext',
    contributes: { commands: [{ command: 'pub.toggle.hello', title: 'Say hello' }] },
  } as unknown as ExtensionRuntimeInfoData['manifest'],
});

const api = {
  getInstalled: vi.fn(async () => [info()]),
  enable: vi.fn(async () => {
    status = 'active';
    return { success: true };
  }),
  disable: vi.fn(async () => {
    status = 'disabled';
    return { success: true };
  }),
  executeCommand: vi.fn(),
  executeTool: vi.fn(),
};

beforeEach(() => {
  status = 'active';
  vi.clearAllMocks();
  (window as unknown as { electronAPI: unknown }).electronAPI = { extensions: api };
});
afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('InstalledExtensionsSection enable switch', () => {
  it('shows a checked switch for an active extension and turns it off through IPC', async () => {
    render(<InstalledExtensionsSection />);
    const sw = await screen.findByRole('switch', { name: /Toggle Ext/ });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /Say hello/ })).toBeEnabled();

    fireEvent.click(sw);
    await waitFor(() => expect(api.disable).toHaveBeenCalledWith('pub.toggle'));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Toggle Ext/ })).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByRole('button', { name: /Say hello/ })).toBeDisabled();
    expect(api.enable).not.toHaveBeenCalled();
  });

  it('turns a disabled extension back on', async () => {
    status = 'disabled';
    render(<InstalledExtensionsSection />);
    const sw = await screen.findByRole('switch', { name: /Toggle Ext/ });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: /Say hello/ })).toBeDisabled();

    fireEvent.click(sw);
    await waitFor(() => expect(api.enable).toHaveBeenCalledWith('pub.toggle'));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Toggle Ext/ })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('button', { name: /Say hello/ })).toBeEnabled();
  });

  it('keeps the previous state and does not flip when the IPC call fails', async () => {
    api.disable.mockResolvedValueOnce({ success: false });
    render(<InstalledExtensionsSection />);
    const sw = await screen.findByRole('switch', { name: /Toggle Ext/ });
    fireEvent.click(sw);
    await waitFor(() => expect(api.disable).toHaveBeenCalled());
    await waitFor(() => expect(sw).not.toBeDisabled());
    expect(screen.getByRole('switch', { name: /Toggle Ext/ })).toHaveAttribute('aria-checked', 'true');
  });
});
