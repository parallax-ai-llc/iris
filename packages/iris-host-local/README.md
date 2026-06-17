# iris-host-local

The **open-source local host** for the [Iris workflow engine](../iris-engine).
Run a local server, build workflows in your browser, and execute them with your
own AI API keys (**BYOK**). No server, database, GCS, or billing required — the
self-hosted experience, like n8n.

```bash
npx iris-flow
```

This starts a local Fastify server (default `http://127.0.0.1:4747`), opens your
browser, and runs workflows entirely on your machine. Generated media is stored
on local disk.

## How it relates to the engine

`iris-engine` is server-independent: it runs node graphs against two pluggable
host ports. This package supplies the **local** implementations:

| Engine port | Cloud (Parallax) | Local (this package) |
|---|---|---|
| `WorkflowStore` | Prisma / Postgres | `LocalWorkflowStore` — JSON files on disk |
| `NodeExecutorHost` | GCS + token plans + Whisper | `createLocalNodeHost` — disk + no-op meter + BYOK Whisper |
| temp-public uploader | GCS signed URLs | local static server URL |

The engine assembly mirrors the cloud's `createWorkflowEngine`:

```ts
import { createLocalWorkflowEngine } from 'iris-host-local';

const { engine, store } = createLocalWorkflowEngine({
  dataDir: '~/.iris-flow/data',
  getPublicBaseUrl: () => 'http://localhost:4747',
});
```

## BYOK (bring your own keys) — `.env`

Keys are managed the standard way: a **`.env` file** (yours to gitignore — the
tool never writes your keys anywhere). The engine reads them from `process.env`
via `getApiKeyForProvider`; nothing passes through a host port.

Copy [`.env.example`](./.env.example) to `.env` and fill in what you use:

```dotenv
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

`.env` is loaded from the directory you run `npx iris-flow` in, or from
`~/.iris-flow/.env`. Variables already set in your environment take precedence.
Non-secret settings (port, host, data dir) can go in `~/.iris-flow/config.json`
or env vars (`PORT`, `IRIS_FLOW_HOST`, `IRIS_FLOW_DATA_DIR`).

## Storage layout

```
<dataDir>/
├── workflows/<workflowId>.json     graph + metadata + run counters
├── executions/<executionId>.json   status + per-node results + logs
├── assets/<assetId>/               generated media + meta.json sidecar
└── public/                         temp-public + storePublic media (served at /public)
```

## Editor

The browser UI is the [`iris-editor`](../iris-editor) package — a self-contained
ReactFlow SPA (palette, canvas, per-node config from the `iris-nodes` catalog,
run + live node status). The host resolves its built `dist/` and serves it at
`/`, with `/api/iris/*` on the same origin. (It's also the seed for a future
shared editor consumed by iris/web and iris/desktop.)

## Limitations (MVP)

- **ffmpeg / Sheets nodes unsupported** — `EDIT_VIDEO_MERGE`, `EDIT_VIDEO_OVERLAY`,
  `EDIT_AUDIO_SEPARATE`, `OUTPUT_SHEET_APPEND` return `NODE_NOT_SUPPORTED` (501);
  the engine intentionally carries no heavy deps. A host can add them via the
  `handlers` seam.
- **External media inputs need a tunnel** — Kling/Luma fetch input URLs from
  *their* servers, which can't reach `http://localhost`. Use a tunnel (ngrok) or
  a cloud bucket for those specific nodes. Text/image generation is unaffected.

Licensed under the [Sustainable Use License](./LICENSE.md) (fair-code).
