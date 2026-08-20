// @vitest-environment node
/**
 * Unit tests for electron/extensions/extensionHost.ts
 *
 * The forked host process is replaced with an in-memory EventEmitter, injected
 * where start() would normally assign the ChildProcess. This exercises the
 * message protocol (activate/deactivate lifecycle, api-call round trips) that
 * runs between the Main Process and the extension host.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { ExtensionHost } from '../extensionHost';
import type { ExtHostMessage } from '../ipcProtocol';

class FakeHostProcess extends EventEmitter {
  send = vi.fn();
  kill = vi.fn();
  stdout = null;
  stderr = null;
  /** Mirrors ChildProcess.connected — false once the IPC channel is closed. */
  connected = true;
}

/**
 * Create an ExtensionHost with an injected fake process, replicating the
 * message wiring start() performs (start() itself requires the built
 * extensionHostProcess.mjs artifact, which does not exist next to the sources).
 */
function createHostWithFakeProcess() {
  const host = new ExtensionHost();
  const proc = new FakeHostProcess();
  const internal = host as unknown as {
    process: FakeHostProcess;
    handleMessage: (msg: ExtHostMessage) => void;
  };
  internal.process = proc;
  proc.on('message', (msg: ExtHostMessage) => internal.handleMessage(msg));
  return { host, proc };
}

function lastSent(proc: FakeHostProcess): ExtHostMessage {
  const calls = proc.send.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as ExtHostMessage;
}

/**
 * The generation token the host minted for the most recent 'activate' request.
 * The real host process echoes it on every lifecycle message the worker it
 * spawned emits; these tests stand in for that echo.
 */
function generationOf(proc: FakeHostProcess): string {
  const activate = proc.send.mock.calls
    .map((c) => c[0] as ExtHostMessage)
    .reverse()
    .find((m) => m?.type === 'lifecycle' && m?.payload?.action === 'activate');
  const generation = (activate as { payload?: { generation?: string } } | undefined)?.payload?.generation;
  expect(generation).toEqual(expect.any(String));
  return generation as string;
}

describe('ExtensionHost.start — missing build artifact', () => {
  it('fails loudly when extensionHostProcess.mjs was not built (no silent skip)', async () => {
    const host = new ExtensionHost();
    await expect(host.start()).rejects.toThrow(/extensionHostProcess\.mjs not found/);
  });
});

describe('ExtensionHost.sendMessage', () => {
  it('does not throw when the process is not running', () => {
    const host = new ExtensionHost();
    expect(() =>
      host.sendMessage({
        type: 'lifecycle',
        extensionId: 'pub.ext',
        payload: { action: 'deactivate' },
      }),
    ).not.toThrow();
  });

  it('forwards messages to the host process', () => {
    const { host, proc } = createHostWithFakeProcess();
    const msg: ExtHostMessage = {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'deactivate' },
    };
    host.sendMessage(msg);
    expect(proc.send).toHaveBeenCalledWith(msg);
  });

  it('does not write to a closed IPC channel (EPIPE guard)', () => {
    const { host, proc } = createHostWithFakeProcess();
    proc.connected = false;

    expect(() =>
      host.sendMessage({
        type: 'lifecycle',
        extensionId: 'pub.ext',
        payload: { action: 'deactivate' },
      }),
    ).not.toThrow();
    expect(proc.send).not.toHaveBeenCalled();
  });
});

describe('ExtensionHost.activateExtension — lifecycle protocol', () => {
  it('sends an activate lifecycle message and resolves when the host reports "activated"', async () => {
    const { host, proc } = createHostWithFakeProcess();
    const promise = host.activateExtension('pub.ext', '/install/pub.ext', './dist/index.js');

    expect(lastSent(proc)).toMatchObject({
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: {
        action: 'activate',
        installPath: '/install/pub.ext',
        mainFile: './dist/index.js',
      },
    });

    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'activated', generation: generationOf(proc) },
    });

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects when the host reports "error"', async () => {
    const { host, proc } = createHostWithFakeProcess();
    const promise = host.activateExtension('pub.ext', '/install/pub.ext', './dist/index.js');

    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'error', error: 'entry file exploded', generation: generationOf(proc) },
    });

    await expect(promise).rejects.toThrow('entry file exploded');
  });

  it('regression: non-terminal messages do not tear down the listener (no hang)', async () => {
    const { host, proc } = createHostWithFakeProcess();
    let settled = false;
    const promise = host
      .activateExtension('pub.ext', '/install/pub.ext', './dist/index.js')
      .finally(() => {
        settled = true;
      });

    // Noise that previously removed the lifecycle listener and made the
    // promise hang until the 30s timeout: an echo of the 'activate' action,
    // a lifecycle message for another extension, and a non-lifecycle message.
    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'activate', generation: generationOf(proc) },
    });
    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'other.ext',
      payload: { action: 'activated', generation: generationOf(proc) },
    });
    proc.emit('message', {
      type: 'log',
      extensionId: 'pub.ext',
      payload: { level: 'info', message: 'still activating' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    // The terminal message must still be observed by the (intact) listener.
    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'activated', generation: generationOf(proc) },
    });

    await expect(promise).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });

  it('an "activated" for a different extension does not resolve this activation', async () => {
    const { host, proc } = createHostWithFakeProcess();
    let settled = false;
    const promise = host
      .activateExtension('pub.ext', '/install/pub.ext', './dist/index.js')
      .finally(() => {
        settled = true;
      });

    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'someone.else',
      payload: { action: 'activated', generation: generationOf(proc) },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'activated', generation: generationOf(proc) },
    });
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('ExtensionHost.activateExtension — generation isolation (upgrade regression)', () => {
  /**
   * Upgrade shape: deactivateExtension gives up after 5s and resolves anyway,
   * so the previous worker is still alive when the replacement is activated.
   * Both generations then emit lifecycle messages under the same extensionId.
   */
  function startUpgrade() {
    const { host, proc } = createHostWithFakeProcess();

    const first = host.activateExtension('pub.ext', '/install/pub.ext', './dist/index.js');
    // Its outcome is asserted per test; keep it handled so a rejection during
    // emit() is not reported as an unhandled rejection.
    first.catch(() => {});
    const oldGeneration = generationOf(proc);

    let settled = false;
    const second = host
      .activateExtension('pub.ext', '/install/pub.ext', './dist/index.js')
      .finally(() => {
        settled = true;
      });
    const newGeneration = generationOf(proc);
    expect(newGeneration).not.toBe(oldGeneration);

    return { proc, first, second, oldGeneration, newGeneration, isSettled: () => settled };
  }

  it('a superseded generation\'s "error" does not reject the new activation', async () => {
    const { proc, first, second, oldGeneration, newGeneration, isSettled } = startUpgrade();

    // The outgoing worker throws while it unwinds. Matching on extensionId +
    // action alone, this rejected the healthy new activation and the manager
    // marked a perfectly good extension as 'error'.
    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'error', error: 'dying generation', generation: oldGeneration },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isSettled()).toBe(false);
    await expect(first).rejects.toThrow('dying generation');

    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'activated', generation: newGeneration },
    });
    await expect(second).resolves.toBeUndefined();
  });

  it('a superseded generation\'s "activated" does not resolve the new activation', async () => {
    const { proc, first, second, oldGeneration, newGeneration, isSettled } = startUpgrade();

    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'activated', generation: oldGeneration },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isSettled()).toBe(false);
    await expect(first).resolves.toBeUndefined();

    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'activated', generation: newGeneration },
    });
    await expect(second).resolves.toBeUndefined();
  });
});

describe('ExtensionHost.deactivateExtension', () => {
  it('sends a deactivate message and resolves on "deactivated"', async () => {
    const { host, proc } = createHostWithFakeProcess();
    const promise = host.deactivateExtension('pub.ext');

    expect(lastSent(proc)).toMatchObject({
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'deactivate' },
    });

    proc.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.ext',
      payload: { action: 'deactivated' },
    });
    await expect(promise).resolves.toBeUndefined();
  });

  it('drops its lifecycle listener when the timeout fires (no listener pile-up)', async () => {
    vi.useFakeTimers();
    try {
      const { host, proc } = createHostWithFakeProcess();
      const baseline = proc.listenerCount('message');

      const promise = host.deactivateExtension('pub.ext');
      expect(proc.listenerCount('message')).toBe(baseline + 1);

      // A worker that never answers: the timeout resolves so the upgrade can
      // proceed. Previously the listener stayed attached forever — one more per
      // upgrade, each still able to fire on a late 'deactivated'.
      vi.advanceTimersByTime(5000);
      await expect(promise).resolves.toBeUndefined();
      expect(proc.listenerCount('message')).toBe(baseline);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ExtensionHost — command/tool execution round trip', () => {
  it('executeCommand resolves with the api-response result', async () => {
    const { host, proc } = createHostWithFakeProcess();
    const promise = host.executeCommand('pub.ext.hello', ['arg1']);

    const sent = lastSent(proc);
    expect(sent).toMatchObject({
      type: 'api-call',
      extensionId: '*',
      payload: { namespace: 'iris.commands', method: 'execute', args: ['pub.ext.hello', 'arg1'] },
    });

    proc.emit('message', {
      type: 'api-response',
      requestId: (sent as { requestId: string }).requestId,
      extensionId: '*',
      payload: { result: 42 },
    });

    await expect(promise).resolves.toBe(42);
  });

  it('executeTool rejects when the api-response carries an error', async () => {
    const { host, proc } = createHostWithFakeProcess();
    const promise = host.executeTool('pub.ext.tool', { size: 2 });

    const sent = lastSent(proc);
    expect(sent).toMatchObject({
      type: 'api-call',
      payload: { namespace: 'iris.tools', method: 'execute', args: ['pub.ext.tool', { size: 2 }] },
    });

    proc.emit('message', {
      type: 'api-response',
      requestId: (sent as { requestId: string }).requestId,
      extensionId: '*',
      payload: { error: { code: 'TOOL_FAILED', message: 'tool blew up' } },
    });

    await expect(promise).rejects.toThrow('tool blew up');
  });

  it('an api-response for an unknown requestId is ignored', async () => {
    const { host, proc } = createHostWithFakeProcess();
    const promise = host.executeCommand('pub.ext.hello');
    const sent = lastSent(proc) as { requestId: string };

    // Unknown requestId — must not settle the pending call
    proc.emit('message', {
      type: 'api-response',
      requestId: 'req_unknown',
      extensionId: '*',
      payload: { result: 'wrong' },
    });

    proc.emit('message', {
      type: 'api-response',
      requestId: sent.requestId,
      extensionId: '*',
      payload: { result: 'right' },
    });
    await expect(promise).resolves.toBe('right');
  });

  it('forwards api-call messages from extensions via the "api-call" event', () => {
    const { host, proc } = createHostWithFakeProcess();
    const listener = vi.fn();
    host.on('api-call', listener);

    const msg = {
      type: 'api-call',
      requestId: 'w_pub.ext_1',
      extensionId: 'pub.ext',
      payload: { namespace: 'iris.window', method: 'showMessage', args: ['hi'] },
    };
    proc.emit('message', msg);
    expect(listener).toHaveBeenCalledWith(msg);
  });

  it('forwards contribution and log messages as events', () => {
    const { host, proc } = createHostWithFakeProcess();
    const contribution = vi.fn();
    const log = vi.fn();
    host.on('contribution', contribution);
    host.on('log', log);

    const contribMsg = {
      type: 'contribution',
      extensionId: 'pub.ext',
      payload: { action: 'register', contributionType: 'command', data: {} },
    };
    const logMsg = {
      type: 'log',
      extensionId: 'pub.ext',
      payload: { level: 'info', message: 'hello' },
    };
    proc.emit('message', contribMsg);
    proc.emit('message', logMsg);

    expect(contribution).toHaveBeenCalledWith(contribMsg);
    expect(log).toHaveBeenCalledWith(logMsg);
  });
});

describe('ExtensionHost.stop', () => {
  it('does not send shutdown over an already closed IPC channel (EPIPE on quit)', async () => {
    const { host, proc } = createHostWithFakeProcess();
    // The child's IPC channel is already down (it is exiting / already gone).
    proc.connected = false;

    const stopPromise = host.stop();
    // Previously this send() raised an async "write EPIPE" on every app quit.
    expect(proc.send).not.toHaveBeenCalled();

    proc.emit('exit', 0);
    await stopPromise;
    expect((host as unknown as { process: unknown }).process).toBeNull();
  });

  it('rejects pending calls, sends shutdown, and clears the process on exit', async () => {
    const { host, proc } = createHostWithFakeProcess();

    const pending = host.executeCommand('pub.ext.hello');
    const pendingRejection = expect(pending).rejects.toThrow('Extension host shutting down');

    const stopPromise = host.stop();
    expect(proc.send).toHaveBeenCalledWith({
      type: 'lifecycle',
      payload: { action: 'shutdown' },
    });

    proc.emit('exit', 0);
    await stopPromise;
    await pendingRejection;

    expect((host as unknown as { process: unknown }).process).toBeNull();
    // Graceful exit — no force kill needed
    expect(proc.kill).not.toHaveBeenCalled();
  });
});
