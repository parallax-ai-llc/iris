#!/usr/bin/env node
/**
 * Stage the `iris-flow` npm package into `.npm-dist/`.
 *
 * The workspace package stays `iris-host-local` (iris/desktop depends on it by
 * that name). What goes to npm is a single self-contained CLI:
 *
 *   - `dist/cli.js`  — esbuild bundle of src/cli.ts with the workspace packages
 *                      (iris-nodes, iris-engine) inlined; third-party deps stay
 *                      external and are listed in the generated package.json.
 *   - `web/`         — the built iris-editor SPA (server.ts falls back to this
 *                      dir when the iris-editor package is not installed).
 *   - README.md, LICENSE.md, .env.example
 *
 * Prerequisite: `pnpm build:packages` (iris-nodes/iris-engine dist + editor dist).
 * Publish: `npm publish packages/iris-host-local/.npm-dist` (the user's terminal).
 */
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.resolve(pkgDir, '..');
const outDir = path.join(pkgDir, '.npm-dist');

const WORKSPACE_DEPS = new Set(['iris-nodes', 'iris-engine', 'iris-editor']);

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const exists = (p) => fs.access(p).then(() => true, () => false);

const hostPkg = await readJson(path.join(pkgDir, 'package.json'));

// Third-party runtime deps of everything we inline.
const dependencies = {};
for (const name of ['iris-host-local', 'iris-engine', 'iris-nodes']) {
  const pkg = await readJson(path.join(packagesDir, name, 'package.json'));
  for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
    if (WORKSPACE_DEPS.has(dep) || range.startsWith('workspace:')) continue;
    if (dependencies[dep] && dependencies[dep] !== range) {
      throw new Error(`Conflicting ranges for ${dep}: ${dependencies[dep]} vs ${range}`);
    }
    dependencies[dep] = range;
  }
}

for (const required of [
  path.join(packagesDir, 'iris-nodes', 'dist', 'index.js'),
  path.join(packagesDir, 'iris-engine', 'dist', 'index.js'),
  path.join(packagesDir, 'iris-editor', 'dist', 'index.html'),
]) {
  if (!(await exists(required))) {
    throw new Error(`Missing ${path.relative(packagesDir, required)} — run \`pnpm build:packages\` first.`);
  }
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(pkgDir, 'src', 'cli.ts')],
  outfile: path.join(outDir, 'dist', 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: Object.keys(dependencies),
  // Inlined CommonJS (if any) still needs `require` in an ES module bundle.
  banner: {
    js: "import { createRequire as __irisCreateRequire } from 'node:module'; const require = __irisCreateRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'warning',
});

await fs.cp(path.join(packagesDir, 'iris-editor', 'dist'), path.join(outDir, 'web'), { recursive: true });
for (const file of ['README.md', 'LICENSE.md', '.env.example']) {
  await fs.copyFile(path.join(pkgDir, file), path.join(outDir, file));
}

const manifest = {
  name: 'iris-flow',
  version: hostPkg.version,
  description: hostPkg.description,
  license: 'SEE LICENSE IN LICENSE.md',
  author: 'Parallax AI LLC',
  homepage: 'https://github.com/parallax-ai-llc/iris#readme',
  repository: {
    type: 'git',
    url: 'git+https://github.com/parallax-ai-llc/iris.git',
    directory: 'packages/iris-host-local',
  },
  bugs: { url: 'https://github.com/parallax-ai-llc/iris/issues' },
  keywords: ['iris', 'workflow', 'automation', 'ai', 'node-editor', 'byok', 'self-hosted', 'fair-code'],
  type: 'module',
  bin: { 'iris-flow': './dist/cli.js' },
  files: ['dist', 'web', 'README.md', 'LICENSE.md', '.env.example'],
  engines: { node: '>=20' },
  dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
};
await fs.writeFile(path.join(outDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Staged iris-flow@${manifest.version} in ${path.relative(process.cwd(), outDir) || '.'}`);
