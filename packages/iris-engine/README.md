# iris-engine

Server-independent execution engine for **Iris automation workflows**.

The same engine is meant to power three hosts:

| Host | Status | Store | Storage | Secrets (API keys) | Usage/billing |
|------|--------|-------|---------|--------------------|---------------|
| **Parallax cloud** (closed) | shipping today (in `core/server`) | Prisma / Postgres | Google Cloud Storage | server env | token plans |
| **iris-host-local** (open, fair-code) | planned | JSON files on disk | local disk | **BYOK** — your own keys via `.env` / settings UI | none (no-op) |
| **iris/desktop** (open, fair-code) | future | Electron main process | local disk | OS keychain | none |

This is the n8n model: the **engine + node catalog + editor are public (fair-code)**;
the **multi-tenant hosting** (database, billing, scheduler, webhooks infra) stays
proprietary in `core/server`.

## Why this package exists

Iris's workflow execution engine (~9.6k LOC) currently lives inside the Fastify
server and is woven into four server-only systems:

1. **Prisma** — workflow/execution persistence
2. **StorageService (GCS)** — media read/write
3. **TokenService** — per-user billing & quota
4. **API keys** — read from server env (no BYOK)

To let anyone run workflows locally with their own AI keys, those four couplings
are replaced by **host ports** (`src/ports.ts`). The engine depends only on the
ports; each host plugs in its own implementation.

## Architecture

```
            ┌─────────────────────────────────────────────┐
            │                 iris-engine                  │
            │  graph traversal · node executor · adapters  │
            │      depends only on EngineHost ports        │
            └───────────────┬─────────────────────────────┘
                            │ implements
        ┌───────────────────┼────────────────────────┐
        ▼                   ▼                         ▼
  Prisma/GCS/token   JSON file / disk / BYOK    Electron main / keychain
  (Parallax cloud)   (iris-host-local, OSS)     (iris/desktop, future)
```

The ports (`EngineHost`):

- `WorkflowStore` — load workflows; persist executions, node results, logs
- `MediaStorage` — read/write binary media
- `SecretProvider` — resolve a provider's API key (**the BYOK seam**)
- `UsageMeter` — pre-check + post-record AI usage (**the billing seam**)
- `EngineEventSink` / `EngineLogger` — progress + diagnostics

## What's in here

The engine owns the full execution path, decoupled from any host:

- **Types & errors** (`src/types.ts`, `src/errors.ts`, `src/app-error.ts`) —
  node/asset/execution types as string-literal unions (no `@prisma/client`
  coupling).
- **Graph traversal** (`src/graph-traverser.ts`) — structural graph validation
  + topological execution order.
- **Node executor** (`src/node-executor.ts`) — dispatches every node type
  against the `NodeExecutorHost` port.
- **Workflow engine** (`src/workflow-engine.ts`) — orchestrates a run against
  the `WorkflowStore` port; emits progress events.
- **Provider adapters** (`src/providers/`) — adapters for the supported AI
  providers, dependency-light (raw `fetch`, no provider SDKs).

The engine is intentionally **dependency-light** and ESM-only. Each host
(`iris-host-local`, `iris/desktop`, the Parallax cloud) supplies its own
implementation of the ports.

## Status

Stable. The engine, node executor, workflow engine, and all provider adapters
live in this package and power the local web app (`iris-host-local`) and the
desktop app today.
