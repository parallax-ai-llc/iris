/**
 * Extension Host — manages a forked child process that runs extension workers.
 * Runs in the Electron Main Process.
 *
 * Architecture:
 *   Main Process → fork() → ExtensionHost Process → Worker Threads (per extension)
 */
import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import type {
  ExtHostMessage,
  ExtHostApiCall,
  ExtHostApiResponse,
  ExtHostLifecycle,
  ExtHostContribution,
  ExtHostLog,
} from './ipcProtocol';
import { RESOURCE_LIMITS } from './ipcProtocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ExtensionHost extends EventEmitter {
  private process: ChildProcess | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private requestCounter = 0;
  private generationCounter = 0;

  /** Start the extension host process */
  async start(): Promise<void> {
    if (this.process) return;

    const hostScript = path.join(__dirname, 'extensionHostProcess.mjs');

    // The host script is a build output (vite multi-entry). A missing file is a
    // build/packaging bug — fail loudly instead of silently disabling extensions.
    const { existsSync } = await import('fs');
    if (!existsSync(hostScript)) {
      const error = new Error(
        `[ExtHost] extensionHostProcess.mjs not found at ${hostScript} — the extension host was not built (check vite.config.ts electron main entries)`
      );
      console.error(error.message);
      throw error;
    }

    this.process = fork(hostScript, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        IRIS_EXT_HOST: '1',
      },
      execArgv: [
        `--max-old-space-size=${Math.floor(RESOURCE_LIMITS.WORKER_MEMORY_LIMIT / (1024 * 1024)) * RESOURCE_LIMITS.MAX_CONCURRENT_WORKERS}`,
      ],
    });

    this.process.on('message', (msg: ExtHostMessage) => this.handleMessage(msg));

    this.process.on('exit', (code) => {
      console.warn(`[ExtHost] Process exited with code ${code}`);
      this.process = null;
      this.rejectAllPending('Extension host process exited');
    });

    this.process.on('error', (err) => {
      console.error('[ExtHost] Process error:', err);
    });

    // Forward stdout/stderr (remove any prior listeners to prevent duplicates on restart)
    this.process.stdout?.removeAllListeners('data');
    this.process.stderr?.removeAllListeners('data');
    this.process.stdout?.on('data', (data: Buffer) => {
      console.log('[ExtHost:stdout]', data.toString().trim());
    });
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[ExtHost:stderr]', data.toString().trim());
    });

    // Wait for ready signal
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('ExtensionHost start timeout')), 10000);

      const onMessage = (msg: any) => {
        if (msg?.type === 'lifecycle' && msg?.payload?.action === 'ready') {
          clearTimeout(timeout);
          this.process?.removeListener('message', onMessage);
          resolve();
        }
      };

      this.process?.on('message', onMessage);
    });

    console.log('[ExtHost] Started successfully');
  }

  /** Stop the extension host process */
  async stop(): Promise<void> {
    if (!this.process) return;

    this.rejectAllPending('Extension host shutting down');

    // Send shutdown signal. `connected` guards the IPC channel: once it is
    // closed (child already gone / exiting), send() emits an async
    // "write EPIPE" error that pollutes stderr on every app quit.
    if (this.process.connected) {
      this.process.send({ type: 'lifecycle', payload: { action: 'shutdown' } });
    }

    // Wait for graceful exit, then force kill
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.process?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.process?.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
  }

  /** Send a message to the host process */
  sendMessage(msg: ExtHostMessage): void {
    if (!this.process) {
      console.warn('[ExtHost] Cannot send message — process not running');
      return;
    }
    // Same EPIPE guard as stop(): the child can die between our last check and
    // this send (crash, shutdown race), leaving a live object with a dead IPC
    // channel.
    if (!this.process.connected) {
      console.warn('[ExtHost] Cannot send message — IPC channel is closed');
      return;
    }
    this.process.send(msg);
  }

  /** Activate an extension in the host */
  async activateExtension(extensionId: string, installPath: string, mainFile: string): Promise<void> {
    // Identifies this activation attempt. The host process echoes it on every
    // lifecycle message the worker it spawns emits, so a predecessor still
    // dying under the same extensionId cannot settle this promise.
    const generation = `gen_${++this.generationCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.process?.removeListener('message', onMessage);
      };

      const timeout = setTimeout(() => {
        this.process?.removeListener('message', onMessage);
        reject(new Error(`Activation timeout for ${extensionId}`));
      }, 30000);

      const onMessage = (msg: ExtHostMessage) => {
        if (
          msg.type === 'lifecycle' &&
          msg.extensionId === extensionId &&
          // extensionId alone is not identity: during an upgrade the superseded
          // worker is still alive and emits under the same id. Only the
          // generation we just asked for may settle this promise.
          msg.payload.generation === generation
        ) {
          // Only settle on terminal actions — other lifecycle messages for this
          // extension (e.g. echoes of 'activate') must not tear down the
          // listener, or the promise would hang until timeout.
          if (msg.payload.action === 'activated') {
            cleanup();
            resolve();
          } else if (msg.payload.action === 'error') {
            cleanup();
            reject(new Error(msg.payload.error || 'Activation failed'));
          }
        }
      };

      this.process?.on('message', onMessage);

      this.sendMessage({
        type: 'lifecycle',
        extensionId,
        payload: {
          action: 'activate',
          installPath,
          mainFile,
          generation,
        } as any,
      });
    });
  }

  /** Deactivate an extension in the host */
  async deactivateExtension(extensionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Don't block on deactivation timeout — but drop the listener too, or a
        // worker reporting 'deactivated' minutes later still runs it, and the
        // listeners pile up on the host process across every upgrade.
        this.process?.removeListener('message', onMessage);
        resolve();
      }, 5000);

      const onMessage = (msg: ExtHostMessage) => {
        if (
          msg.type === 'lifecycle' &&
          msg.extensionId === extensionId &&
          msg.payload.action === 'deactivated'
        ) {
          clearTimeout(timeout);
          this.process?.removeListener('message', onMessage);
          resolve();
        }
      };

      this.process?.on('message', onMessage);

      this.sendMessage({
        type: 'lifecycle',
        extensionId,
        payload: { action: 'deactivate' },
      });
    });
  }

  /** Execute a command and return the result */
  async executeCommand(commandId: string, args?: unknown[]): Promise<unknown> {
    return this.callApi('*', 'iris.commands', 'execute', [commandId, ...(args || [])]);
  }

  /** Execute a tool and return the result */
  async executeTool(toolId: string, params: unknown): Promise<unknown> {
    return this.callApi('*', 'iris.tools', 'execute', [toolId, params]);
  }

  // ─── Private ───

  private async callApi(extensionId: string, namespace: string, method: string, args: unknown[]): Promise<unknown> {
    const requestId = `req_${++this.requestCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`API call timeout: ${namespace}.${method}`));
      }, RESOURCE_LIMITS.ASYNC_API_TIMEOUT);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      this.sendMessage({
        type: 'api-call',
        requestId,
        extensionId,
        payload: { namespace, method, args },
      });
    });
  }

  private handleMessage(msg: ExtHostMessage): void {
    switch (msg.type) {
      case 'api-call':
        // Extension calling iris.* API → forward to Main Process handlers
        this.emit('api-call', msg);
        break;

      case 'api-response': {
        // Response from a command/tool execution
        const pending = this.pendingRequests.get(msg.requestId!);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.requestId!);
          if (msg.payload.error) {
            pending.reject(new Error(msg.payload.error.message));
          } else {
            pending.resolve(msg.payload.result);
          }
        }
        break;
      }

      case 'contribution':
        this.emit('contribution', msg);
        break;

      case 'log':
        this.emit('log', msg);
        break;

      case 'lifecycle':
        // Lifecycle events are handled by specific listeners in activate/deactivate
        break;
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }
}
