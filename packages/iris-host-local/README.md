# iris-host-local

The **open-source local host** for the [Iris workflow engine](../iris-engine).
Run a local server, build workflows in your browser, and execute them with your
own AI API keys (**BYOK**). No managed server, database, GCS, or billing
required — a fully self-hosted experience.

---

## Quick start

### Option A — `npx` (once published to npm)

```bash
npx iris-flow
```

### Option B — from a clone of this repo

```bash
pnpm install
pnpm build:packages          # builds iris-nodes → iris-engine → iris-editor → iris-host-local
pnpm iris-flow               # or: node packages/iris-host-local/dist/cli.js
```

Either way you'll see:

```
  iris-flow running at http://localhost:4747
  BYOK providers: openai, google, anthropic, xai, ...
  Data dir: /Users/you/.iris-flow/data
```

Open the printed URL. The browser shows the workflow editor; the server serves
both the UI (`/`) and the API (`/api/iris/*`) on the same origin. Everything runs
on your machine and generated media is written to local disk.

> First run with no keys still works — you can build and save workflows. Add keys
> (below) when you want to actually execute generator nodes.

---

## Bring your own keys (BYOK)

Provider API keys are read from the **environment** — the standard self-host way.
They are **never** written to disk by this tool and never stored in any config
file. Put them in a `.env` file (and keep it out of version control).

Copy [`.env.example`](./.env.example) to `.env` and fill in only what you use:

```dotenv
# LLM / text
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
XAI_API_KEY=...
PERPLEXITY_API_KEY=...
DEEPSEEK_API_KEY=...

# Image / video / audio
STABILITY_API_KEY=...
REPLICATE_API_KEY=...
IDEOGRAM_API_KEY=...
RECRAFT_API_KEY=...
RUNWAY_API_KEY=...
LUMA_API_KEY=...
PIKA_API_KEY=...
ELEVENLABS_API_KEY=...
SUNO_API_KEY=...
```

### Where `.env` is loaded from

Files are read in this order; the **first** file to define a variable wins, and a
variable already set in your real environment beats all of them:

1. `./.env` — the directory you launch from (the usual place)
2. `~/.iris-flow/.env` — global, per-user keys
3. `<dataDir>/.env` — when you point `IRIS_FLOW_DATA_DIR` at a custom location

The startup banner lists which providers it detected a key for (`BYOK providers:
…`), so you can confirm your keys were picked up.

---

## Configuration reference

Non-secret settings (port / host / data dir / browser) can come from environment
variables or a small JSON file. Precedence: **env var > `./iris-flow.json` >
`~/.iris-flow/config.json` > default.**

| Setting | Env var | JSON key | Default |
|---|---|---|---|
| HTTP port | `PORT` | `port` | `4747` |
| Bind host | `IRIS_FLOW_HOST` | `host` | `127.0.0.1` |
| Data directory | `IRIS_FLOW_DATA_DIR` | `dataDir` | `~/.iris-flow/data` |
| Open browser on start | `IRIS_FLOW_NO_OPEN=1` disables | `openBrowser` | `true` |

Example `~/.iris-flow/config.json` (settings only — **no keys here**):

```json
{
  "port": 4800,
  "host": "127.0.0.1",
  "dataDir": "/Users/you/iris-data",
  "openBrowser": false
}
```

Example one-off run on a different port without opening a browser:

```bash
PORT=4800 IRIS_FLOW_NO_OPEN=1 npx iris-flow
```

> **Binding to `0.0.0.0`** exposes the server (which has **no authentication**) to
> your network. Keep the default `127.0.0.1` unless you understand the exposure,
> and never put it on a public interface without a proxy + auth in front.

---

## HTTP endpoints

Everything is served on one origin (default `http://localhost:4747`):

| Path | Purpose |
|---|---|
| `GET /` | The workflow editor SPA |
| `GET /api/health` | `{ status, providers }` — liveness + configured BYOK providers |
| `… /api/iris/workflows` | Workflow CRUD (`GET` list, `POST` create, `GET/PUT/DELETE /:id`, `POST /:id/clone`) |
| `PUT/DELETE /api/iris/workflows/:id/nodes` · `…/edges` | Graph editing |
| `POST /api/iris/workflows/:id/execute` | Run a workflow |
| `… /api/iris/workflows/:id/validate` | Structural + semantic validation |
| `GET /api/iris/executions/:id` · `…/nodes` · `…/logs` · `POST …/cancel` | Execution status / logs / cancel |
| `… /api/iris/workflows/:id/schedule` · `…/schedule/preview` · `/api/iris/schedule/presets` | Cron scheduling |
| `… /api/iris/batch` (+ `/:id/{start,pause,resume,cancel,retry,status,rows}`) | Batch jobs |
| `GET /public/*` · `GET /api/iris/assets/:id/download` | Generated media |

Quick smoke test:

```bash
curl http://localhost:4747/api/health
curl -X POST http://localhost:4747/api/iris/workflows \
  -H 'Content-Type: application/json' -d '{"name":"my first workflow"}'
```

---

## Data on disk

Everything lives under the data dir (default `~/.iris-flow/data`):

```
<dataDir>/
├── workflows/<workflowId>.json     graph + metadata + run counters
├── executions/<executionId>.json   status + per-node results + logs
├── assets/<assetId>/               generated media + meta.json sidecar
├── public/                         temp-public + storePublic media (served at /public)
├── batch/<jobId>.json              batch job state
└── daemon.json                     daemon lockfile (desktop background mode)
```

Back up or delete this directory to back up or reset your local Iris state. No
external database is involved.

---

## How it relates to the engine

`iris-engine` is server-independent: it runs node graphs against pluggable host
ports. This package supplies the **local** implementations:

| Engine port | Cloud (Parallax) | Local (this package) |
|---|---|---|
| `WorkflowStore` | Prisma / Postgres | `LocalWorkflowStore` — JSON files on disk |
| `NodeExecutorHost` | GCS + token plans + Whisper | `createLocalNodeHost` — disk + no-op meter + BYOK Whisper |
| temp-public uploader | GCS signed URLs | local static server URL |

### Embed it programmatically

The engine assembly mirrors the cloud's `createWorkflowEngine`:

```ts
import { createLocalWorkflowEngine } from 'iris-host-local';

const { engine, store } = createLocalWorkflowEngine({
  dataDir: '~/.iris-flow/data',
  getPublicBaseUrl: () => 'http://localhost:4747',
});
```

Or stand up the full HTTP server yourself:

```ts
import { loadConfig, buildServer, publicBaseUrl } from 'iris-host-local';

const config = await loadConfig();              // loads .env + settings
const server = await buildServer(config);
await server.listen({ port: config.port, host: config.host });
console.log(`iris-flow on ${publicBaseUrl(config.host, config.port)}`);
```

This is exactly how the [desktop app](../../iris/desktop) embeds the host — it
runs `buildServer` (or spawns the `iris-host-local/daemon` as a detached
background process so batch jobs and schedules keep running after the window
closes).

## The editor

The browser UI is the [`iris-editor`](../iris-editor) package — the same
ReactFlow editor used by `iris/web`, with palette, canvas, per-node config from
the `iris-nodes` catalog, run + live node status. The host resolves its built
`dist/` and serves it at `/`.

---

## Limitations

- **No authentication.** Anyone who can reach the port has full access. Designed
  for `localhost`; put a reverse proxy + auth in front before exposing it.
- **ffmpeg / Google Sheets nodes are unsupported here** — `EDIT_VIDEO_MERGE`,
  `EDIT_VIDEO_OVERLAY`, `EDIT_AUDIO_SEPARATE`, `OUTPUT_SHEET_APPEND` return
  `NODE_NOT_SUPPORTED` (501); the engine intentionally carries no heavy deps. A
  host can supply them via the engine's `handlers` seam (the desktop app does).
- **External media inputs need a tunnel.** Some providers (e.g. Kling, Luma)
  fetch input URLs from *their* servers, which can't reach `http://localhost`.
  Use a tunnel (ngrok) or a cloud bucket for those nodes. Text/image generation
  is unaffected.

---

## Troubleshooting

- **`EADDRINUSE: address already in use`** — another process holds the port.
  Run on another port: `PORT=4800 npx iris-flow`.
- **Banner shows no BYOK providers** — your `.env` wasn't found. Confirm it's in
  the directory you launched from (or `~/.iris-flow/.env`) and that lines look
  like `OPENAI_API_KEY=sk-...` with no quotes needed.
- **Editor page is blank / 404** — build the packages first
  (`pnpm build:packages`); the host serves `iris-editor`'s built `dist/`.
- **A generator node fails with "Provider and model must be configured"** — the
  node is missing a provider/model selection or the corresponding key isn't set.

Licensed under the [Sustainable Use License](./LICENSE.md) (fair-code).
