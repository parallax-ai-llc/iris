# iris-nodes

Single source of truth for Parallax Iris workflow node definitions — node
types, port specs, config field schemas, and LLM prompt fragments.

Consumed directly by TS/JS workspaces (iris/, iris-desktop/, server/, llm/)
and via codegen by non-TS SDKs (sdk-py, sdk-go).

## Layout

```
src/
├── types.ts                 NodeDefinition, ConfigFieldDefinition, HeaderEntry, PortDefinition
├── constants.ts             ASPECT_RATIO_OPTIONS, CAMERA_ANGLE_OPTIONS, TTS_VOICE_OPTIONS
├── nodes/
│   ├── trigger.ts           TRIGGER_MANUAL, TRIGGER_SCHEDULE, ...
│   ├── generator.ts         GEN_TEXT_TO_TEXT, GEN_TEXT_TO_IMAGE, ...
│   ├── analyzer.ts          ANALYZE_*
│   ├── editor.ts            EDIT_*
│   ├── utility.ts           UTIL_*
│   └── output.ts            OUTPUT_*
├── prompt.ts                renderCategorizedNodePrompts() — LLM markdown generator
├── snapshot.ts              buildSnapshot() — language-agnostic JSON export
└── index.ts                 Public API
```

## Adding or modifying a node

1. Edit the relevant file under `src/nodes/`.
2. If new, also add the export to `src/index.ts` (and to each consumer's
   `ENABLED_NODE_TYPES` list if the node should appear in the UI palette).
3. Rebuild:

```bash
pnpm --filter iris-nodes build
```

Build steps:
- `tsc` compiles `src/` → `dist/`
- `scripts/write-snapshot.mjs` writes `dist/snapshot.json` from the built bundle

4. TS/JS consumers see the change immediately on next typecheck.
5. To propagate to non-TS SDKs, re-run their codegen scripts (see below).

## Consumers

### TS/JS (via workspace dependency `iris-nodes: workspace:*`)
- `iris/` — adapts each definition with a Lucide icon
- `iris-desktop/` — adapts each definition with a Lucide icon
- `server/` — derives `NODE_TYPE_CATEGORY` and `NODE_DEFAULT_PORTS`
- `llm/` — renders the workflow-generation system prompt from the catalog

### Non-TS SDKs (via codegen from `dist/snapshot.json`)
- `sdk-py/scripts/generate_iris_nodes.py` → `sdk-py/src/parallax_ai/iris_nodes.py`
- `sdk-go/scripts/gen-iris-nodes/main.go` → `sdk-go/types/iris_nodes.go`

Run after `pnpm --filter iris-nodes build`:

```bash
cd sdk-py && python scripts/generate_iris_nodes.py
cd sdk-go && go run scripts/gen-iris-nodes/main.go
```

Generated files are committed so end users don't need a Node.js toolchain.

## Why the `iconName: string` indirection?

Each UI app uses a different icon library (Lucide in web/desktop, native
icons in RN). The catalog stores the symbolic icon name only; each app maps
it to its own component via a small local `ICON_MAP`.

This keeps `iris-nodes` free of React/UI dependencies, so it can be imported
by the server, the LLM service, and the Python/Go SDKs too.
