/**
 * Extension Host Worker — runs inside a Worker Thread.
 * Each extension gets its own worker for isolation.
 *
 * Provides the `iris.*` API proxy that forwards calls to the Main Process via IPC.
 */
import { parentPort, workerData } from 'worker_threads';
import path from 'path';
import type {
  ExtHostMessage,
  ExtHostApiCall,
  ExtHostApiResponse,
  ExtHostContribution,
} from './ipcProtocol';

const { extensionId, installPath, mainFile } = workerData as {
  extensionId: string;
  installPath: string;
  mainFile: string;
};

// ─── Pending API calls ───

let requestCounter = 0;
const pendingCalls = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}>();

// ─── Command & Tool handler registries (local to this worker) ───

const localCommandHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
const localToolHandlers = new Map<string, (params: unknown) => Promise<unknown>>();

// ─── Disposable system ───

interface Disposable {
  dispose: () => void;
}

const subscriptions: Disposable[] = [];
const eventListeners = new Map<string, Set<(data: unknown) => void>>();

// ─── iris.* API Proxy ───

function callApi(namespace: string, method: string, ...args: unknown[]): Promise<unknown> {
  const requestId = `w_${extensionId}_${++requestCounter}`;

  return new Promise((resolve, reject) => {
    pendingCalls.set(requestId, { resolve, reject });

    const msg: ExtHostApiCall = {
      type: 'api-call',
      requestId,
      extensionId,
      payload: { namespace, method, args },
    };

    parentPort!.postMessage(msg);
  });
}

function registerContribution(
  contributionType: ExtHostContribution['payload']['contributionType'],
  data: unknown
): void {
  parentPort!.postMessage({
    type: 'contribution',
    extensionId,
    payload: { action: 'register', contributionType, data },
  } satisfies ExtHostContribution);
}

function unregisterContribution(
  contributionType: ExtHostContribution['payload']['contributionType'],
  data: unknown
): void {
  parentPort!.postMessage({
    type: 'contribution',
    extensionId,
    payload: { action: 'unregister', contributionType, data },
  } satisfies ExtHostContribution);
}

function subscribe(eventName: string, callback: (data: unknown) => void): Disposable {
  if (!eventListeners.has(eventName)) {
    eventListeners.set(eventName, new Set());
  }
  eventListeners.get(eventName)!.add(callback);

  return {
    dispose: () => {
      eventListeners.get(eventName)?.delete(callback);
    },
  };
}

function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  parentPort!.postMessage({
    type: 'log',
    extensionId,
    payload: { level, message, args },
  });
}

/** The iris.* API object injected into extensions */
const irisApi = {
  commands: {
    register(commandId: string, handler: (...args: unknown[]) => Promise<unknown>): Disposable {
      localCommandHandlers.set(commandId, handler);
      registerContribution('command', { id: commandId });
      return {
        dispose: () => {
          localCommandHandlers.delete(commandId);
          unregisterContribution('command', { id: commandId });
        },
      };
    },
    execute(commandId: string, ...args: unknown[]): Promise<unknown> {
      return callApi('iris.commands', 'execute', commandId, ...args);
    },
  },

  tools: {
    register(
      toolDef: { id: string; name: string; category: string; icon?: string; description?: string },
      handler: (params: unknown) => Promise<unknown>
    ): Disposable {
      localToolHandlers.set(toolDef.id, handler);
      registerContribution('tool', toolDef);
      return {
        dispose: () => {
          localToolHandlers.delete(toolDef.id);
          unregisterContribution('tool', { id: toolDef.id });
        },
      };
    },
  },

  workflow: {
    registerNode(
      nodeDef: {
        id: string; name: string; category: string;
        inputs: { id: string; type: string }[];
        outputs: { id: string; type: string }[];
      },
      executor: (inputs: Record<string, unknown>, config: Record<string, unknown>) => Promise<Record<string, unknown>>
    ): Disposable {
      registerContribution('workflowNode', { ...nodeDef, extensionId });
      // Store executor locally for when the node is executed
      const handlerId = `workflow:${nodeDef.id}`;
      localCommandHandlers.set(handlerId, async (...args: unknown[]) => {
        const [inputs, config] = args as [Record<string, unknown>, Record<string, unknown>];
        return executor(inputs, config);
      });
      return {
        dispose: () => {
          localCommandHandlers.delete(handlerId);
          unregisterContribution('workflowNode', { id: nodeDef.id });
        },
      };
    },
  },

  window: {
    showMessage(message: string, type: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
      return callApi('iris.window', 'showMessage', message, type) as Promise<void>;
    },
    showInputBox(options: { prompt: string; value?: string; placeholder?: string }): Promise<string | undefined> {
      return callApi('iris.window', 'showInputBox', options) as Promise<string | undefined>;
    },
    createPanel(html: string, options?: { title?: string; location?: string }): Promise<string> {
      return callApi('iris.window', 'createPanel', html, options) as Promise<string>;
    },
    setStatusBarItem(text: string, options?: { tooltip?: string; priority?: number }): Disposable {
      const itemId = `${extensionId}.statusbar.${++requestCounter}`;
      registerContribution('statusBarItem', { id: itemId, text, ...options });
      return {
        dispose: () => {
          unregisterContribution('statusBarItem', { id: itemId });
        },
      };
    },
  },

  storage: {
    get(key: string): Promise<unknown> {
      return callApi('iris.storage', 'get', key);
    },
    set(key: string, value: unknown): Promise<void> {
      return callApi('iris.storage', 'set', key, value) as Promise<void>;
    },
    delete(key: string): Promise<void> {
      return callApi('iris.storage', 'delete', key) as Promise<void>;
    },
  },

  image: {
    getActive(): Promise<{ width: number; height: number; data: Uint8Array } | null> {
      return callApi('iris.image', 'getActive') as Promise<any>;
    },
    putImage(imageData: { width: number; height: number; data: Uint8Array }): Promise<void> {
      return callApi('iris.image', 'putImage', imageData) as Promise<void>;
    },
    getSelection(): Promise<{ x: number; y: number; width: number; height: number } | null> {
      return callApi('iris.image', 'getSelection') as Promise<any>;
    },
    onDidChangeActive(callback: (image: { width: number; height: number }) => void): Disposable {
      return subscribe('image:didChangeActive', callback as (data: unknown) => void);
    },
    getActiveFileInfo(): Promise<{ filePath: string | null; fileName: string; format: string; fileSize: number; width: number; height: number; mimeType: string; metadata: Record<string, unknown> } | null> {
      return callApi('iris.image', 'getActiveFileInfo') as Promise<any>;
    },
  },

  ai: {
    executeModel(provider: string, params: Record<string, unknown>): Promise<unknown> {
      return callApi('iris.ai', 'executeModel', provider, params);
    },
    getAvailableModels(): Promise<{ id: string; name: string; provider: string }[]> {
      return callApi('iris.ai', 'getAvailableModels') as Promise<any>;
    },
  },

  network: {
    fetch(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      return callApi('iris.network', 'fetch', url, options) as Promise<any>;
    },
  },

  clipboard: {
    read(): Promise<string> {
      return callApi('iris.clipboard', 'read') as Promise<string>;
    },
    write(data: string): Promise<void> {
      return callApi('iris.clipboard', 'write', data) as Promise<void>;
    },
  },

  fs: {
    readFile(filePath: string): Promise<Uint8Array> {
      return callApi('iris.fs', 'readFile', filePath) as Promise<Uint8Array>;
    },
    writeFile(filePath: string, data: Uint8Array): Promise<void> {
      return callApi('iris.fs', 'writeFile', filePath, data) as Promise<void>;
    },
    listDirectory(dirPath: string): Promise<{ name: string; isDirectory: boolean; isFile: boolean; size: number; modifiedAt: string }[]> {
      return callApi('iris.fs', 'listDirectory', dirPath) as Promise<any>;
    },
    rename(oldPath: string, newPath: string): Promise<void> {
      return callApi('iris.fs', 'rename', oldPath, newPath) as Promise<void>;
    },
    stat(filePath: string): Promise<{ size: number; createdAt: string; modifiedAt: string; isDirectory: boolean; isFile: boolean }> {
      return callApi('iris.fs', 'stat', filePath) as Promise<any>;
    },
  },

  export: {
    getPresets(): Promise<{ id: string; label: string; width: number; height: number; fps: number; format: string }[]> {
      return callApi('iris.export', 'getPresets') as Promise<any>;
    },
    applyPreset(presetId: string): Promise<void> {
      return callApi('iris.export', 'applyPreset', presetId) as Promise<void>;
    },
    getSettings(): Promise<Record<string, unknown>> {
      return callApi('iris.export', 'getSettings') as Promise<any>;
    },
    updateSettings(settings: Record<string, unknown>): Promise<void> {
      return callApi('iris.export', 'updateSettings', settings) as Promise<void>;
    },
  },

  env: {
    get appVersion(): Promise<string> { return callApi('iris.env', 'appVersion') as Promise<string>; },
    get platform(): Promise<string> { return callApi('iris.env', 'platform') as Promise<string>; },
    get language(): Promise<string> { return callApi('iris.env', 'language') as Promise<string>; },
  },

  context: {
    subscriptions,
    extensionPath: installPath,
    extensionId,
  },

  log: {
    debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
    info: (msg: string, ...args: unknown[]) => log('info', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => log('warn', msg, ...args),
    error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),
  },
};

// ─── Message handling from parent (ExtensionHost Process) ───

parentPort!.on('message', (msg: ExtHostMessage) => {
  switch (msg.type) {
    case 'api-response': {
      const pending = pendingCalls.get(msg.requestId!);
      if (pending) {
        pendingCalls.delete(msg.requestId!);
        if (msg.payload.error) {
          pending.reject(new Error(msg.payload.error.message));
        } else {
          pending.resolve(msg.payload.result);
        }
      }
      break;
    }

    case 'api-call': {
      // Host asking this worker to execute a local command/tool
      handleLocalExecution(msg as ExtHostApiCall);
      break;
    }

    case 'event': {
      // Broadcast event to listeners
      const listeners = eventListeners.get(msg.payload.eventName);
      if (listeners) {
        for (const listener of listeners) {
          try {
            listener(msg.payload.data);
          } catch (err) {
            log('error', `Event listener error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
      break;
    }

    case 'lifecycle': {
      if (msg.payload.action === 'deactivate') {
        deactivate();
      }
      break;
    }
  }
});

async function handleLocalExecution(msg: ExtHostApiCall): Promise<void> {
  const { requestId, payload } = msg;

  try {
    let result: unknown;

    if (payload.namespace === 'iris.commands' && payload.method === 'executeLocal') {
      const [commandId, ...args] = payload.args;
      const handler = localCommandHandlers.get(commandId as string);
      if (!handler) throw new Error(`Command "${commandId}" not registered in this extension`);
      result = await handler(...args);
    } else if (payload.namespace === 'iris.tools' && payload.method === 'executeLocal') {
      const [toolId, params] = payload.args;
      const handler = localToolHandlers.get(toolId as string);
      if (!handler) throw new Error(`Tool "${toolId}" not registered in this extension`);
      result = await handler(params);
    } else {
      throw new Error(`Unknown local execution: ${payload.namespace}.${payload.method}`);
    }

    parentPort!.postMessage({
      type: 'api-response',
      requestId,
      extensionId,
      payload: { result },
    } satisfies ExtHostApiResponse);
  } catch (err) {
    parentPort!.postMessage({
      type: 'api-response',
      requestId,
      extensionId,
      payload: { error: { code: 'EXECUTION_ERROR', message: err instanceof Error ? err.message : String(err) } },
    } satisfies ExtHostApiResponse);
  }
}

// ─── Extension lifecycle ───

async function activate(): Promise<void> {
  try {
    const mainPath = path.resolve(installPath, mainFile);
    const extensionModule = await import(mainPath);

    if (typeof extensionModule.activate === 'function') {
      await extensionModule.activate(irisApi.context);
    }

    // Make iris API available globally for the extension
    (globalThis as any).iris = irisApi;

    parentPort!.postMessage({
      type: 'lifecycle',
      extensionId,
      payload: { action: 'activated' },
    });

    log('info', `Extension activated: ${extensionId}`);
  } catch (err) {
    parentPort!.postMessage({
      type: 'lifecycle',
      extensionId,
      payload: {
        action: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

async function deactivate(): Promise<void> {
  try {
    const mainPath = path.resolve(installPath, mainFile);
    try {
      const extensionModule = await import(mainPath);
      if (typeof extensionModule.deactivate === 'function') {
        await extensionModule.deactivate();
      }
    } catch {
      // Module might not be loaded
    }

    // Dispose all subscriptions
    for (const sub of subscriptions) {
      try {
        sub.dispose();
      } catch {
        // ignore
      }
    }
    subscriptions.length = 0;
    eventListeners.clear();

    parentPort!.postMessage({
      type: 'lifecycle',
      extensionId,
      payload: { action: 'deactivated' },
    });
  } catch (err) {
    log('error', `Deactivation error: ${err instanceof Error ? err.message : String(err)}`);
    parentPort!.postMessage({
      type: 'lifecycle',
      extensionId,
      payload: { action: 'deactivated' },
    });
  }
}

// Start activation
activate();
