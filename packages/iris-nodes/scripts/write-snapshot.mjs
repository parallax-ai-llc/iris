#!/usr/bin/env node
// Emit dist/snapshot.json by importing the built ESM bundle.
// Runs after `tsc` build; reads its own package version from package.json.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));

// Windows requires a file:// URL for dynamic imports of absolute paths.
const snapshotUrl = pathToFileURL(join(pkgRoot, 'dist/snapshot.js')).href;
const { buildSnapshot } = await import(snapshotUrl);
const snapshot = buildSnapshot(pkgJson.version);

const outDir = join(pkgRoot, 'dist');
mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, 'snapshot.json');
writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

const nodeCount = Object.keys(snapshot.nodes).length;
console.log(`iris-nodes: wrote ${nodeCount} nodes to dist/snapshot.json (version ${snapshot.version})`);
