<div align="center">

# Iris

**Fair-code AI automation workflows — run them anywhere, with your own keys.**

Build node-graph AI workflows in your browser, then execute them locally with
your own API keys (BYOK). No server, database, or cloud account required.

</div>

---

Iris is the open, **fair-code** core of the [Parallax AI](https://parallax.kr)
workflow product. The same execution engine that powers the Parallax cloud also
runs **fully on your machine** — `npx iris-flow` launches a local web app, and
the desktop app embeds the engine for offline, BYOK execution.

This follows the [n8n](https://n8n.io) model: the **engine, node catalog, and
editor are public (fair-code)**; multi-tenant hosting (managed database, billing,
scheduling infrastructure) stays proprietary.

## Packages

| Package | What it is |
|---------|-----------|
| [`iris-nodes`](packages/iris-nodes) | Single source of truth for node definitions (types, config options, ports). |
| [`iris-engine`](packages/iris-engine) | Server-independent execution engine. Runs node graphs against pluggable host ports (storage, secrets, usage, persistence). |
| [`iris-editor`](packages/iris-editor) | The ReactFlow node-graph editor, as a framework-agnostic library consumed via an injected seam. |
| [`iris-host-local`](packages/iris-host-local) | Local host (`npx iris-flow`): JSON-file store, disk storage, BYOK secrets, no-op metering, a Fastify server + bundled editor. |
| [`iris/desktop`](iris/desktop) | Electron desktop app — embeds the engine for local workflow execution, batch, and scheduling via a background daemon. |

## Quick start — local web app

Run a local Iris server and build/execute workflows in your browser with your own
AI keys:

```bash
# from a clone of this repo
pnpm install
pnpm build:packages
pnpm iris-flow
```

Then open the printed URL (default `http://127.0.0.1:4747`). Provide your API keys
via `~/.iris-flow/config.json`, a local `iris-flow.json`, or environment variables
(see [`packages/iris-host-local`](packages/iris-host-local)).

Once published to npm you'll be able to skip the clone with:

```bash
npx iris-flow
```

## Quick start — desktop app

```bash
pnpm install
pnpm build:packages
pnpm desktop:dev
```

The desktop app stores BYOK keys encrypted in the OS keychain and runs workflows,
batch jobs, and schedules via a local background daemon that survives app close.

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
  (Parallax cloud,   (iris-host-local, OSS)     (iris/desktop, OSS)
   proprietary)
```

The engine depends only on **host ports**. Each host plugs in its own
implementation of storage, secrets (API keys), usage metering, and persistence —
so the same engine runs in the cloud, in a local web app, or in the desktop app.

## Development

This is a [pnpm workspace](https://pnpm.io/workspaces). Requires Node 20+ and
pnpm 10+ (`corepack enable`).

```bash
pnpm install          # install all workspace members
pnpm build:packages   # build iris-nodes → iris-engine → iris-editor → iris-host-local
pnpm typecheck        # typecheck every package
```

> Node definitions live **only** in `packages/iris-nodes`. After changing them,
> run `pnpm build:nodes` so consumers pick up the new `dist/`.

## License

Source-available under the **Sustainable Use License** (fair-code, the same
license used by n8n). Use, modify, and self-host for free for internal, personal,
or non-commercial purposes. You may not sell it or offer it to third parties as a
hosted/managed service. See [LICENSE.md](LICENSE.md).

For a commercial license, contact Parallax AI LLC.
