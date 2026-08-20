/**
 * useExtensionRuntime — contribution hydration tests.
 *
 * Extensions with `onStartup` activate during ExtensionManager.initialize(),
 * before the renderer's window contents load, so their
 * `extensions:contributionChanged` events are sent to a renderer that is not
 * listening yet and are lost. On mount the hook pulls a snapshot from
 * `extensions:getContributions` and replays it.
 *
 * The snapshot is an ExtHostContribution[] — byte-identical to the live
 * contributionChanged message shape.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useExtensionRuntime } from '../hooks/useExtensionRuntime';
import { useExtensionRuntimeStore } from '../stores/extensionRuntime.store';

type ContributionMsg = {
  type: 'contribution';
  extensionId: string;
  payload: { action: 'register' | 'unregister'; contributionType: string; data: unknown };
};

/** Snapshot entry in the confirmed main-process shape. */
function entry(
  extensionId: string,
  contributionType: string,
  data: unknown
): ContributionMsg {
  return { type: 'contribution', extensionId, payload: { action: 'register', contributionType, data } };
}

interface FakeApi {
  api: Record<string, unknown>;
  /** Fire a live contributionChanged event at the hook. */
  emitContribution: (msg: ContributionMsg) => void;
  resolveSnapshot: (entries: ContributionMsg[]) => void;
}

function installFakeElectronApi(options?: { deferSnapshot?: boolean }): FakeApi {
  let contributionListener: ((msg: ContributionMsg) => void) | undefined;
  let resolveDeferred: ((entries: ContributionMsg[]) => void) | undefined;

  const snapshotPromise = options?.deferSnapshot
    ? new Promise<ContributionMsg[]>((resolve) => {
        resolveDeferred = resolve;
      })
    : null;

  const api = {
    removeAllListeners: vi.fn(),
    onContributionChanged: (cb: (msg: ContributionMsg) => void) => {
      contributionListener = cb;
    },
    onStatusChanged: vi.fn(),
    onPermissionRequired: vi.fn(),
    onContributionIgnored: vi.fn(),
    onHostError: vi.fn(),
    getContributions: vi.fn(() => snapshotPromise ?? Promise.resolve([])),
    grantPermissions: vi.fn(),
    executeCommand: vi.fn(),
  };

  (window as unknown as { electronAPI: unknown }).electronAPI = { extensions: api };

  return {
    api,
    emitContribution: (msg) => contributionListener?.(msg),
    resolveSnapshot: (entries) => resolveDeferred?.(entries),
  };
}

function resetStore() {
  useExtensionRuntimeStore.setState({
    registeredTools: {},
    registeredCommands: {},
    registeredWorkflowNodes: {},
    registeredPanels: {},
    registeredStatusBarItems: {},
    registeredKeybindings: [],
    registeredMenuItems: [],
    activeExtensions: {},
  });
}

describe('useExtensionRuntime — contribution hydration', () => {
  beforeEach(() => {
    resetStore();
  });

  it('replays the snapshot into the store without transforming it', async () => {
    const fake = installFakeElectronApi();
    fake.api.getContributions = vi.fn(() =>
      Promise.resolve([
        entry('pub.a', 'command', { id: 'pub.a.hello', title: 'Say hello' }),
        entry('pub.a', 'tool', { id: 'pub.a.tool', name: 'Tool', category: 'ai' }),
        entry('pub.b', 'statusBarItem', { id: 'pub.b.statusbar', text: '42 items' }),
        entry('pub.b', 'panel', {
          id: 'pub.b.panel.1',
          title: 'Notes',
          location: 'sidebar',
          html: '<p>hi</p>',
        }),
      ])
    );

    renderHook(() => useExtensionRuntime());

    await waitFor(() => {
      expect(Object.keys(useExtensionRuntimeStore.getState().registeredCommands)).toHaveLength(1);
    });

    const state = useExtensionRuntimeStore.getState();
    expect(state.registeredCommands['pub.a.hello'].extensionId).toBe('pub.a');
    expect(state.registeredTools['pub.a.tool'].name).toBe('Tool');
    expect(state.registeredStatusBarItems['pub.b.statusbar'].text).toBe('42 items');

    // Panels must keep `html` — ExtensionRuntimeHost only renders panels that
    // carry inline HTML, so losing it would silently hide restored panels.
    const panel = state.registeredPanels['pub.b.panel.1'];
    expect(panel.html).toBe('<p>hi</p>');
    expect(panel.location).toBe('sidebar');
    expect(panel.extensionId).toBe('pub.b');
  });

  it('does not duplicate a contribution already delivered by a live event', async () => {
    const fake = installFakeElectronApi({ deferSnapshot: true });
    renderHook(() => useExtensionRuntime());

    const item = entry('pub.a', 'statusBarItem', { id: 'pub.a.statusbar', text: 'live' });

    // Live event arrives first, then the snapshot replays the same item.
    act(() => {
      fake.emitContribution(item);
    });
    act(() => {
      fake.resolveSnapshot([entry('pub.a', 'statusBarItem', { id: 'pub.a.statusbar', text: 'snapshot' })]);
    });

    await waitFor(() => {
      expect(useExtensionRuntimeStore.getState().registeredStatusBarItems['pub.a.statusbar'].text).toBe(
        'snapshot'
      );
    });

    // Keyed by id — replay overwrites rather than appending a second entry.
    expect(Object.keys(useExtensionRuntimeStore.getState().registeredStatusBarItems)).toHaveLength(1);
  });

  it('lets a live unregister win over a stale snapshot entry', async () => {
    const fake = installFakeElectronApi({ deferSnapshot: true });
    renderHook(() => useExtensionRuntime());

    // The extension unregisters the command while the snapshot request is
    // still in flight — the snapshot was captured before that happened.
    act(() => {
      fake.emitContribution({
        type: 'contribution',
        extensionId: 'pub.a',
        payload: { action: 'unregister', contributionType: 'command', data: { id: 'pub.a.gone' } },
      });
    });

    act(() => {
      fake.resolveSnapshot([
        entry('pub.a', 'command', { id: 'pub.a.gone', title: 'Stale' }),
        entry('pub.a', 'command', { id: 'pub.a.kept', title: 'Kept' }),
      ]);
    });

    await waitFor(() => {
      expect(useExtensionRuntimeStore.getState().registeredCommands['pub.a.kept']).toBeTruthy();
    });

    // The unregistered command must NOT be resurrected by the replay.
    expect(useExtensionRuntimeStore.getState().registeredCommands['pub.a.gone']).toBeUndefined();
  });

  it('degrades quietly when the snapshot handler is unavailable', async () => {
    const fake = installFakeElectronApi();
    fake.api.getContributions = vi.fn(() => Promise.reject(new Error('no handler registered')));

    renderHook(() => useExtensionRuntime());

    // Live events still work even though hydration failed.
    act(() => {
      fake.emitContribution(entry('pub.a', 'command', { id: 'pub.a.live', title: 'Live' }));
    });

    await waitFor(() => {
      expect(useExtensionRuntimeStore.getState().registeredCommands['pub.a.live']).toBeTruthy();
    });
  });
});
