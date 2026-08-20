# `iris.*` API Reference

Updated: 2026-08-20

Complete reference for the API available to Iris Desktop extensions. New to extensions? Start with [Getting Started](./GETTING_STARTED.md).

The global `iris` object is injected into your extension's worker **before** `activate()` is called, so it is safe to use at module scope. Full TypeScript types ship in [`@parallax-ai/iris-extension-api`](https://www.npmjs.com/package/@parallax-ai/iris-extension-api).

## How calls work

Every method that returns a `Promise` is forwarded from your Worker Thread to the app's main process, where a permission check runs before the handler executes. Calls that lack the required permission reject with an error. A few methods (`register`, `setStatusBarItem`) are handled locally in the worker and return a `Disposable` synchronously.

Several APIs are ultimately served by the app's UI layer. If no editor window is available, they resolve to a neutral value (`null` / `[]` / no-op) rather than rejecting, and each has a timeout — noted per method below.

## Permission summary

| Namespace / method | Permission |
|---|---|
| `iris.commands.register` | `commands:register` |
| `iris.commands.execute` | — |
| `iris.tools.register` | `tools:register` |
| `iris.workflow.registerNode` | `workflow:register` (inert in v1) |
| `iris.window.showMessage` / `showInputBox` / `setStatusBarItem` | — |
| `iris.window.createPanel` | `ui:panel` |
| `iris.storage.get` / `set` / `delete` | — |
| `iris.image.getActive` / `getSelection` / `getActiveFileInfo` / `onDidChangeActive` | `image:read` |
| `iris.image.putImage` | `image:write` |
| `iris.ai.executeModel` | `ai:execute` |
| `iris.ai.getAvailableModels` | — |
| `iris.network.fetch` | `network` |
| `iris.clipboard.read` / `write` | `clipboard` |
| `iris.fs.readFile` / `listDirectory` / `stat` | `filesystem:read` |
| `iris.fs.writeFile` / `rename` | `filesystem:write` |
| `iris.export.getPresets` | — |
| `iris.export.applyPreset` / `getSettings` / `updateSettings` | `export:configure` |
| `iris.env.*`, `iris.log.*`, `iris.context.*` | — |

Any API name not in this table is rejected by the permission enforcer (deny by default).

---

## 1. `iris.commands`

Register and invoke commands.

### `register(commandId, handler): Disposable`

```typescript
const disposable = iris.commands.register('my-publisher.my-ext.doSomething', async (...args) => {
  return 'result';
});
context.subscriptions.push(disposable);
```

| Parameter | Type | Description |
|---|---|---|
| `commandId` | `string` | Unique command ID |
| `handler` | `(...args: unknown[]) => Promise<unknown> \| unknown` | Command implementation |
| **Returns** | `Disposable` | Unregisters the command |
| **Permission** | `commands:register` | |

The handler runs inside your extension's worker. Commands declared in the manifest's `contributes.commands` show up in the app UI; registering the same ID at runtime is what makes them executable.

### `execute(commandId, ...args): Promise<unknown>`

Executes a registered command — including one owned by another extension — and resolves with its return value.

```typescript
const result = await iris.commands.execute('other-publisher.other-ext.someCommand', arg1, arg2);
```

| **Permission** | none |
|---|---|

---

## 2. `iris.tools`

Contribute custom tools to the tool panel.

### `register(toolDef, handler): Disposable`

```typescript
context.subscriptions.push(
  iris.tools.register(
    {
      id: 'my-publisher.my-ext.myTool',
      name: 'My Tool',
      category: 'ai_tools',
      icon: 'sparkles',
      description: 'An AI-powered tool',
    },
    async (params) => {
      return { ok: true };
    }
  )
);
```

| Field | Type | Required |
|---|---|---|
| `id` | `string` | yes |
| `name` | `string` | yes |
| `category` | `string` | yes |
| `icon` | `string` | no |
| `description` | `string` | no |

| **Permission** | `tools:register` |
|---|---|

---

## 3. `iris.workflow`

> **Not supported in Iris Desktop v1.** Workflows execute in a separate daemon process with no bridge back to the extension host. `workflowNodes` manifest contributions are ignored with a warning, and runtime `registerNode` contributions are dropped by the extension manager. The API and the `workflow:register` permission exist so that manifests remain forward-compatible; do not build an extension that depends on custom node execution yet.

### `registerNode(nodeDef, executor): Disposable`

Signature (reserved):

```typescript
iris.workflow.registerNode(
  {
    id: 'my-publisher.my-ext.customNode',
    name: 'Custom Node',
    category: 'transform',
    inputs: [{ id: 'image', type: 'image' }],
    outputs: [{ id: 'result', type: 'image' }],
  },
  async (inputs, config) => ({ result: inputs.image })
);
```

| **Permission** | `workflow:register` |
|---|---|

---

## 4. `iris.window`

Notifications, dialogs, panels, and the status bar.

### `showMessage(message, type?): Promise<void>`

Shows a toast notification, prefixed with your extension ID.

```typescript
await iris.window.showMessage('Done!', 'info');   // 'info' | 'warn' | 'error', default 'info'
```

| **Permission** | none |
|---|---|

The promise resolves as soon as the request is dispatched — it does not wait for the toast to be dismissed.

### `showInputBox(options): Promise<string | undefined>`

Shows a single-line input dialog. Resolves with the entered string, or `undefined` if the user cancels.

```typescript
const value = await iris.window.showInputBox({
  prompt: 'Enter your name',
  value: 'default value',        // optional initial value
  placeholder: 'Type here...',   // optional
});

if (value === undefined) {
  // cancelled
}
```

| **Permission** | none |
|---|---|

Only one input box can be open at a time — a second request while one is open resolves immediately with `undefined`. Unanswered requests resolve with `undefined` after 60 seconds.

### `createPanel(html, options?): Promise<string>`

Creates a webview panel rendering the given HTML and resolves with the new panel's ID.

```typescript
const panelId = await iris.window.createPanel(
  '<div style="padding:16px"><h1>Hello</h1></div>',
  { title: 'My Panel', location: 'sidebar' }   // 'sidebar' | 'bottom' | 'floating', default 'sidebar'
);
```

| **Permission** | `ui:panel` |
|---|---|

#### Panel sandbox — what your HTML can and cannot do

Your HTML is delivered through the iframe's `srcdoc` with `sandbox="allow-scripts"` and `allow="clipboard-write"` — deliberately **without** `allow-same-origin`, so the panel runs in an **opaque origin**. An inline Content-Security-Policy is injected into the document:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; media-src data: blob:;
connect-src 'none'; form-action 'none'; frame-src 'none'
```

What this means in practice:

| Works | Does not work |
|---|---|
| Inline `<script>` and inline event handlers (`onclick="…"`) | External scripts, stylesheets, or fonts loaded from any URL |
| Inline `<style>` and `style="…"` attributes | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` (`connect-src 'none'`) |
| `data:` and `blob:` images, fonts, and media | Remote images (`https://…`), nested `<iframe>`, form submission |
| `navigator.clipboard.writeText()` (see below) | `localStorage` / `sessionStorage` / `indexedDB` — an opaque origin has no storage access |
| In-page JavaScript state | `parent` / `top` property access — blocked by the origin check |
| Reading and mutating the panel's own DOM | Popups, modals, top-level navigation, form posts — those sandbox flags are not granted |

#### Copying to the clipboard from a panel

**`navigator.clipboard.writeText()` works inside a panel.** The iframe carries `allow="clipboard-write"`, which delegates that single Permissions Policy feature to the frame; without it, the frame's policy for `clipboard-write` evaluates to `false` and every copy button fails with `NotAllowedError`. Delegating the feature does **not** weaken the sandbox — the frame still has `sandbox="allow-scripts"` with no `allow-same-origin`, so `document.origin` remains `"null"` and none of the restrictions in the table above are relaxed.

```html
<button onclick="navigator.clipboard.writeText('#3b82f6')">Copy</button>
```

The usual browser rules still apply: the write must happen in a user-gesture handler, and the document must be focused. Calling it while the app window is in the background rejects with `NotAllowedError: Document is not focused` — a focus problem, not a policy denial, so handle the rejection instead of assuming the permission is missing.

Reading the clipboard from a panel is not available (`clipboard-read` is not delegated).

`iris.clipboard` is a separate facility, not a workaround for the above: it runs in your extension worker under the `clipboard` permission, works without any panel or user gesture, and can both `read()` and `write()`. Use the panel API for in-panel copy buttons, and `iris.clipboard` for clipboard work driven by commands, tools, or background logic.

One more thing to plan around: **fetch data in the extension, not in the panel.** Call `iris.network.fetch()` (needs the `network` permission) and render the result into the HTML you pass to `createPanel`.

Panels are **display-only in v1**: `postMessage` from the panel is not blocked by the sandbox, but nothing in the app listens for panel messages, so there is no path from panel scripts back to your extension. Update a panel by calling `createPanel` again with new HTML.

### `setStatusBarItem(text, options?): Disposable`

Shows an item in the status bar.

```typescript
const item = iris.window.setStatusBarItem('Ready', {
  tooltip: 'Extension is ready',
  priority: 10,   // higher priority sorts first
});
context.subscriptions.push(item);
```

| **Permission** | none |
|---|---|

Each extension gets **one** status bar slot — calling `setStatusBarItem` again replaces your previous item rather than adding a second one.

---

## 5. `iris.storage`

Per-extension persistent key-value storage. Values are JSON-serialized; each extension has its own isolated store.

```typescript
await iris.storage.set('myKey', { count: 42, items: ['a', 'b'] });
const data = await iris.storage.get('myKey');   // { count: 42, items: ['a', 'b'] }
await iris.storage.delete('myKey');
```

| Method | Description | Permission |
|---|---|---|
| `get(key)` | Returns the stored value, or `null` when absent | none |
| `set(key, value)` | Stores a JSON-serializable value | none |
| `delete(key)` | Removes the key | none |

Storage lives in the app's user-data directory, under `extensions/.storage/<extensionId>.json` (for example `%APPDATA%\Iris\extensions\.storage\` on Windows, `~/Library/Application Support/Iris/extensions/.storage/` on macOS).

---

## 6. `iris.image`

Read and write the active canvas image.

### `getActive(): Promise<ImageData | null>`

Returns the composited pixels of the active editor tab.

```typescript
const image = await iris.image.getActive();
if (image) {
  iris.log.info(`${image.width}x${image.height}, ${image.data.length} bytes`);
}
```

| **Returns** | `{ width: number; height: number; data: Uint8Array } \| null` (RGBA) |
|---|---|
| **Permission** | `image:read` |

Resolves with `null` when no image is open, no editor window exists, or the request times out (10 s).

### `putImage(imageData): Promise<void>`

Adds the given RGBA pixels to the canvas **as a new layer** named "Extension".

```typescript
await iris.image.putImage({ width: 100, height: 100, data: rgbaBuffer });
```

| **Permission** | `image:write` |
|---|---|

Fire-and-forget: the promise resolves once the request is dispatched, not when the layer has been added. `data.length` must equal `width * height * 4` or the write is silently ignored.

### `getSelection(): Promise<SelectionRect | null>`

```typescript
const sel = await iris.image.getSelection();
if (sel) iris.log.info(`${sel.x},${sel.y} ${sel.width}x${sel.height}`);
```

| **Returns** | `{ x, y, width, height } \| null` |
|---|---|
| **Permission** | `image:read` |

`null` when there is no active selection (or after a 5 s timeout).

### `getActiveFileInfo(): Promise<ImageFileInfo | null>`

File information and metadata for the active image.

```typescript
const info = await iris.image.getActiveFileInfo();
if (info) {
  info.filePath;   // string | null — null for cloud/library assets
  info.fileName;   // 'photo.jpg'
  info.format;     // 'jpeg'
  info.fileSize;   // bytes
  info.mimeType;   // 'image/jpeg'
  info.width;      // canvas width
  info.height;     // canvas height
  info.metadata;   // Record<string, unknown> — asset metadata (EXIF when present)
}
```

| **Returns** | `ImageFileInfo \| null` |
|---|---|
| **Permission** | `image:read` |

`filePath` is `null` for assets that live in the cloud library rather than on disk, and `metadata` is `{}` when the asset carries none — do not assume EXIF is present.

### `onDidChangeActive(callback): Disposable`

> **Inert in v1.** The subscription is registered inside your worker, but nothing currently emits the `image:didChangeActive` event, so the callback never fires. Poll `getActive()` / `getActiveFileInfo()` from a command instead.

```typescript
context.subscriptions.push(
  iris.image.onDidChangeActive((image) => {
    // not called in v1
  })
);
```

| **Permission** | `image:read` |
|---|---|

---

## 7. `iris.ai`

Run AI models through the user's Parallax account.

### `executeModel(provider, params): Promise<unknown>`

> **Image generation only.** In v1 this call is routed to the app's image-generation pipeline. `provider` is the **model identifier** to generate with, and `params.prompt` is required — the call rejects without it. Chat/vision/captioning-style requests are not supported; there is no text-completion path.

```typescript
const asset = await iris.ai.executeModel('<model-id>', {
  prompt: 'A watercolor mountain landscape',
  negativePrompt: 'blurry',              // optional
  aspectRatio: '16:9',                   // optional
  resolution: '1024x1024',               // optional
  referenceAssetId: '<asset-id>',        // optional — image-to-image from a library asset
  referenceImageBase64: '<base64>',      // optional — image-to-image from raw data
  imageStrength: 0.6,                    // optional — number
  name: 'My generation',                 // optional
});
```

Resolves with the finished asset once generation completes (the call polls until the asset is ready). It rejects if the request fails, if generation does not finish, or after the main-process timeout of 120 seconds.

| **Permission** | `ai:execute` — consumes the user's credits |
|---|---|

Pick `provider` from `getAvailableModels()`; models whose `imageGeneration` flag is false will not produce a result.

### `getAvailableModels(): Promise<AIModelInfo[]>`

```typescript
const models = await iris.ai.getAvailableModels();
// [{ id, name, provider, ... }, ...]
```

| **Returns** | `{ id: string; name: string; provider: string }[]` |
|---|---|
| **Permission** | none |

Entries additionally carry the runtime fields `model`, `chat`, `imageGeneration`, and `videoGeneration`, which are useful for filtering to image-capable models. Resolves with `[]` when the list cannot be fetched or after a 5 s timeout.

---

## 8. `iris.network`

Outbound HTTP through a main-process proxy.

### `fetch(url, options?): Promise<FetchResponse>`

```typescript
const response = await iris.network.fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
});

response.status;    // 200
response.headers;   // Record<string, string>
response.body;      // string
```

| **Permission** | `network` |
|---|---|

**Security restrictions.** Requests to private and loopback addresses are rejected: `localhost`, `127.0.0.1`, `0.0.0.0`, `192.168.*`, `10.*`, `172.*`, the IPv6 addresses `::1`, `::`, `fe80:*`, `fc*`/`fd*`, and the cloud metadata endpoints `169.254.169.254` and `metadata.google.internal`. Response bodies are returned as text — binary downloads are not supported.

---

## 9. `iris.clipboard`

Read and write the system clipboard (text only).

```typescript
await iris.clipboard.write('Hello World');
const text = await iris.clipboard.read();
```

| **Permission** | `clipboard` |
|---|---|

`write` rejects if given a non-string value.

---

## 10. `iris.fs`

Sandboxed filesystem access. **Every path resolves relative to — and must stay inside — the extension's own install directory**; attempts to escape it reject with "Access denied".

> **Files written here do not survive an upgrade.** Installing a new version of an extension deletes and recreates the install directory, so anything `iris.fs.writeFile` put there is lost. `iris.storage` lives outside the install directory (in the app's user-data folder) and **is** preserved across upgrades — use it for user data, settings, and anything else that must persist. Treat `iris.fs` as scratch space and as a way to read files you shipped inside your bundle.

### `readFile(path): Promise<Uint8Array>`

```typescript
const data = await iris.fs.readFile('./config.json');
const text = new TextDecoder().decode(data);
```

| **Permission** | `filesystem:read` |
|---|---|

### `writeFile(path, data): Promise<void>`

```typescript
const content = new TextEncoder().encode(JSON.stringify({ key: 'value' }));
await iris.fs.writeFile('./output.json', content);
```

| **Permission** | `filesystem:write` |
|---|---|

Missing parent directories are created automatically.

### `listDirectory(path): Promise<FileEntry[]>`

```typescript
const entries = await iris.fs.listDirectory('.');
for (const entry of entries) {
  iris.log.info(`${entry.name} ${entry.isFile} ${entry.size} ${entry.modifiedAt}`);
}
```

| **Returns** | `{ name, isDirectory, isFile, size, modifiedAt }[]` |
|---|---|
| **Permission** | `filesystem:read` |

Entries whose `stat` fails still appear, with `size: 0` and an empty `modifiedAt`.

### `rename(oldPath, newPath): Promise<void>`

```typescript
await iris.fs.rename('./old-name.txt', './new-name.txt');
```

Both paths must be inside the extension directory.

| **Permission** | `filesystem:write` |
|---|---|

### `stat(path): Promise<FileStat>`

```typescript
const stat = await iris.fs.stat('./myfile.txt');
stat.size;         // bytes
stat.createdAt;    // ISO 8601 string
stat.modifiedAt;   // ISO 8601 string
stat.isFile;       // boolean
stat.isDirectory;  // boolean
```

| **Permission** | `filesystem:read` |
|---|---|

---

## 11. `iris.export`

Read and change the video export settings. These calls never start an export.

### `getPresets(): Promise<ExportPreset[]>`

```typescript
const presets = await iris.export.getPresets();
// [{ id: 'youtube', label: 'YouTube', icon, width, height, ratio, fps, format, quality, description }, ...]
```

| **Permission** | none (read-only) |
|---|---|

Resolves with `[]` when no editor window is available (10 s timeout).

### `applyPreset(presetId): Promise<void>`

```typescript
await iris.export.applyPreset('tiktok');
```

| **Permission** | `export:configure` |
|---|---|

Resolves once the renderer acknowledges (or after 10 s). An unknown preset ID is a no-op.

### `getSettings(): Promise<ExportSettings | null>`

```typescript
const settings = await iris.export.getSettings();
if (settings) {
  settings.format;      // 'mp4' | 'webm' | 'mov' | 'gif'
  settings.quality;     // 'low' | 'medium' | 'high' | 'ultra'
  settings.frameRate;   // 30
  settings.width;       // 1920
  settings.height;      // 1080
  settings.includeSubtitles;
  settings.codec;       // optional — 'h264' | 'h265' | 'prores' | 'vp9' (mp4/mov only)
}
```

| **Returns** | `ExportSettings \| null` |
|---|---|
| **Permission** | `export:configure` |

**Returns `null`** when no editor window is available or the request times out (10 s) — always null-check before reading fields.

### `updateSettings(partial): Promise<void>`

```typescript
await iris.export.updateSettings({ format: 'webm', quality: 'high', frameRate: 60 });
```

| **Permission** | `export:configure` |
|---|---|

Only the provided fields change.

---

## 12. `iris.env`

Read-only environment information. Each property is a getter returning a promise.

```typescript
const version = await iris.env.appVersion;   // '1.2.3'
const platform = await iris.env.platform;    // 'win32' | 'darwin' | 'linux'
const language = await iris.env.language;    // 'en' | 'ko' | 'ja' | ...
```

| **Permission** | none |
|---|---|

---

## 13. `iris.context`

The same object passed to `activate()`, also reachable as `iris.context`.

| Property | Type | Description |
|---|---|---|
| `subscriptions` | `Disposable[]` | Disposed automatically on deactivation |
| `extensionPath` | `string` | Absolute path to the install directory |
| `extensionId` | `string` | The extension's ID |

---

## 14. `iris.log`

Structured logging, forwarded to the app's developer console with your extension ID attached. Synchronous, no permission required.

```typescript
iris.log.debug('Debug message', { detail: 123 });
iris.log.info('Info message');
iris.log.warn('Warning message');
iris.log.error('Error message', err);
```

Extra arguments must be structured-cloneable — they cross a worker boundary.

---

## Lifecycle

```typescript
export function activate(context: ExtensionContext): void | Promise<void>
export function deactivate(): void | Promise<void>   // optional
```

- `activate` is called once, after `iris` has been injected. Throwing puts the extension into the `error` state.
- `deactivate` is called before the worker shuts down; afterwards every disposable in `context.subscriptions` is disposed and all event subscriptions are cleared.
- The bundle must be ESM. Both exports are read from the module referenced by the manifest's `main`.

## What is not available in v1

Everything below passes validation and installs without error, but has no effect at runtime — do not build a feature on it.

| Not available | Detail |
|---|---|
| Custom workflow node execution | `iris.workflow.registerNode` and `contributes.workflowNodes` — contributions are ignored with a warning |
| `contributes.menus` | Menu contributions are parsed and stored, but no menu in the app renders them. `contributes.keybindings`, by contrast, **is** wired up and works |
| `contributes.panels` | Manifest-declared panels are not registered anywhere. Creating panels at runtime with `iris.window.createPanel()` **does** work — declare the `ui:panel` permission and call the API |
| `onView:` and `onImageOpen` activation events | Validated, but nothing fires them. Only `onStartup`, `onCommand:<id>`, and `onTool:<id>` ever activate an extension |
| `iris.image.onDidChangeActive` callbacks | No event producer exists yet |
| Panel → extension messaging | Panels are display-only (see [`createPanel`](#createpanelhtml-options-promisestring)) |
| Clipboard **reads** inside panels | `navigator.clipboard.readText()` — only `clipboard-write` is delegated to the panel frame. Writes work; use `iris.clipboard.read()` from the extension for reads |
| Text/chat AI calls | `iris.ai.executeModel` covers image generation only |
| Binary `iris.network.fetch` responses | Response bodies are returned as text |
| Filesystem access outside the install directory | Rejected by the path sandbox; note that install-directory files are wiped on upgrade |
