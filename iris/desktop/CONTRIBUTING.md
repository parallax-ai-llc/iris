# Contributing to Iris Desktop

Iris Desktop is an Electron (main: `electron/`) + Vite + React 19 + Zustand (renderer: `src/`) app with four major areas: AI generation, image editing, video editing, and workflows. **Image and video editing are the easiest places to contribute** — their building blocks (filters, adjustments, effects, transitions) are modular data/function registries. Image filters and adjustments are a single-file change; video effects additionally need a type union entry (and filter effects an FFmpeg mapping) — each recipe below lists every file it touches.

## Directory map

```
src/
├── app/                    # route pages + app shell (assembly only)
├── features/
│   ├── image-editor/
│   │   ├── canvas/filters/       # image filters — one module per category
│   │   ├── canvas/adjustments/   # adjustments & canvas tools — grouped by concern
│   │   └── components/ stores/ …
│   ├── video-editor/
│   │   ├── effects/definitions/  # video effects/transitions — pure data, one module per category
│   │   ├── effects/registry.ts   # composed catalog (panel UI + FFmpeg export both read this)
│   │   └── components/ stores/ lib/ …
│   └── images/ videos/ workflows/ …   # AI generation & cloud features
├── shared/                 # code used by 2+ features only
electron/
├── ipc/<domain>.ts         # main-process handlers (FFmpeg export, files, …)
└── extensions/             # extension host (see the extension API for plugin-style contributions)
```

## Adding an image filter (single file)

1. Pick the category module in `src/features/image-editor/canvas/filters/` (`blur.ts`, `sharpen.ts`, `noise.ts`, `color.ts`, `distort.ts`, `lens.ts`, `artistic.ts`, `sketch.ts`, `stylize.ts`, `brush-strokes.ts`, `pixelate.ts`, `texture.ts`, `render.ts`, `utility.ts`, …).
2. Implement a pure function `(imageData: ImageData, ...params) => ImageData` in that file.
3. If it should appear in the Filter Gallery modal, append an entry to the same file's `*GalleryFilters` array:

```ts
export function inkWash(imageData: ImageData, strength: number = 5): ImageData {
  // ... pure pixel processing, no DOM state
}

export const artisticGalleryFilters: GalleryFilter[] = [
  // ...existing entries
  { id: 'inkWash', label: 'Ink Wash', category: 'artistic', apply: (d) => inkWash(d) },
];
```

That's it — `filters/registry.ts` composes the catalog automatically. Menu-driven filters (outside the gallery) are called directly from `components/tabs/EditorMenuBar.tsx`.

Add unit tests next to the code in `canvas/__tests__/` (the filter suite has 1,200+ examples to copy from).

## Adding an image adjustment / canvas tool

`src/features/image-editor/canvas/adjustments/` is grouped by concern:

| Module | Contents |
|---|---|
| `core.ts` | `AdjustmentValues`, LUT builders, the fused single-pass pipeline |
| `tonal.ts` / `color.ts` / `enhance.ts` | standalone adjustment functions |
| `masks.ts` | automatic selection mask generators |
| `color-modes.ts`, `compose.ts`, `document-tools.ts`, `path-tools.ts`, `type-tools.ts`, `face-tools.ts`, `history-tools.ts` | canvas/document utilities |

- A **standalone adjustment** (own dialog/panel) is one function in the matching module.
- A **slider in the main Adjust pipeline** additionally needs: a field in `AdjustmentValues` + default in the store (`stores/imageEditor.store.ts` `DEFAULT_ADJUSTMENTS`), the math inside `applyAdjustmentsToCanvas` in `core.ts` (keep it inside the single pixel pass), and a slider in `components/OptionsBar/options/AdjustOptions.tsx`.

## Adding a video effect or transition

Effect definitions are **pure data** in `src/features/video-editor/effects/definitions/` (no React/DOM imports — the Electron main process reads them too). Icons live separately in `components/effectIcons.ts` and fall back to the category icon.

**Transition** (definition + one type union entry):

```ts
// effects/definitions/transitions.ts
{
  id: 'star-wipe',
  name: 'Star Wipe',
  type: 'transition',
  description: 'Star-shaped wipe between clips',
  defaultParams: { duration: 0.5 },
  xfade: 'circlecrop',   // FFmpeg xfade transition name — REQUIRED, or export hard-cuts
},
```

Then add `'star-wipe'` to the `transitionType` union in `src/types/videoProject.types.ts`. The panel UI and the FFmpeg export pipeline (`XFADE_MAP` in `effects/registry.ts`) both pick it up from the definition.

**Filter effect**:

1. Add the definition entry (with `defaultIntensity` if it should insert at a value other than 50) to the matching module in `effects/definitions/`.
2. Add the id to the `filterType` union in `src/types/videoProject.types.ts`.
3. Implement the FFmpeg mapping: a `case` in `buildEffectFilters()` in `electron/ipc/export.ts`. Filters without a mapping are skipped at export with a `console.warn` — don't ship one.
4. Optional: preview parity in `EditorPreview.tsx` (CSS/SVG filter) — export-only effects are acceptable but should say so in `description`.

`effects/__tests__/registry.test.ts` guards invariants (unique ids, every transition has an `xfade`, legacy export names preserved) — run it after your change; a correct addition never requires editing the test.

## Rules that will fail CI if ignored

- **New files must stay under 500 lines**; don't add features to files already over 1,000 lines — split first.
- Imports across features use the `@/` alias; within a feature, relative paths. `shared/` must never import from `features/`. Modules shared with the Electron main process (e.g. `video-editor/effects/*`) must use relative imports only and stay free of DOM/React dependencies.
- No `console.log` (use `console.warn`/`console.error` where justified).

## Verify before opening a PR

```bash
pnpm --filter iris-desktop typecheck   # 0 errors
pnpm --filter iris-desktop lint        # 0 errors
pnpm --filter iris-desktop test:run    # no new failures
npx vite build                         # catches worker-URL/bundling breaks tsc can't see
```
