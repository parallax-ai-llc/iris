// @vitest-environment node
/**
 * Unit tests for electron/extensions/extensionHostProcess.ts
 *
 * The forked host process sits between the Main Process and the per-extension
 * Worker Threads. Worker construction is mocked; `process.send` / `process.emit`
 * stand in for the fork IPC channel with the Main Process.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ExtHostMessage } from '../ipcProtocol';
import { RESOURCE_LIMITS } from '../ipcProtocol';

interface FakeWorkerLike extends EventEmitter {
  script: string;
  options: { workerData: { extensionId: string; installPath: string; mainFile: string } };
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({ workers: [] as FakeWorkerLike[] }));

vi.mock('worker_threads', async () => {
  const { EventEmitter: EE } = await import('events');
  class Worker extends EE {
    postMessage = vi.fn();
    // Node's Worker#terminate returns a promise; the host process awaits it
    // before telling Main the extension's files are free.
    terminate = vi.fn(async () => 1);
    constructor(
      public script: string,
      public options: { workerData: { extensionId: string; installPath: string; mainFile: string } },
    ) {
      super();
      h.workers.push(this as unknown as FakeWorkerLike);
    }
  }
  return { Worker };
});

const sendToMain = vi.fn();
let originalSend: typeof process.send;
/**
 * The module's `process.on('message', …)` handler, captured after import.
 * It is invoked directly rather than through `process.emit`, which would also
 * hit vitest's own IPC listener and crash on the non-serialized payload.
 */
let handleMainMessage: (msg: unknown) => void;

/** Drive the fork IPC channel: Main Process → host process. */
function fromMain(msg: unknown): void {
  handleMainMessage(msg);
}

/** Activate an extension and return its (mocked) worker. */
function activate(extensionId: string, generation?: string): FakeWorkerLike {
  fromMain({
    type: 'lifecycle',
    extensionId,
    payload: {
      action: 'activate',
      installPath: `/install/${extensionId}`,
      mainFile: './dist/index.js',
      ...(generation === undefined ? {} : { generation }),
    },
  });
  const worker = h.workers[h.workers.length - 1];
  expect(worker).toBeDefined();
  return worker;
}

function sentToMain(): ExtHostMessage[] {
  return sendToMain.mock.calls.map((c) => c[0] as ExtHostMessage);
}

/** Let queued microtasks run — e.g. a relay awaiting `worker.terminate()`. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeAll(async () => {
  originalSend = process.send;
  process.send = sendToMain as unknown as typeof process.send;

  const before = new Set(process.listeners('message'));
  await import('../extensionHostProcess');
  const added = process.listeners('message').filter((l) => !before.has(l));
  expect(added).toHaveLength(1);
  handleMainMessage = added[0] as (msg: unknown) => void;
  // Detach it from the real process so vitest's IPC channel is untouched.
  process.off('message', added[0] as (...args: unknown[]) => void);
});

afterAll(() => {
  process.send = originalSend;
});

beforeEach(() => {
  sendToMain.mockClear();
  h.workers.length = 0;
});

afterEach(() => {
  // The module keeps a process-wide activeWorkers map; retire this test's
  // workers so the MAX_CONCURRENT_WORKERS cap isn't hit by later tests.
  for (const worker of h.workers) {
    worker.emit('exit', 0);
  }
});

describe('extensionHostProcess — worker lifecycle', () => {
  it('spawns a worker from extensionHostWorker.mjs with the extension workerData', () => {
    const worker = activate('pub.spawn');
    expect(worker.script).toMatch(/extensionHostWorker\.mjs$/);
    expect(worker.options.workerData).toEqual({
      extensionId: 'pub.spawn',
      installPath: '/install/pub.spawn',
      mainFile: './dist/index.js',
    });
  });

  it('relays worker lifecycle and log messages to the Main Process', () => {
    const worker = activate('pub.life');

    worker.emit('message', { type: 'lifecycle', extensionId: 'pub.life', payload: { action: 'activated' } });
    worker.emit('message', {
      type: 'log',
      extensionId: 'pub.life',
      payload: { level: 'info', message: 'hello' },
    });

    expect(sentToMain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'lifecycle', extensionId: 'pub.life' }),
        expect.objectContaining({ type: 'log', extensionId: 'pub.life' }),
      ]),
    );
  });
});

describe('extensionHostProcess — api-response relay (regression: command results were dropped)', () => {
  it('relays a worker api-response back to the Main Process', () => {
    const worker = activate('pub.relay');

    worker.emit('message', {
      type: 'api-response',
      requestId: 'req_1',
      extensionId: 'pub.relay',
      payload: { result: 'the answer' },
    });

    // Without the relay this message was swallowed and ExtensionHost.callApi
    // in the Main Process hung until ASYNC_API_TIMEOUT (30s).
    expect(sentToMain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'api-response',
          requestId: 'req_1',
          extensionId: 'pub.relay',
          payload: { result: 'the answer' },
        }),
      ]),
    );
  });

  it('relays an error api-response unchanged', () => {
    const worker = activate('pub.relayerr');

    worker.emit('message', {
      type: 'api-response',
      requestId: 'req_err',
      extensionId: 'pub.relayerr',
      payload: { error: { code: 'EXECUTION_ERROR', message: 'boom' } },
    });

    expect(sentToMain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'api-response',
          requestId: 'req_err',
          payload: { error: { code: 'EXECUTION_ERROR', message: 'boom' } },
        }),
      ]),
    );
  });

  it('command round trip: execute → worker executeLocal → result reaches the Main Process', () => {
    const worker = activate('pub.cmd');

    // Extension registers a command
    worker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.cmd',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.cmd.hello' } },
    });

    // Main Process asks for it
    fromMain({
      type: 'api-call',
      requestId: 'req_cmd',
      extensionId: '*',
      payload: { namespace: 'iris.commands', method: 'execute', args: ['pub.cmd.hello', 'arg1'] },
    });

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'api-call',
        requestId: 'req_cmd',
        extensionId: 'pub.cmd',
        payload: expect.objectContaining({
          namespace: 'iris.commands',
          method: 'executeLocal',
          args: ['pub.cmd.hello', 'arg1'],
        }),
      }),
    );

    // Worker replies → must be relayed with the same requestId
    worker.emit('message', {
      type: 'api-response',
      requestId: 'req_cmd',
      extensionId: 'pub.cmd',
      payload: { result: 'hello result' },
    });

    expect(sentToMain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: 'req_cmd', payload: { result: 'hello result' } }),
      ]),
    );
  });

  it('tool round trip: execute → worker executeLocal → result reaches the Main Process', () => {
    const worker = activate('pub.tool');

    worker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.tool',
      payload: { action: 'register', contributionType: 'tool', data: { id: 'pub.tool.run' } },
    });

    fromMain({
      type: 'api-call',
      requestId: 'req_tool',
      extensionId: '*',
      payload: { namespace: 'iris.tools', method: 'execute', args: ['pub.tool.run', { size: 2 }] },
    });

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          namespace: 'iris.tools',
          method: 'executeLocal',
          args: ['pub.tool.run', { size: 2 }],
        }),
      }),
    );

    worker.emit('message', {
      type: 'api-response',
      requestId: 'req_tool',
      extensionId: 'pub.tool',
      payload: { result: { ok: true } },
    });

    expect(sentToMain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: 'req_tool', payload: { result: { ok: true } } }),
      ]),
    );
  });

  it('reports COMMAND_NOT_FOUND when no extension registered the command', () => {
    fromMain({
      type: 'api-call',
      requestId: 'req_missing',
      extensionId: '*',
      payload: { namespace: 'iris.commands', method: 'execute', args: ['nobody.cmd'] },
    });

    expect(sentToMain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'api-response',
          requestId: 'req_missing',
          payload: { error: expect.objectContaining({ code: 'COMMAND_NOT_FOUND' }) },
        }),
      ]),
    );
  });
});

describe('extensionHostProcess — upgrade generations (N-2 regression)', () => {
  /** Register a command from `worker` and run it, asserting it resolves. */
  function expectCommandWorks(worker: FakeWorkerLike, commandId: string, requestId: string): void {
    sendToMain.mockClear();
    worker.postMessage.mockClear();
    fromMain({
      type: 'api-call',
      requestId,
      extensionId: '*',
      payload: { namespace: 'iris.commands', method: 'execute', args: [commandId] },
    });
    // Routed to the worker (not answered with COMMAND_NOT_FOUND)
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId, payload: expect.objectContaining({ method: 'executeLocal' }) }),
    );
    expect(sentToMain()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: { error: expect.objectContaining({ code: 'COMMAND_NOT_FOUND' }) } }),
      ]),
    );
  }

  it('a superseded worker\'s late exit does not destroy the new generation\'s command registry', () => {
    const oldWorker = activate('pub.upgrade');
    oldWorker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.upgrade',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.upgrade.hello' } },
    });
    oldWorker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.upgrade',
      payload: { action: 'register', contributionType: 'tool', data: { id: 'pub.upgrade.tool' } },
    });

    // Upgrade: main deactivates, then activates the replacement.
    fromMain({ type: 'lifecycle', extensionId: 'pub.upgrade', payload: { action: 'deactivate' } });
    const newWorker = activate('pub.upgrade');
    expect(newWorker).not.toBe(oldWorker);

    // New generation re-registers its handlers
    newWorker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.upgrade',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.upgrade.hello' } },
    });
    newWorker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.upgrade',
      payload: { action: 'register', contributionType: 'tool', data: { id: 'pub.upgrade.tool' } },
    });
    expectCommandWorks(newWorker, 'pub.upgrade.hello', 'req_before_exit');

    // …seconds later the OLD worker finally exits. Previously this wiped the
    // new worker from activeWorkers and deleted its command/tool handlers,
    // so the command that worked a moment ago became "not found".
    oldWorker.emit('exit', 0);

    expectCommandWorks(newWorker, 'pub.upgrade.hello', 'req_after_exit');

    // Tools survive the same way
    sendToMain.mockClear();
    newWorker.postMessage.mockClear();
    fromMain({
      type: 'api-call',
      requestId: 'req_tool_after_exit',
      extensionId: '*',
      payload: { namespace: 'iris.tools', method: 'execute', args: ['pub.upgrade.tool', {}] },
    });
    expect(newWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req_tool_after_exit' }),
    );
  });

  it('a superseded worker\'s late unregister contributions do not deregister the new generation', () => {
    const oldWorker = activate('pub.dispose');
    oldWorker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.dispose',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.dispose.run' } },
    });

    const newWorker = activate('pub.dispose');
    newWorker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.dispose',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.dispose.run' } },
    });

    // Old worker's deactivate() disposes its subscriptions → unregister for the
    // same id the new worker just claimed.
    sendToMain.mockClear();
    oldWorker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.dispose',
      payload: { action: 'unregister', contributionType: 'command', data: { id: 'pub.dispose.run' } },
    });
    // Not forwarded to main either — it would evict the live snapshot entry.
    expect(sentToMain()).toHaveLength(0);

    expectCommandWorks(newWorker, 'pub.dispose.run', 'req_after_dispose');
  });

  it('a superseded worker\'s late "deactivated" does not evict the new generation', () => {
    const oldWorker = activate('pub.late');
    const newWorker = activate('pub.late');
    newWorker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.late',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.late.go' } },
    });

    oldWorker.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.late',
      payload: { action: 'deactivated' },
    });

    // The old worker is retired, the live one keeps serving.
    expect(oldWorker.terminate).toHaveBeenCalled();
    expect(newWorker.terminate).not.toHaveBeenCalled();
    expectCommandWorks(newWorker, 'pub.late.go', 'req_after_late_deactivated');
  });

  it('re-activating terminates the worker it replaces', () => {
    const oldWorker = activate('pub.replace');
    const newWorker = activate('pub.replace');
    expect(oldWorker.terminate).toHaveBeenCalled();
    expect(newWorker.terminate).not.toHaveBeenCalled();
  });

  it('the live worker\'s own exit still cleans up its handlers', () => {
    const worker = activate('pub.solo');
    worker.emit('message', {
      type: 'contribution',
      extensionId: 'pub.solo',
      payload: { action: 'register', contributionType: 'command', data: { id: 'pub.solo.go' } },
    });
    expectCommandWorks(worker, 'pub.solo.go', 'req_alive');

    worker.emit('exit', 0);

    sendToMain.mockClear();
    fromMain({
      type: 'api-call',
      requestId: 'req_dead',
      extensionId: '*',
      payload: { namespace: 'iris.commands', method: 'execute', args: ['pub.solo.go'] },
    });
    expect(sentToMain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: 'req_dead',
          payload: { error: expect.objectContaining({ code: 'COMMAND_NOT_FOUND' }) },
        }),
      ]),
    );
  });
});

describe('extensionHostProcess — generation leaks (a superseded worker must stay silent)', () => {
  /** Emit a worker-level 'error' with console noise suppressed. */
  function crash(worker: FakeWorkerLike, message: string): void {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      worker.emit('error', new Error(message));
    } finally {
      errorSpy.mockRestore();
    }
  }

  it('stamps the activation generation onto relayed lifecycle messages', () => {
    const worker = activate('pub.stamp', 'gen_1');

    worker.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.stamp',
      payload: { action: 'activated' },
    });

    // Without the token the Main Process cannot tell this apart from a message
    // emitted by a predecessor still dying under the same extensionId.
    expect(sentToMain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'lifecycle',
          extensionId: 'pub.stamp',
          payload: { action: 'activated', generation: 'gen_1' },
        }),
      ]),
    );
  });

  it('does not relay a superseded worker\'s crash', () => {
    const oldWorker = activate('pub.crashold', 'gen_1');
    const newWorker = activate('pub.crashold', 'gen_2');
    expect(newWorker).not.toBe(oldWorker);

    sendToMain.mockClear();
    // The retired generation throws as terminate() unwinds it.
    crash(oldWorker, 'dying generation');

    // Relaying this rejected the *new* activation promise in the Main Process,
    // which marked the freshly installed extension as 'error'.
    expect(sentToMain()).toHaveLength(0);
  });

  it('still relays the live worker\'s crash, stamped with its own generation', () => {
    const worker = activate('pub.crashlive', 'gen_live');

    sendToMain.mockClear();
    crash(worker, 'boom');

    expect(sentToMain()).toEqual([
      expect.objectContaining({
        type: 'lifecycle',
        extensionId: 'pub.crashlive',
        payload: { action: 'error', error: 'boom', generation: 'gen_live' },
      }),
    ]);
  });

  it('does not relay a superseded worker\'s "deactivated", but still retires it', () => {
    const oldWorker = activate('pub.deacold', 'gen_1');
    const newWorker = activate('pub.deacold', 'gen_2');

    sendToMain.mockClear();
    oldWorker.terminate.mockClear();
    oldWorker.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.deacold',
      payload: { action: 'deactivated' },
    });

    // The sender is honoured…
    expect(oldWorker.terminate).toHaveBeenCalled();
    expect(newWorker.terminate).not.toHaveBeenCalled();
    // …but Main must not hear it: that would settle the live generation's
    // deactivate promise and report a running extension as stopped.
    expect(sentToMain()).toHaveLength(0);
  });

  it('relays the live worker\'s "deactivated" with its generation', async () => {
    const worker = activate('pub.deaclive', 'gen_live');

    sendToMain.mockClear();
    worker.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.deaclive',
      payload: { action: 'deactivated' },
    });
    await flush();

    expect(sentToMain()).toEqual([
      expect.objectContaining({
        extensionId: 'pub.deaclive',
        payload: { action: 'deactivated', generation: 'gen_live' },
      }),
    ]);
  });

  it('withholds "deactivated" from Main until the worker thread is really gone', async () => {
    const worker = activate('pub.deacwait', 'gen_wait');
    let releaseTermination: () => void = () => {};
    worker.terminate.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          releaseTermination = () => resolve(1);
        }),
    );

    sendToMain.mockClear();
    worker.emit('message', {
      type: 'lifecycle',
      extensionId: 'pub.deacwait',
      payload: { action: 'deactivated' },
    });
    await flush();

    // Main reads 'deactivated' as "the extension's files are free now": an
    // upgrade wipes and recreates the install directory the instant it
    // arrives. While the thread still holds the entry file, Windows leaves the
    // deleted directory "delete pending" and the recreate fails with EPERM.
    expect(worker.terminate).toHaveBeenCalled();
    expect(sentToMain()).toHaveLength(0);

    releaseTermination();
    await flush();

    expect(sentToMain()).toEqual([
      expect.objectContaining({
        extensionId: 'pub.deacwait',
        payload: { action: 'deactivated', generation: 'gen_wait' },
      }),
    ]);
  });

  it('stamps the generation on the max-concurrent-workers rejection', () => {
    const workers: FakeWorkerLike[] = [];
    for (let i = 0; i < RESOURCE_LIMITS.MAX_CONCURRENT_WORKERS; i++) {
      workers.push(activate(`pub.cap${i}`, `gen_cap${i}`));
    }

    sendToMain.mockClear();
    fromMain({
      type: 'lifecycle',
      extensionId: 'pub.overflow',
      payload: {
        action: 'activate',
        installPath: '/install/pub.overflow',
        mainFile: './dist/index.js',
        generation: 'gen_overflow',
      },
    });

    // The refusal answers one specific activate request — it must carry that
    // request's token or it settles whichever activation is listening.
    expect(sentToMain()).toEqual([
      expect.objectContaining({
        type: 'lifecycle',
        extensionId: 'pub.overflow',
        payload: expect.objectContaining({ action: 'error', generation: 'gen_overflow' }),
      }),
    ]);
  });
});

describe('extensionHostProcess — exit logging', () => {
  it('stays quiet when a worker we terminated on purpose exits with code 1', () => {
    const worker = activate('pub.quiet');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Deactivate → worker reports 'deactivated' → we terminate it.
      worker.emit('message', {
        type: 'lifecycle',
        extensionId: 'pub.quiet',
        payload: { action: 'deactivated' },
      });
      expect(worker.terminate).toHaveBeenCalled();

      // terminate() always surfaces as exit code 1 — expected, not a crash.
      worker.emit('exit', 1);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('still warns when a worker dies on its own with a non-zero code', () => {
    const worker = activate('pub.crash');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      worker.emit('exit', 1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('pub.crash'));
    } finally {
      warn.mockRestore();
    }
  });

  it('stays quiet for workers retired by the shutdown sweep', () => {
    const a = activate('pub.sd1');
    const b = activate('pub.sd2');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    try {
      fromMain({ type: 'lifecycle', extensionId: '*', payload: { action: 'shutdown' } });
      expect(a.terminate).toHaveBeenCalled();
      expect(b.terminate).toHaveBeenCalled();

      a.emit('exit', 1);
      b.emit('exit', 1);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      exit.mockRestore();
    }
  });
});

describe('extensionHostProcess — Main → worker forwarding', () => {
  it('forwards an api-response from the Main Process to the target worker only', () => {
    const a = activate('pub.a');
    const b = activate('pub.b');

    const msg = {
      type: 'api-response',
      requestId: 'w_pub.a_1',
      extensionId: 'pub.a',
      payload: { result: 'for a' },
    };
    fromMain(msg);

    expect(a.postMessage).toHaveBeenCalledWith(msg);
    expect(b.postMessage).not.toHaveBeenCalledWith(msg);
  });

  it('broadcasts an event addressed to "*" to every worker', () => {
    const a = activate('pub.ea');
    const b = activate('pub.eb');

    const msg = {
      type: 'event',
      extensionId: '*',
      payload: { eventName: 'image:didChangeActive', data: { width: 1, height: 2 } },
    };
    fromMain(msg);

    expect(a.postMessage).toHaveBeenCalledWith(msg);
    expect(b.postMessage).toHaveBeenCalledWith(msg);
  });
});
