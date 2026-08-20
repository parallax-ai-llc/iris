#!/usr/bin/env node
/**
 * Build & validate the example extensions.
 *
 * For each example directory (containing iris-extension.json):
 *   1. Typecheck all example sources with the shared tsconfig.examples.json.
 *   2. Bundle src/index.ts -> dist/index.js with esbuild (ESM, platform=node).
 *      The app's ExtensionManager writes `{"type":"module"}` into the install
 *      directory at install time, so the bundle only has to be valid ESM.
 *   3. Validate the manifest + entry file with the real manifestValidator
 *      from electron/extensions (bundled on the fly and imported).
 *   4. Load-check: import the built bundle as ESM (same file:// URL load the
 *      extension host worker performs) and assert it exports activate().
 *
 * Usage:
 *   node build-examples.mjs              # build + validate all examples
 *   node build-examples.mjs grid-overlay # build + validate specific example(s)
 *   node build-examples.mjs --skip-typecheck grid-overlay
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const examplesDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(examplesDir, '..', '..');

const print = (line = '') => process.stdout.write(`${line}\n`);

// ─── Resolve target examples ───

const args = process.argv.slice(2);
const skipTypecheck = args.includes('--skip-typecheck');
const requested = args.filter((a) => !a.startsWith('--'));

const allExamples = readdirSync(examplesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(path.join(examplesDir, e.name, 'iris-extension.json')))
  .map((e) => e.name)
  .sort();

let targets = allExamples;
if (requested.length > 0) {
  const unknown = requested.filter((name) => !allExamples.includes(name));
  if (unknown.length > 0) {
    console.error(`Unknown example(s): ${unknown.join(', ')}`);
    console.error(`Available: ${allExamples.join(', ')}`);
    process.exit(1);
  }
  targets = requested;
}

/** @type {{ name: string; ok: boolean; errors: string[]; warnings: string[] }[]} */
const results = targets.map((name) => ({ name, ok: true, errors: [], warnings: [] }));
const resultOf = (name) => results.find((r) => r.name === name);

// ─── 1. Typecheck (all examples share one tsconfig — always checked together) ───

if (!skipTypecheck) {
  print('Typechecking examples (tsc --noEmit)...');
  const tscBin = path.join(
    path.dirname(require.resolve('typescript/package.json')),
    'bin',
    'tsc'
  );
  const tsc = spawnSync(
    process.execPath,
    [tscBin, '-p', path.join(examplesDir, 'tsconfig.examples.json')],
    { cwd: examplesDir, encoding: 'utf-8' }
  );
  if (tsc.status !== 0) {
    const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();
    print(output);
    // Attribute errors to the example(s) they belong to; unattributable
    // errors fail the whole run.
    let attributed = false;
    for (const r of results) {
      if (output.includes(`${r.name}/src/`)) {
        r.ok = false;
        r.errors.push('TypeScript errors (see tsc output above)');
        attributed = true;
      }
    }
    if (!attributed) {
      console.error('Typecheck failed outside any targeted example.');
      process.exit(1);
    }
  } else {
    print('Typecheck passed.');
  }
}

// ─── 2. Bundle each example with esbuild ───

for (const r of results) {
  const entry = path.join(examplesDir, r.name, 'src', 'index.ts');
  if (!existsSync(entry)) {
    r.ok = false;
    r.errors.push('Missing src/index.ts');
    continue;
  }
  try {
    await build({
      entryPoints: [entry],
      outfile: path.join(examplesDir, r.name, 'dist', 'index.js'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node18',
      logLevel: 'silent',
    });
  } catch (err) {
    r.ok = false;
    const messages = err?.errors?.map((e) => e.text) ?? [String(err?.message ?? err)];
    r.errors.push(...messages.map((m) => `esbuild: ${m}`));
  }
}

// ─── 3. Validate manifests with the real manifestValidator ───

const validatorSrc = path.join(desktopDir, 'electron', 'extensions', 'manifestValidator.ts');
const tempDir = mkdtempSync(path.join(tmpdir(), 'iris-example-build-'));
let loadManifest;
try {
  const validatorOut = path.join(tempDir, 'manifestValidator.mjs');
  await build({
    entryPoints: [validatorSrc],
    outfile: validatorOut,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
  });
  ({ loadManifest } = await import(pathToFileURL(validatorOut).href));

  for (const r of results) {
    const validation = loadManifest(path.join(examplesDir, r.name));
    if (!validation.valid) {
      r.ok = false;
      r.errors.push(...validation.errors.map((e) => `manifest: ${e}`));
    }
    r.warnings.push(...validation.warnings.map((w) => `manifest: ${w}`));
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

// ─── 4. Load-check each built bundle (mirrors the worker's ESM import) ───

for (const r of results) {
  const entry = path.join(examplesDir, r.name, 'dist', 'index.js');
  if (!existsSync(entry)) continue;
  try {
    const mod = await import(pathToFileURL(entry).href);
    if (typeof mod.activate !== 'function') {
      r.ok = false;
      r.errors.push('load: bundle does not export an activate() function');
    }
    if (typeof mod.deactivate !== 'function') {
      r.warnings.push('load: bundle does not export deactivate()');
    }
  } catch (err) {
    r.ok = false;
    r.errors.push(`load: ESM import failed — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Summary ───

print();
print('Example build results');
print('─'.repeat(60));
for (const r of results) {
  print(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name}`);
  for (const e of r.errors) print(`        error: ${e}`);
  for (const w of r.warnings) print(`        warn:  ${w}`);
}
print('─'.repeat(60));

const failed = results.filter((r) => !r.ok);
print(`${results.length - failed.length}/${results.length} examples built and validated.`);
if (failed.length > 0) {
  console.error(`Failed: ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
