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
      if (activeWorkers.size >= RESOURCE_LIMITS.MAX_CONCURRENT_WORKERS) {
        sendToMain({
          type: 'lifecycle',
          extensionId,
          payload: { action: 'error', error: 'Maximum concurrent extensions reached' },
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
        handleWorkerMessage(extensionId, workerMsg);
      });

      worker.on('error', (err) => {
        console.error(`[ExtHostProcess] Worker error for ${extensionId}:`, err);
        activeWorkers.delete(extensionId);
        sendToMain({
          type: 'lifecycle',
          extensionId,
          payload: { action: 'error', error: err.message },
        });
      });

      worker.on('exit', (code) => {
        activeWorkers.delete(extensionId);
        if (code !== 0) {
          console.warn(`[ExtHostProcess] Worker for ${extensionId} exited with code ${code}`);
        }
        // Clean up handlers registered by this extension
        for (const [cmdId, extId] of commandHandlers) {
          if (extId === extensionId) commandHandlers.delete(cmdId);
        }
        for (const [toolId, extId] of toolHandlers) {
          if (extId === extensionId) toolHandlers.delete(toolId);
        }
      });

      activeWorkers.set(extensionId, { worker, extensionId, installPath: payload.installPath! });
      break;
    }

    case 'deactivate': {
      const ew = activeWorkers.get(extensionId);
      if (ew) {
        ew.worker.postMessage({ type: 'lifecycle', extensionId, payload: { action: 'deactivate' } });
        // Worker will send 'deactivated' message, then we terminate
        setTimeout(() => {
          if (activeWorkers.has(extensionId)) {
            ew.worker.terminate();
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
        ew.worker.terminate();
      }
      activeWorkers.clear();
      process.exit(0);
      break;
  }
}

function handleWorkerMessage(extensionId: string, msg: ExtHostMessage): void {
  switch (msg.type) {
    case 'api-call':
      // Worker calling iris.* API → forward to Main Process with permission check
      sendToMain({ ...msg, extensionId });
      break;

    case 'lifecycle':
      if (msg.payload.action === 'activated' || msg.payload.action === 'deactivated' || msg.payload.action === 'error') {
        sendToMain({ ...msg, extensionId });
        if (msg.payload.action === 'deactivated') {
          const ew = activeWorkers.get(extensionId);
          if (ew) {
            ew.worker.terminate();
            activeWorkers.delete(extensionId);
          }
        }
      }
      break;

    case 'contribution':
      // Extension registering a command/tool/node
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
