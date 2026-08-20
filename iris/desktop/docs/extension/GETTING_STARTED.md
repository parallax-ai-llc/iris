# Getting Started with Iris Desktop Extensions

Updated: 2026-08-20

Iris Desktop supports VS Code-style extensions: small packages that add commands, tools, panels, status bar items, and keyboard shortcuts, and interact with the app through the `iris.*` API — reading and writing canvas images, running AI image generation, making network requests, and more.

This guide walks you through the full developer loop: scaffold → develop → install locally → package → submit to the marketplace.

## How extensions run

- Each extension runs in its own **Node.js Worker Thread**, isolated from the app UI and from other extensions.
- The global `iris` object is **injected before your `activate()` function is called**, so you can reference it at module scope and inside `activate()`.
- Your bundle must be a single **ESM** file (by convention `dist/index.js`) that exports an `activate` function and, optionally, `deactivate`.
- Every capability is gated by a **deny-by-default permission model** (12 permissions). Extensions declare permissions in the manifest; what gets auto-approved depends on the extension's trust tier (`official` / `verified` / `community`). Anything not auto-approved prompts the user.
- Filesystem access is sandboxed to the extension's own install directory, and network access is proxied through the main process with private-address (SSRF) blocking.

## Quick start

The SDK ships as two npm packages:

| Package | Purpose |
|---|---|
| [`@parallax-ai/iris-extension-api`](https://www.npmjs.com/package/@parallax-ai/iris-extension-api) | TypeScript types for the `iris.*` API and the manifest |
| [`@parallax-ai/iris-extension-cli`](https://www.npmjs.com/package/@parallax-ai/iris-extension-cli) | The `iris-ext` CLI: scaffold, watch-build, package |

```bash
npm install -g @parallax-ai/iris-extension-cli

iris-ext create my-extension -p my-publisher
cd my-extension
npm install
npm run build        # one-off build → dist/index.js
```

Then open Iris Desktop, go to the **Extensions** page, and click **Install from local folder** (in the developer section of the page header), pointing at your project directory. Your extension is installed at the `community` trust tier and activated.

To iterate:

```bash
iris-ext dev         # watch mode — rebuilds dist/index.js on every change
```

There is no automatic in-app reload yet: after a rebuild, click **Install from local folder** again on the same directory — reinstalling replaces the previous installation in place.

## Project structure

`iris-ext create` scaffolds this layout:

```
my-extension/
├── iris-extension.json    # manifest (required)
├── package.json           # build scripts + dev dependencies
├── tsconfig.json
├── src/
│   └── index.ts           # source entry point
└── dist/
    └── index.js           # bundled ESM entry point (build output, required)
```

### The manifest: `iris-extension.json`

```jsonc
{
  "id": "my-publisher.my-extension",   // unique ID, "publisher.name" format
  "name": "my-extension",              // lowercase letters, digits, hyphens
  "version": "0.1.0",                  // semver
  "engineVersion": "^1.0.0",           // compatible Iris version range (optional)
  "main": "./dist/index.js",           // bundled ESM entry point
  "displayName": "My Extension",
  "description": "What the extension does",
  "publisher": "my-publisher",
  "icon": "./icon.png",                // optional

  "activationEvents": [                // when the extension activates (required, non-empty)
    "onStartup",                                  // as soon as the app starts
    "onCommand:my-publisher.my-extension.myCmd"   // when a specific command runs
  ],

  "contributes": {                     // contribution points (all optional)
    "commands": [
      { "command": "my-publisher.my-extension.myCmd", "title": "My Command", "icon": "wand" }
    ],
    "keybindings": [
      { "command": "my-publisher.my-extension.myCmd", "key": "ctrl+shift+m" }
    ],
    "settings": [
      { "id": "my-publisher.my-extension.apiKey", "type": "string", "title": "API Key", "secret": true }
    ]
  },

  "permissions": [                     // permissions the extension needs
    "commands:register",
    "image:read"
  ]
}
```

Validation rules (enforced at install time):

- `id` must match `publisher.extension-name` — lowercase letters, digits, and hyphens on both sides of the dot.
- `version` must be valid semver (e.g. `1.0.0`, `1.2.0-beta.1`).
- `activationEvents` must be a non-empty array of the events below.
- `permissions` must only contain the 12 known permissions (see [Permissions](#permissions-and-trust-tiers)).
- Unknown `contributes` keys produce warnings; known keys are `commands`, `tools`, `workflowNodes`, `panels`, `menus`, `keybindings`, `settings`.

#### Which contribution points actually do something in v1

| Key | v1 status |
|---|---|
| `commands` | works — pair each entry with `iris.commands.register()` at runtime |
| `tools` | works — pair each entry with `iris.tools.register()` at runtime |
| `keybindings` | works — bound from the manifest, no runtime call needed |
| `settings` | declared in the manifest and surfaced by the app |
| `panels` | **inert** — manifest panel declarations are not registered. Create panels at runtime with `iris.window.createPanel()` instead (this works; it needs the `ui:panel` permission) |
| `menus` | **inert** — parsed and stored, but no menu in the app renders them yet |
| `workflowNodes` | **inert** — see below |

> **`workflowNodes` is not supported in v1.** Workflows run in a separate daemon process with no bridge back to the extension host. A manifest declaring `workflowNodes` still installs, but the contribution is ignored and a warning is shown. The `workflow:register` permission and `iris.workflow.registerNode` API are reserved for a future release.

### Activation events

| Event | Activates when | v1 status |
|---|---|---|
| `onStartup` | the app starts | works |
| `onCommand:<commandId>` | that command is executed | works |
| `onTool:<toolId>` | that tool is run | works |
| `onView:<panelId>` | a panel is opened | **inert** — never fired |
| `onImageOpen` | an image is opened | **inert** — never fired |
| `onWorkflowNode:<nodeId>` | a workflow node runs | **inert** — never fired (see above) |

Only `onStartup`, `onCommand:`, and `onTool:` are dispatched in v1. The other three pass validation but never activate anything — an extension declaring only those will never start. A trailing `:*` wildcard works on the prefixed forms (e.g. `onCommand:*` activates on any command).

## The entry point

```typescript
// src/index.ts
import type { ExtensionContext } from '@parallax-ai/iris-extension-api';

export function activate(context: ExtensionContext): void {
  context.subscriptions.push(
    iris.commands.register('my-publisher.my-extension.myCmd', async () => {
      await iris.window.showMessage('Hello from my extension!', 'info');
    })
  );

  iris.log.info('My extension activated');
}

export function deactivate(): void {
  // Optional cleanup. Disposables pushed to context.subscriptions
  // are disposed automatically on deactivation.
}
```

### The `context` object

| Property | Type | Description |
|---|---|---|
| `context.subscriptions` | `Disposable[]` | Disposables pushed here are disposed automatically on deactivation |
| `context.extensionPath` | `string` | Absolute path to the extension's install directory |
| `context.extensionId` | `string` | The extension's unique ID |

### The Disposable pattern

Registration functions such as `iris.commands.register()` and `iris.tools.register()` return a `Disposable`. Push it to `context.subscriptions` and it is released automatically when the extension is deactivated:

```typescript
const disposable = iris.commands.register('id', handler);
context.subscriptions.push(disposable);
```

## TypeScript setup

```bash
npm install @parallax-ai/iris-extension-api --save-dev
```

Importing any type from the package (as in the entry-point example above) pulls in the global `iris` declaration, so the whole `iris.*` API is fully typed. The scaffolded project already includes this dependency and a working `tsconfig.json`.

Note that the build script bundles with esbuild, which does **not** typecheck — run `npm run typecheck` (`tsc --noEmit`) separately.

## CLI reference

### `iris-ext create <name>`

```bash
iris-ext create my-extension -p my-publisher [--template basic]
```

Scaffolds a new project directory `<name>` from a template (currently `basic`), substituting the extension ID, name, display name, and publisher into every file. Both `<name>` and the publisher must be lowercase letters, digits, and hyphens. If `-p/--publisher` is omitted, the placeholder `my-publisher` is used.

### `iris-ext dev`

```bash
iris-ext dev [--entry src/index.ts]
```

Watch mode: bundles the entry file to the manifest's `main` path (esbuild, ESM, `platform: node`, inline sourcemaps) and rebuilds on every change. Run it from the project root (where `iris-extension.json` lives). Without `--entry`, it looks for `src/index.{ts,tsx,mts,js,mjs}`.

Auto-reload is not available in v1 — after a rebuild, reinstall the extension from its local directory in Iris Desktop to pick up changes.

### `iris-ext package`

```bash
iris-ext package [-o output.iex]
```

Creates a `.iex` bundle (a ZIP archive) named `<id>-<version>.iex` containing:

- `iris-extension.json` — the manifest, at the ZIP root
- the directory containing the `main` entry (typically `dist/`)
- the icon file, if the manifest declares one

Build first — packaging fails if the `main` file does not exist.

## Testing locally

1. Build your extension (`npm run build` or `iris-ext dev`).
2. In Iris Desktop, open **Extensions** and click **Install from local folder** in the page header, selecting your project directory.
3. The extension installs at the `community` trust tier. Permissions above the auto-approved level prompt for user approval.
4. Check the app's developer console for `iris.log` output, and run your commands / open your panels.
5. After each rebuild, reinstall from the same folder — the previous installation is replaced (upgrade semantics), no uninstall needed.

## Permissions and trust tiers

All 12 permissions, grouped by risk level:

| Permission | Risk | Grants |
|---|---|---|
| `commands:register` | low | Register commands |
| `tools:register` | low | Add tools to the tool panel |
| `workflow:register` | low | Reserved (v1: inert) |
| `ui:panel` | low | Create webview panels |
| `image:read` | medium | Read the active canvas image, selection, and file metadata |
| `image:write` | medium | Insert image data into the canvas |
| `clipboard` | medium | Read and write the clipboard |
| `export:configure` | medium | Read and change export settings |
| `ai:execute` | high | Run AI image generation (consumes user credits) |
| `network` | high | Make HTTP requests to external services |
| `filesystem:read` | high | Read files inside the extension's install directory |
| `filesystem:write` | high | Write files inside the extension's install directory |

Auto-approval by trust tier:

| Tier | Auto-approved |
|---|---|
| `official` | all permissions |
| `verified` | low + medium |
| `community` | low only |

Everything else triggers a permission approval dialog. Locally installed extensions are always `community`. APIs not covered by any permission (e.g. `iris.window.showMessage`, `iris.storage.*`, `iris.env.*`, `iris.log.*`, `iris.commands.execute`) work without a grant — see the [API Reference](./API_REFERENCE.md) for the per-method permission table.

## Publishing to the marketplace

1. Package your extension: `iris-ext package` → `<id>-<version>.iex`.
2. In Iris Desktop's **Extensions** page, open the submission modal and register your extension's metadata (name, description, category, etc.).
3. In the same flow, upload the `.iex` bundle (multipart field `bundle`, **50 MB maximum**). The server inspects the bundle and verifies its manifest matches the registered extension.
4. Submissions are reviewed by an administrator. Once approved, the extension moves from `pending` to `active` and appears in the store for installation.
5. **Updates are manual.** When you publish a new version, users see an **Update** button on the extension card in the store; clicking it re-downloads and reinstalls. There is no automatic update.

## Example extensions

29 example extensions live in [`extensions/examples/`](../../extensions/examples/) in this repository, covering every API namespace — from a minimal `image-info` command to AI-driven tools (`ai-captioner`, `smart-crop`, `bg-suggester`), panel-heavy UIs (`dark-themes`, `exif-viewer`, `font-preview`), filesystem tools (`batch-renamer`, `batch-export`), and network integration (`cloud-uploader`).

Build them all from the repository root:

```bash
pnpm --filter iris-desktop build:examples
```

Each example directory is itself installable via **Install from local folder** once built — they are the fastest way to see a working pattern for a specific API.

## Known limitations (v1)

- **Custom workflow nodes do not execute** — `workflowNodes` contributions are ignored with a warning; `iris.workflow.registerNode` is reserved.
- **`contributes.menus` and `contributes.panels` are inert** — menu entries are stored but never rendered, and manifest-declared panels are not registered. Create panels at runtime with `iris.window.createPanel()`. `keybindings` and `commands` work as declared.
- **`onView:` and `onImageOpen` never fire** — only `onStartup`, `onCommand:`, and `onTool:` activate an extension.
- **No auto-reload** during development — reinstall from the local folder after each rebuild.
- **No automatic updates** for installed extensions — updates are user-initiated from the store.
- **`iris.ai.executeModel` supports image generation only** (see the API Reference).
- **Panels run in an opaque-origin sandbox** — inline scripts and styles work, but remote resources, `fetch`/`XHR`, storage APIs, and access to the parent page are all blocked, and there is no message path from a panel back to the extension. Do network work in the extension (`iris.network.fetch`) and pass finished HTML to `createPanel`. Copy buttons calling `navigator.clipboard.writeText()` **do** work — the frame is granted `clipboard-write` — provided the call runs in a user-gesture handler while the window is focused; clipboard *reads* still need `iris.clipboard.read()` from the extension.
- **Files written with `iris.fs` are wiped on upgrade** — the install directory is replaced. Persist user data with `iris.storage`, which lives outside the install directory.

## Next steps

- [API Reference](./API_REFERENCE.md) — every `iris.*` namespace, signature, and required permission.
