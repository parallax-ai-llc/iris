/**
 * Local Fastify server — the REST API the workflow editor calls, plus static
 * serving of the editor itself.
 *
 * No authentication (single local user). Endpoints mirror the cloud's
 * `/api/iris/*` surface closely enough that the same editor can talk to either.
 * Workflows/executions are read straight from the `LocalWorkflowStore`; runs go
 * through the `WorkflowEngine` (execute/cancel). Schedule/webhook triggers are
 * out of scope for the local MVP — manual execution only.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import {
  GraphTraverser,
  API_KEY_ENV_MAPPING,
  type ExecutionOptions,
  type EngineWorkflowNodeRow,
  type EngineWorkflowEdgeRow,
} from 'iris-engine';
import type { ResolvedConfig } from './config.js';
import { publicBaseUrl } from './config.js';
import { createLocalWorkflowEngine } from './engine-factory.js';
import { registerMediaServer, readLocalAsset } from './local-media-server.js';
import { createLocalGenerator, type GenerateAssetInput } from './local-generate.js';
import { createLocalImporter, type ImportAssetInput } from './local-import.js';
import { validateWorkflowSemantics } from './validate.js';
import {
  LocalScheduler,
  CRON_PRESETS,
  validateCron,
  nextRunTime,
  supportedTimezones,
} from './scheduler.js';
import { BatchManager, type CreateBatchInput } from './batch.js';

const LOCAL_USER_ID = 'local';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Optional host integration hooks (used by the desktop daemon). */
export interface BuildServerOptions {
  /**
   * When set, registers a loopback-only `POST /api/iris/runtime/keys` endpoint
   * that updates provider API keys in `process.env` at runtime, guarded by this
   * shared token. The desktop app owns the keys (encrypted via Electron
   * safeStorage) and pushes them to the detached daemon — which, as a plain Node
   * process, can't decrypt them itself. Plain `npx iris-flow` omits this (keys
   * come from `.env`).
   */
  runtimeKeyToken?: string;
}

/** Build (but don't start) the local server for the given resolved config. */
export async function buildServer(
  config: ResolvedConfig,
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 100 * 1024 * 1024 });
  await app.register(fastifyCors, { origin: true });

  const baseUrl = publicBaseUrl(config.host, config.port);
  const { engine, store } = createLocalWorkflowEngine({
    dataDir: config.dataDir,
    getPublicBaseUrl: () => baseUrl,
    userId: LOCAL_USER_ID,
  });
  const traverser = new GraphTraverser();

  // Cron scheduler — fires due workflows every minute (see scheduler.ts).
  const scheduler = new LocalScheduler(store, engine, LOCAL_USER_ID);
  scheduler.start();
  app.addHook('onClose', async () => {
    scheduler.stop();
  });

  // Batch execution — run a workflow once per data row (see batch.ts).
  const batch = new BatchManager(config.dataDir, engine, store, LOCAL_USER_ID);

  await registerMediaServer(app, {
    dataDir: config.dataDir,
    getPublicBaseUrl: () => baseUrl,
  });

  // Single-asset generation (desktop image/video galleries) — runs one
  // GEN_TEXT_TO_IMAGE / GEN_TEXT_TO_VIDEO node through the engine with BYOK and
  // stores the result on disk (then visible via the asset list/single routes).
  const generateAsset = createLocalGenerator({
    dataDir: config.dataDir,
    store,
    getPublicBaseUrl: () => baseUrl,
    userId: LOCAL_USER_ID,
  });
  app.post<{ Body: GenerateAssetInput }>(
    '/api/iris/assets/generate',
    async (req, reply) => {
      const result = await generateAsset(req.body ?? {});
      if (result.status !== 'completed') {
        return reply.code(400).send({
          error: result.error?.message ?? 'Generation failed',
          code: result.error?.code,
        });
      }
      const assetId = result.assets[0]?.id;
      const asset = assetId
        ? await readLocalAsset(config.dataDir, baseUrl, assetId)
        : null;
      if (!asset) {
        return reply
          .code(500)
          .send({ error: 'Generation produced no stored asset' });
      }
      return asset;
    },
  );

  // Import a user's local file into the disk asset store (gallery "Upload").
  const importAsset = createLocalImporter({
    dataDir: config.dataDir,
    store,
    getPublicBaseUrl: () => baseUrl,
    userId: LOCAL_USER_ID,
  });
  app.post<{ Body: ImportAssetInput }>(
    '/api/iris/assets/import',
    async (req, reply) => {
      if (!req.body?.base64) {
        return reply.code(400).send({ error: 'Missing file data' });
      }
      const result = await importAsset(req.body);
      if (!result.success || !result.asset) {
        return reply
          .code(400)
          .send({ error: result.error ?? 'Import failed' });
      }
      const asset = await readLocalAsset(config.dataDir, baseUrl, result.asset.id);
      if (!asset) {
        return reply.code(500).send({ error: 'Import produced no stored asset' });
      }
      return asset;
    },
  );

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/api/health', async () => ({
    status: 'ok',
    providers: config.configuredProviders,
  }));

  // ── Runtime BYOK key push (desktop daemon only, token-guarded) ──────────────
  // The desktop app pushes provider keys here when the user sets/clears them in
  // Settings, so a long-lived daemon picks up changes without a restart. Keys
  // are loopback-only + token-guarded so other local processes can't inject them.
  if (options.runtimeKeyToken) {
    app.post<{ Body: { keys?: Record<string, string | null> } }>(
      '/api/iris/runtime/keys',
      async (req, reply) => {
        if (req.headers['x-iris-daemon-token'] !== options.runtimeKeyToken) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        const keys = req.body?.keys ?? {};
        for (const [envVar, value] of Object.entries(keys)) {
          if (value) process.env[envVar] = value;
          else delete process.env[envVar];
        }
        // Recompute which providers are configured (cosmetic / health surface).
        config.configuredProviders = Object.entries(API_KEY_ENV_MAPPING)
          .filter(([, envVar]) => !!process.env[envVar])
          .map(([provider]) => provider);
        return { ok: true, providers: config.configuredProviders };
      },
    );
  }

  // ── Workflows ───────────────────────────────────────────────────────────────
  app.get('/api/iris/workflows', async () => {
    return { workflows: await store.listWorkflows() };
  });

  app.post<{
    Body: {
      name?: string;
      nodes?: EngineWorkflowNodeRow[];
      edges?: EngineWorkflowEdgeRow[];
    };
  }>('/api/iris/workflows', async req => {
    const wf = await store.createWorkflow({
      name: req.body?.name,
      userId: LOCAL_USER_ID,
      nodes: req.body?.nodes,
      edges: req.body?.edges,
    });
    return { workflow: wf };
  });

  app.get<{ Params: { id: string } }>(
    '/api/iris/workflows/:id',
    async (req, reply) => {
      const wf = await store.getWorkflow(req.params.id);
      if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
      return { workflow: wf };
    },
  );

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      status: string;
      nodes: EngineWorkflowNodeRow[];
      edges: EngineWorkflowEdgeRow[];
      outputBucket: Record<string, unknown> | null;
      outputPath: string | null;
    }>;
  }>('/api/iris/workflows/:id', async (req, reply) => {
    const wf = await store.updateWorkflow(req.params.id, req.body ?? {});
    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
    return { workflow: wf };
  });

  app.delete<{ Params: { id: string } }>(
    '/api/iris/workflows/:id',
    async (req, reply) => {
      const ok = await store.deleteWorkflow(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'Workflow not found' });
      return { success: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/iris/workflows/:id/clone',
    async (req, reply) => {
      const wf = await store.cloneWorkflow(req.params.id);
      if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
      return { workflow: wf };
    },
  );

  // ── Nodes / edges (editor bulk save) ────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: { nodes: EngineWorkflowNodeRow[] } }>(
    '/api/iris/workflows/:id/nodes',
    async (req, reply) => {
      const wf = await store.setNodes(req.params.id, req.body?.nodes ?? []);
      if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
      return { workflow: wf };
    },
  );

  app.delete<{ Params: { id: string }; Body: { nodeIds: string[] } }>(
    '/api/iris/workflows/:id/nodes',
    async (req, reply) => {
      const wf = await store.deleteNodes(req.params.id, req.body?.nodeIds ?? []);
      if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
      return { workflow: wf };
    },
  );

  app.put<{ Params: { id: string }; Body: { edges: EngineWorkflowEdgeRow[] } }>(
    '/api/iris/workflows/:id/edges',
    async (req, reply) => {
      const wf = await store.setEdges(req.params.id, req.body?.edges ?? []);
      if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
      return { workflow: wf };
    },
  );

  app.delete<{ Params: { id: string }; Body: { edgeIds: string[] } }>(
    '/api/iris/workflows/:id/edges',
    async (req, reply) => {
      const wf = await store.deleteEdges(req.params.id, req.body?.edgeIds ?? []);
      if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
      return { workflow: wf };
    },
  );

  // ── Execute / validate ──────────────────────────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { inputs?: Record<string, unknown>; trigger?: ExecutionOptions['trigger'] };
  }>('/api/iris/workflows/:id/execute', async (req, reply) => {
    const wf = await store.getWorkflow(req.params.id);
    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
    try {
      const execution = await engine.execute(req.params.id, LOCAL_USER_ID, {
        inputs: req.body?.inputs,
        trigger: req.body?.trigger ?? { type: 'manual' },
      });
      return {
        executionId: execution.id,
        status: execution.status,
        message: '',
      };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Execution failed',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body?: {
      nodes?: Array<{
        nodeId: string;
        type: string;
        label?: string;
        config?: Record<string, unknown>;
      }>;
      edges?: EngineWorkflowEdgeRow[];
    };
  }>('/api/iris/workflows/:id/validate', async (req, reply) => {
    const stored = await store.getWorkflow(req.params.id);
    if (!stored) return reply.code(404).send({ error: 'Workflow not found' });

    // The editor posts its current (possibly unsaved) graph; fall back to the
    // stored graph when no body is provided.
    const bodyNodes = req.body?.nodes;
    const nodes: typeof stored.nodes = bodyNodes
      ? (bodyNodes.map(n => ({
          id: n.nodeId,
          nodeId: n.nodeId,
          type: n.type,
          label: n.label ?? '',
          config: n.config ?? {},
          inputPorts: [],
          outputPorts: [],
        })) as unknown as typeof stored.nodes)
      : stored.nodes;
    const edges = req.body?.edges ?? stored.edges;

    if (nodes.length === 0) {
      return {
        valid: false,
        errors: ['Workflow is empty — add at least one node.'],
        warnings: [],
      };
    }

    const graph = traverser.buildGraph(
      nodes.map(n => ({
        id: n.id || n.nodeId,
        nodeId: n.nodeId,
        type: n.type,
        config: n.config,
        provider: null,
      })),
      edges,
    );
    const structural = traverser.validateGraph(graph);
    const semantic = validateWorkflowSemantics({ ...stored, nodes, edges });
    const errors = [...structural.errors, ...semantic];
    return { valid: errors.length === 0, errors, warnings: [] };
  });

  // ── Schedule (cron) ─────────────────────────────────────────────────────────
  // Static presets + timezones for the editor's schedule picker.
  app.get('/api/iris/schedule/presets', async () => ({
    presets: CRON_PRESETS,
    timezones: supportedTimezones(),
  }));

  app.get<{ Params: { id: string } }>(
    '/api/iris/workflows/:id/schedule',
    async (req, reply) => {
      const wf = await store.getWorkflow(req.params.id);
      if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
      return {
        enabled: wf.scheduleEnabled ?? false,
        cron: wf.scheduleCron ?? null,
        timezone: wf.scheduleTimezone ?? 'UTC',
        nextRun: wf.scheduleNextRun ?? null,
        lastRun: wf.scheduleLastRun ?? null,
      };
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { enabled?: boolean; cron?: string | null; timezone?: string };
  }>('/api/iris/workflows/:id/schedule', async (req, reply) => {
    const wf = await store.getWorkflow(req.params.id);
    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });

    const enabled = req.body?.enabled ?? wf.scheduleEnabled ?? false;
    const cron =
      req.body?.cron !== undefined ? req.body.cron : (wf.scheduleCron ?? null);
    const timezone =
      req.body?.timezone ?? wf.scheduleTimezone ?? 'UTC';

    if (enabled) {
      if (!cron) {
        return reply
          .code(400)
          .send({ error: 'A cron expression is required to enable scheduling' });
      }
      const check = validateCron(cron, timezone, 1);
      if (!check.valid) {
        return reply.code(400).send({ error: check.error ?? 'Invalid cron' });
      }
    }

    const next = enabled && cron ? nextRunTime(cron, timezone) : null;
    const updated = await store.updateSchedule(req.params.id, {
      enabled,
      cron,
      timezone,
      nextRun: next ? next.toISOString() : null,
    });
    return {
      enabled: updated?.scheduleEnabled ?? false,
      cron: updated?.scheduleCron ?? null,
      timezone: updated?.scheduleTimezone ?? 'UTC',
      nextRun: updated?.scheduleNextRun ?? null,
      lastRun: updated?.scheduleLastRun ?? null,
    };
  });

  app.post<{
    Params: { id: string };
    Body: { cron: string; timezone?: string; count?: number };
  }>('/api/iris/workflows/:id/schedule/preview', async req => {
    const { cron, timezone = 'UTC', count = 5 } = req.body ?? { cron: '' };
    return validateCron(cron, timezone, count);
  });

  // ── Batch ─────────────────────────────────────────────────────────────────
  app.get('/api/iris/batch', async () => ({ jobs: await batch.listJobs() }));

  app.post<{ Body: CreateBatchInput }>('/api/iris/batch', async (req, reply) => {
    const body = req.body;
    if (!body?.workflowId || !Array.isArray(body?.rows)) {
      return reply
        .code(400)
        .send({ error: 'workflowId and rows[] are required' });
    }
    const wf = await store.getWorkflow(body.workflowId);
    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
    const job = await batch.createJob(body);
    return { job };
  });

  app.get<{ Params: { id: string } }>(
    '/api/iris/batch/:id',
    async (req, reply) => {
      const job = await batch.getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: 'Batch job not found' });
      return { job };
    },
  );

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      concurrency: number;
      stopOnError: boolean;
      rowDelayMs: number;
      maxRetries: number;
    }>;
  }>('/api/iris/batch/:id', async (req, reply) => {
    const job = await batch.updateJob(req.params.id, req.body ?? {});
    if (!job) return reply.code(404).send({ error: 'Batch job not found' });
    return { job };
  });

  app.delete<{ Params: { id: string } }>(
    '/api/iris/batch/:id',
    async (req, reply) => {
      const ok = await batch.deleteJob(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'Batch job not found' });
      return { success: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/iris/batch/:id/status',
    async (req, reply) => {
      const status = await batch.jobStatus(req.params.id);
      if (!status) return reply.code(404).send({ error: 'Batch job not found' });
      return status;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/iris/batch/:id/rows',
    async (req, reply) => {
      const job = await batch.getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: 'Batch job not found' });
      return { rows: job.rows };
    },
  );

  // Lifecycle actions share a shape: { job } or 404.
  const batchAction =
    (fn: (id: string) => Promise<unknown>) =>
    async (
      req: { params: { id: string } },
      reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const job = await fn(req.params.id);
      if (!job) return reply.code(404).send({ error: 'Batch job not found' });
      return { job };
    };

  app.post<{ Params: { id: string } }>(
    '/api/iris/batch/:id/start',
    batchAction(id => batch.start(id)),
  );
  app.post<{ Params: { id: string } }>(
    '/api/iris/batch/:id/pause',
    batchAction(id => batch.pause(id)),
  );
  app.post<{ Params: { id: string } }>(
    '/api/iris/batch/:id/resume',
    batchAction(id => batch.resume(id)),
  );
  app.post<{ Params: { id: string } }>(
    '/api/iris/batch/:id/cancel',
    batchAction(id => batch.cancel(id)),
  );
  app.post<{ Params: { id: string } }>(
    '/api/iris/batch/:id/retry',
    batchAction(id => batch.retryFailed(id)),
  );

  // ── Executions ──────────────────────────────────────────────────────────────
  app.get<{ Querystring: { workflowId?: string } }>(
    '/api/iris/executions',
    async req => {
      return { executions: await store.listExecutions(req.query?.workflowId) };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/iris/executions/:id/status',
    async (req, reply) => {
      const exec = await store.getExecution(req.params.id);
      if (!exec) return reply.code(404).send({ error: 'Execution not found' });
      return {
        id: exec.id,
        workflowId: exec.workflowId,
        status: exec.status,
        startedAt: exec.startedAt,
        completedAt: exec.completedAt,
        outputAssets: exec.outputAssets,
        totalTokensUsed: exec.totalTokensUsed,
        estimatedCost: exec.estimatedCost,
        errorMessage: exec.errorMessage,
        errorNodeId: exec.errorNodeId,
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/iris/executions/:id/nodes',
    async (req, reply) => {
      const exec = await store.getExecution(req.params.id);
      if (!exec) return reply.code(404).send({ error: 'Execution not found' });
      return { nodeResults: Object.values(exec.nodeResults) };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/iris/executions/:id/logs',
    async (req, reply) => {
      const exec = await store.getExecution(req.params.id);
      if (!exec) return reply.code(404).send({ error: 'Execution not found' });
      return { logs: exec.logs };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/iris/executions/:id/cancel',
    async req => {
      const cancelled = await engine.cancel(req.params.id);
      return { success: cancelled };
    },
  );

  // ── Token costs (no-op locally — unmetered) ─────────────────────────────────
  app.get('/api/iris/token-costs', async () => ({ costs: {}, unmetered: true }));

  // ── Editor static serving ──────────────────────────────────────────────────
  // Serve the built `iris-editor` SPA. Resolve its dist via the package (the
  // forward-looking shared editor), falling back to a bundled `web/` dir, then
  // a minimal landing page if neither is built.
  const editorDir = await resolveEditorDir();

  if (editorDir) {
    await app.register(fastifyStatic, {
      root: editorDir,
      prefix: '/',
      // This (second) registration decorates `reply.sendFile` for the SPA
      // fallback below; the media-server's `/public/` registration set
      // decorateReply:false to avoid the duplicate-decorator error.
      decorateReply: true,
    });
    app.setNotFoundHandler((req, reply) => {
      // Real 404 for API + static asset paths; SPA fallback for everything else.
      const url = req.raw.url ?? '';
      if (
        url.startsWith('/api/') ||
        url.startsWith('/public/') ||
        url.startsWith('/assets/')
      ) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html', editorDir);
    });
  } else {
    app.get('/', async (_req, reply) => {
      reply.header('Content-Type', 'text/html');
      return reply.send(landingPage(config));
    });
  }

  return app;
}

/** Locate the built editor SPA: the `iris-editor` package's dist, or a bundled
 *  `web/` dir next to this package. Returns null if neither has an index.html. */
async function resolveEditorDir(): Promise<string | null> {
  const candidates: string[] = [];
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve('iris-editor/package.json');
    candidates.push(path.join(path.dirname(pkg), 'dist'));
  } catch {
    // iris-editor not installed — fall back to the bundled web/ dir.
  }
  candidates.push(path.resolve(__dirname, '..', 'web'));

  for (const dir of candidates) {
    const ok = await fs
      .access(path.join(dir, 'index.html'))
      .then(() => true)
      .catch(() => false);
    if (ok) return dir;
  }
  return null;
}

function landingPage(config: ResolvedConfig): string {
  const providers = config.configuredProviders.length
    ? config.configuredProviders.join(', ')
    : 'none configured';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>iris-flow</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0A0A0A; color: #F4F4F5;
             display: grid; place-items: center; min-height: 100vh; margin: 0; }
      .card { max-width: 560px; padding: 2rem; line-height: 1.6; }
      code { background: #1c1c1e; padding: 0.15em 0.4em; border-radius: 6px; }
      a { color: #9CA3AF; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>iris-flow</h1>
      <p>The local workflow engine is running, but the <code>iris-editor</code>
         build wasn't found. Build it with
         <code>pnpm --filter iris-editor build</code> and reload.</p>
      <p>The REST API is live under <code>/api/iris/*</code> — create a workflow,
         add nodes/edges, then <code>POST /api/iris/workflows/:id/execute</code>.</p>
      <p>Configured providers (BYOK): <strong>${providers}</strong></p>
      <p>Health: <a href="/api/health">/api/health</a></p>
    </div>
  </body>
</html>`;
}
