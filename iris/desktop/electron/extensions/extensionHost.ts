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

  /** Start the extension host process */
  async start(): Promise<void> {
    if (this.process) return;

    const hostScript = path.join(__dirname, 'extensionHostProcess.mjs');

    // Skip if the host script hasn't been built yet (dev mode)
    const { existsSync } = await import('fs');
    if (!existsSync(hostScript)) {
      console.warn('[ExtHost] extensionHostProcess.mjs not found, skipping extension host');
      return;
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

    // Send shutdown signal
    this.process.send({ type: 'lifecycle', payload: { action: 'shutdown' } });

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
    this.process.send(msg);
  }

  /** Activate an extension in the host */
  async activateExtension(extensionId: string, installPath: string, mainFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Activation timeout for ${extensionId}`)), 30000);

      const onMessage = (msg: ExtHostMessage) => {
        if (
          msg.type === 'lifecycle' &&
          msg.extensionId === extensionId
        ) {
          clearTimeout(timeout);
          this.process?.removeListener('message', onMessage);

          if (msg.payload.action === 'activated') {
            resolve();
          } else if (msg.payload.action === 'error') {
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
        } as any,
      });
    });
  }

  /** Deactivate an extension in the host */
  async deactivateExtension(extensionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // Don't block on deactivation timeout
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
