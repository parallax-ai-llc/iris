/**
 * Extension Host Process — runs as a forked child process.
 * Manages Worker Threads for each extension.
 *
 * This file is the entry point for the forked process (compiled to .mjs).
 */
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  ExtHostMessage,
  ExtHostApiCall,
  ExtHostApiResponse,
  ExtHostLifecycle,
} from './ipcProtocol';
import { RESOURCE_LIMITS } from './ipcProtocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ExtensionWorker {
  worker: Worker;
  extensionId: string;
  installPath: string;
}

const activeWorkers = new Map<string, ExtensionWorker>();
const commandHandlers = new Map<string, string>(); // commandId → extensionId
const toolHandlers = new Map<string, string>();     // toolId → extensionId

/**
 * True when `worker` is still the live worker for `extensionId`.
 * Guards every teardown path: a superseded worker (upgrade / re-activate)
 * emits 'exit' seconds later and must not touch the new generation's state.
 */
function isCurrentWorker(extensionId: string, worker: Worker): boolean {
  return activeWorkers.get(extensionId)?.worker === worker;
}

/**
 * Workers we terminated on purpose (deactivate, upgrade, app shutdown).
 * `worker.terminate()` always yields exit code 1, which is indistinguishable
 * from a crash at the 'exit' handler — without this the app logged a warning
 * for every extension on every normal quit, burying real crashes.
 */
const retiredWorkers = new WeakSet<Worker>();

/**
 * Terminate a worker as an intentional, expected shutdown.
 *
 * Resolves only once the thread is really gone. Until it is, the worker still
 * holds an OS handle on the extension's entry file; on Windows an upgrade that
 * deletes and recreates the install directory before that handle is released
 * leaves the directory "delete pending" and the recreate fails with EPERM.
 * Anything that touches the extension's files must await this.
 */
function retireWorker(worker: Worker): Promise<void> {
  retiredWorkers.add(worker);
  // `terminate()` is a promise on Node, but normalize anyway so every caller
  // can await it unconditionally.
  return Promise.resolve(worker.terminate()).then(
    () => undefined,
    (err: unknown) => {
      console.warn('[ExtHostProcess] Worker termination failed:', err);
    },
  );
}

/** Send message to Main Process */
function sendToMain(msg: ExtHostMessage): void {
  process.send!(msg);
}

/** Handle messages from Main Process */
function handleMainMessage(msg: ExtHostMessage): void {
  switch (msg.type) {
    case 'lifecycle':
      handleLifecycle(msg as ExtHostLifecycle & { payload: { installPath?: string; mainFile?: string } });
      break;

    case 'api-response':
      // Response from Main Process API handler → forward to the extension's worker
      forwardToWorker(msg.extensionId, msg);
      break;

    case 'api-call':
      // Main process asking to execute a command/tool in an extension
      handleInternalApiCall(msg as ExtHostApiCall);
      break;

    case 'event':
      // Broadcast events to relevant workers
      if (msg.extensionId === '*') {
        for (const ew of activeWorkers.values()) {
          ew.worker.postMessage(msg);
        }
      } else {
        forwardToWorker(msg.extensionId, msg);
      }
      break;
  }
}

function handleLifecycle(msg: ExtHostLifecycle & { payload: { installPath?: string; mainFile?: string } }): void {
  const { extensionId, payload } = msg;

  switch (payload.action) {
    case 'activate': {
      // Stamped onto every lifecycle message this worker generation emits, so
      // the Main Process can ignore the ones it did not ask for.
      const generation = payload.generation;

      if (activeWorkers.size >= RESOURCE_LIMITS.MAX_CONCURRENT_WORKERS) {
        sendToMain({
          type: 'lifecycle',
          extensionId,
          payload: { action: 'error', error: 'Maximum concurrent extensions reached', generation },
        });
        return;
      }

      const workerScript = path.join(__dirname, 'extensionHostWorker.mjs');
      const worker = new Worker(workerScript, {
        workerData: {
          extensionId,
          installPath: payload.installPath,
          mainFile: payload.mainFile,
        },
        resourceLimits: {
          maxOldGenerationSizeMb: Math.floor(RESOURCE_LIMITS.WORKER_MEMORY_LIMIT / (1024 * 1024)),
          maxYoungGenerationSizeMb: 32,
          codeRangeSizeMb: 16,
        },
      });

      worker.on('message', (workerMsg: ExtHostMessage) => {
        handleWorkerMessage(extensionId, workerMsg, worker, generation);
      });

      worker.on('error', (err: unknown) => {
        console.error(`[ExtHostProcess] Worker error for ${extensionId}:`, err);
        // A superseded worker routinely throws while it winds down. Relaying
        // that to Main would reject the *new* generation's activation promise
        // and mark a healthy extension as 'error' — the log is enough.
        if (!isCurrentWorker(extensionId, worker)) return;

        activeWorkers.delete(extensionId);
        sendToMain({
          type: 'lifecycle',
          extensionId,
          payload: { action: 'error', error: err instanceof Error ? err.message : String(err), generation },
        });
      });

      worker.on('exit', (code) => {
        // Only surface unexpected deaths — a retired worker's code 1 is normal.
        if (code !== 0 && !retiredWorkers.has(worker)) {
          console.warn(`[ExtHostProcess] Worker for ${extensionId} exited with code ${code}`);
        }
        // An upgrade replaces the worker while the old one is still shutting
        // down: its late 'exit' must NOT evict the new worker or the handlers
        // the new worker has already registered. Only the current generation
        // may clean up.
        if (!isCurrentWorker(extensionId, worker)) return;

        activeWorkers.delete(extensionId);
        for (const [cmdId, extId] of commandHandlers) {
          if (extId === extensionId) commandHandlers.delete(cmdId);
        }
        for (const [toolId, extId] of toolHandlers) {
          if (extId === extensionId) toolHandlers.delete(toolId);
        }
      });

      // Replacing an existing entry (upgrade/reactivate): the superseded worker
      // is retired here so it cannot keep handling messages.
      const superseded = activeWorkers.get(extensionId);
      activeWorkers.set(extensionId, { worker, extensionId, installPath: payload.installPath! });
      if (superseded && superseded.worker !== worker) {
        void retireWorker(superseded.worker);
      }
      break;
    }

    case 'deactivate': {
      const ew = activeWorkers.get(extensionId);
      if (ew) {
        ew.worker.postMessage({ type: 'lifecycle', extensionId, payload: { action: 'deactivate' } });
        // Worker will send 'deactivated' message, then we terminate.
        // The identity guard matters: by the time this fires, an upgrade may
        // have installed a new worker under the same id — killing that one
        // would take down the freshly activated extension.
        setTimeout(() => {
          if (isCurrentWorker(extensionId, ew.worker)) {
            void retireWorker(ew.worker);
            activeWorkers.delete(extensionId);
          }
        }, 5000);
      } else {
        sendToMain({ type: 'lifecycle', extensionId, payload: { action: 'deactivated' } });
      }
      break;
    }

    case 'shutdown' as any:
      // Gracefully shutdown all workers
      for (const ew of activeWorkers.values()) {
        void retireWorker(ew.worker);
      }
      activeWorkers.clear();
      process.exit(0);
      break;
  }
}

function handleWorkerMessage(
  extensionId: string,
  msg: ExtHostMessage,
  worker: Worker,
  generation?: string,
): void {
  // A worker superseded by an upgrade can still emit messages while it winds
  // down. Request-scoped traffic (api-call/api-response) stays valid because it
  // is keyed by requestId, but registry- and lifecycle-affecting messages from
  // a dead generation would corrupt the live one.
  const isCurrent = isCurrentWorker(extensionId, worker);

  switch (msg.type) {
    case 'api-call':
      // Worker calling iris.* API → forward to Main Process with permission check
      sendToMain({ ...msg, extensionId });
      break;

    case 'api-response':
      // Worker's reply to a Main-initiated executeLocal (command/tool run).
      // Must be relayed back, or ExtensionHost.callApi in the Main Process
      // never settles and rejects after ASYNC_API_TIMEOUT with the command's
      // return value silently dropped.
      sendToMain({ ...msg, extensionId });
      break;

    case 'lifecycle': {
      // Relayed lifecycle messages carry the generation token of the activation
      // that spawned this worker, so Main can match them against the activation
      // it is actually waiting on.
      const relay = () =>
        sendToMain({ ...msg, extensionId, payload: { ...msg.payload, generation } });

      if (msg.payload.action === 'deactivated') {
        // Always honour a shutdown from the sending worker…
        const terminated = retireWorker(worker);
        // …but a superseded worker's 'deactivated' must not reach Main: it
        // would settle the live generation's deactivate promise and let the
        // manager report a running extension as stopped.
        if (isCurrent) {
          activeWorkers.delete(extensionId);
          // Relay only once the thread is really gone: Main reads
          // 'deactivated' as "the extension's files are free now", and an
          // upgrade wipes and recreates the install directory the moment it
          // arrives.
          void terminated.then(relay);
        }
      } else if (
        isCurrent &&
        (msg.payload.action === 'activated' || msg.payload.action === 'error')
      ) {
        relay();
      }
      break;
    }

    case 'contribution':
      // Extension registering a command/tool/node. A superseded worker's
      // dispose() emits 'unregister' for ids the NEW worker has just claimed —
      // acting on those would deregister the live extension's commands.
      if (!isCurrent) break;
      handleContributionFromWorker(extensionId, msg);
      sendToMain({ ...msg, extensionId });
      break;

    case 'log':
      sendToMain({ ...msg, extensionId });
      break;
  }
}

function handleContributionFromWorker(extensionId: string, msg: ExtHostMessage): void {
  if (msg.type !== 'contribution') return;
  const { payload } = msg;

  if (payload.action === 'register') {
    if (payload.contributionType === 'command') {
      const data = payload.data as { id: string };
      commandHandlers.set(data.id, extensionId);
    } else if (payload.contributionType === 'tool') {
      const data = payload.data as { id: string };
      toolHandlers.set(data.id, extensionId);
    }
  } else if (payload.action === 'unregister') {
    if (payload.contributionType === 'command') {
      const data = payload.data as { id: string };
      commandHandlers.delete(data.id);
    } else if (payload.contributionType === 'tool') {
      const data = payload.data as { id: string };
      toolHandlers.delete(data.id);
    }
  }
}

function handleInternalApiCall(msg: ExtHostApiCall): void {
  const { requestId, payload } = msg;

  if (payload.namespace === 'iris.commands' && payload.method === 'execute') {
    const [commandId, ...args] = payload.args;
    const extId = commandHandlers.get(commandId as string);
    if (extId) {
      const ew = activeWorkers.get(extId);
      if (ew) {
        ew.worker.postMessage({
          type: 'api-call',
          requestId,
          extensionId: extId,
          payload: { namespace: 'iris.commands', method: 'executeLocal', args: [commandId, ...args] },
        });
        return;
      }
    }
    sendToMain({
      type: 'api-response',
      requestId: requestId!,
      extensionId: '*',
      payload: { error: { code: 'COMMAND_NOT_FOUND', message: `Command "${commandId}" not found` } },
    });
  } else if (payload.namespace === 'iris.tools' && payload.method === 'execute') {
    const [toolId, params] = payload.args;
    const extId = toolHandlers.get(toolId as string);
    if (extId) {
      const ew = activeWorkers.get(extId);
      if (ew) {
        ew.worker.postMessage({
          type: 'api-call',
          requestId,
          extensionId: extId,
          payload: { namespace: 'iris.tools', method: 'executeLocal', args: [toolId, params] },
        });
        return;
      }
    }
    sendToMain({
      type: 'api-response',
      requestId: requestId!,
      extensionId: '*',
      payload: { error: { code: 'TOOL_NOT_FOUND', message: `Tool "${toolId}" not found` } },
    });
  }
}

function forwardToWorker(extensionId: string, msg: ExtHostMessage): void {
  if (extensionId === '*') {
    // Broadcast
    for (const ew of activeWorkers.values()) {
      ew.worker.postMessage(msg);
    }
  } else {
    const ew = activeWorkers.get(extensionId);
    if (ew) {
      ew.worker.postMessage(msg);
    }
  }
}

// ─── Bootstrap ───

process.on('message', handleMainMessage);

// Signal ready
sendToMain({
  type: 'lifecycle',
  extensionId: '*',
  payload: { action: 'ready' as any },
});
